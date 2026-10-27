import { spawnSync } from 'node:child_process'
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync, type Zippable } from 'fflate'
import { createHash, randomUUID } from 'node:crypto'
import { readModContent, type SourceContent } from './content'
import type { ModManifest } from '../../assets/scripts/shared/mod'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const tsc = join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')

const [command, input, ...options] = process.argv.slice(2)

try {
    if (command === 'init') await init(requireInput(input), option(options, '--out'))
    else if (command === 'test') await test(requireInput(input))
    else if (command === 'pack') await pack(requireInput(input), option(options, '--out'), option(options, '--publish'))
    else usage(command === undefined ? 0 : 1)
} catch (error) {
    console.error(`[mod] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
}

async function init(name: string, output?: string) {
    name = requireInput(name)
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) throw new Error('Mod name must use lowercase letters, numbers, _ or -')
    const root = output ? resolve(output) : join(projectRoot, 'mods', name)
    if (await exists(root)) throw new Error(`${relative(projectRoot, root)} already exists`)
    await mkdir(join(root, 'src', 'server'), { recursive: true })
    await mkdir(join(root, 'assets', 'gameplay'), { recursive: true })
    await writeJson(join(root, 'content.json'), { gameplay: {
        plants: 'assets/gameplay/plants.json', seeds: 'assets/gameplay/seeds.json', seedCatalog: 'assets/gameplay/seed-catalog.json',
    }, resources: {} })
    await writeJson(join(root, 'assets', 'gameplay', 'plants.json'), {})
    await writeJson(join(root, 'assets', 'gameplay', 'seeds.json'), {})
    await writeJson(join(root, 'assets', 'gameplay', 'seed-catalog.json'), [])
    await writeJson(join(root, 'manifest.json'), {
        schemaVersion: 1,
        id: `local:${name}`,
        version: '0.1.0',
        apiVersion: 1,
        contentHash: `${name}-dev`,
        dependencies: [],
        gameplay: {
            nodeModule: 'gameplay/node/index.js',
            cocosModule: 'gameplay/cocos/index.js',
        },
    })
    await writeFile(join(root, 'src', 'server', 'index.ts'), `interface Context {
    host: { get(id: string): any }
    assets: { id: string; json(path: string): any }
}

export function register({ host, assets }: Context) {
    // Definition files are registered automatically from content.json.
}
`)
    console.info(`[mod] Created ${relative(projectRoot, root)}`)
}

async function pack(input: string, output?: string, publish?: string) {
    const root = await modRoot(input)
    const manifest = await manifestAt(root)
    const destination = output ? resolve(output) : join(projectRoot, 'dist', 'mods', basename(root))
    if (root === destination || root.startsWith(`${destination}${sep}`)) throw new Error('Output must not contain the Mod source directory')
    await rm(destination, { recursive: true, force: true })
    await mkdir(destination, { recursive: true })
    await cp(join(root, 'manifest.json'), join(destination, 'manifest.json'))
    for (const entry of await readdir(root, { withFileTypes: true })) {
        if (entry.isFile() && (/(?:readme|license|notice|copying)/i.test(entry.name) || entry.name === 'conversion.json')) {
            await cp(join(root, entry.name), join(destination, entry.name))
        }
    }
    const assets = join(root, 'assets'), sourceFiles = new Set<string>()
    const contentFile = join(root, 'content.json')
    const content: SourceContent = await exists(contentFile) ? readModContent(contentFile, sourceFiles) : { resources: {} }
    if (await exists(assets)) await cp(assets, join(destination, 'assets'), {
        recursive: true, filter: path => !sourceFiles.has(resolve(path)),
    })
    const runtime: { resources: SourceContent['resources']; gameplay?: string; presentation?: string } = { resources: content.resources }
    for (const name of ['gameplay', 'presentation'] as const) {
        if (content[name] !== undefined) {
            const file = `assets/${name}.json`
            await mkdir(join(destination, 'assets'), { recursive: true })
            await writeJson(join(destination, file), content[name])
            runtime[name] = file
        }
    }
    const generatedFiles = new Set([runtime.gameplay, runtime.presentation].filter(Boolean))
    const resourceFiles = new Set<string>()
    for (const entries of Object.values(content.resources)) for (const entry of Object.values(entries)) resourceFiles.add(typeof entry === 'string' ? entry : entry.file)
    for (const file of Object.values(content.resources.fonts ?? {})) {
        const config = JSON.parse(await readFile(inside(root, file), 'utf8'))
        for (const layer of config.layers) resourceFiles.add(join(dirname(file), layer.image + '.png'))
    }
    for (const file of resourceFiles) {
        if (generatedFiles.has(file)) continue
        const target = inside(destination, file)
        await mkdir(dirname(target), { recursive: true })
        await cp(inside(root, file), target)
    }
    await writeJson(join(destination, 'content.json'), runtime)
    if (manifest.gameplay) {
        const sourceRoot = join(root, 'src', 'server')
        const source = join(sourceRoot, 'index.ts')
        await requireFile(source)
        const nodeEntry = inside(destination, manifest.gameplay.nodeModule)
        const cocosEntry = inside(destination, manifest.gameplay.cocosModule)
        runTsc(source, dirname(nodeEntry), 'ES2022', sourceRoot)
        runTsc(source, dirname(cocosEntry), 'System', sourceRoot)
        await writeFile(join(dirname(nodeEntry), 'package.json'), '{\n  "type": "module"\n}\n')
        await requireFile(nodeEntry)
        await requireFile(cocosEntry)
    }
    if (manifest.client) {
        const sourceRoot = join(root, 'src', 'client')
        const source = join(sourceRoot, 'index.ts')
        const moduleEntry = inside(destination, manifest.client.module)
        await requireFile(source)
        runTsc(source, dirname(moduleEntry), 'System', sourceRoot)
        await requireFile(moduleEntry)
        if (manifest.client.bundle) await requireDirectory(inside(destination, manifest.client.bundle))
    }
    const files: Record<string, Uint8Array> = {}
    async function collect(directory: string) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const file = join(directory, entry.name)
            if (entry.isDirectory()) await collect(file)
            else files[`${basename(destination)}/${relative(destination, file).split(sep).join('/')}`] = await readFile(file)
        }
    }
    await collect(destination)
    const hash = createHash('sha256')
    const { contentHash: _contentHash, ...metadata } = manifest
    hash.update(JSON.stringify(metadata))
    const manifestKey = `${basename(destination)}/manifest.json`
    for (const path of Object.keys(files).filter(path => path !== manifestKey).sort()) {
        hash.update(path.slice(basename(destination).length + 1))
        hash.update(files[path])
    }
    manifest.contentHash = hash.digest('hex')
    await writeJson(join(destination, 'manifest.json'), manifest)
    files[manifestKey] = await readFile(join(destination, 'manifest.json'))
    const entries: Zippable = {}
    for (const [path, bytes] of Object.entries(files)) {
        entries[path] = [bytes, { level: /\.(png|mp3)$/i.test(path) ? 0 : 6 }]
    }
    await writeFile(`${destination}.zip`, zipSync(entries))
    console.info(`[mod] Packed ${manifest.id} -> ${destination}.zip`)
    if (publish) {
        const target = resolve(publish)
        await mkdir(dirname(target), { recursive: true })
        const staging = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`)
        try {
            // Resource watchers must only see a completed archive at the target path.
            await copyFile(`${destination}.zip`, staging)
            await rename(staging, target)
        } finally { await rm(staging, { force: true }) }
        console.info(`[mod] Published ${target}`)
    }
}

async function test(input: string) {
    const root = await modRoot(input)
    const manifest = await manifestAt(root)
    for (const path of runtimePaths(manifest)) {
        const file = inside(root, path)
        if (path === manifest.client?.bundle) await requireDirectory(file)
        else await requireFile(file)
    }
    const result = spawnSync(process.execPath, [
        join(projectRoot, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', join(projectRoot, 'tsconfig.server.json'),
        join(projectRoot, 'tools/mod/test.ts'), root,
    ], { cwd: projectRoot, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Mod validation failed: ${manifest.id}`)
}

function runTsc(source: string, outDir: string, module: 'ES2022' | 'System', rootDir: string) {
    const args = [
        tsc, source,
        '--target', 'ES2022',
        '--module', module,
        '--rootDir', rootDir,
        '--outDir', outDir,
        '--skipLibCheck',
    ]
    if (module === 'ES2022') args.push('--moduleResolution', 'Bundler')
    const result = spawnSync(process.execPath, args, { cwd: projectRoot, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`TypeScript ${module} build failed`)
}

async function modRoot(input: string) {
    const root = resolve(isAbsolute(input) || /[\\/]/.test(input) ? input : join(projectRoot, 'mods', input))
    await requireDirectory(root)
    return root
}

async function manifestAt(root: string): Promise<ModManifest> {
    const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'))
    if (manifest?.schemaVersion !== 1 || manifest.apiVersion !== 1 ||
        typeof manifest.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9/._-]*$/.test(manifest.id)) {
        throw new Error('Invalid manifest.json')
    }
    return manifest
}

function inside(root: string, path: string) {
    if (typeof path !== 'string' || isAbsolute(path)) throw new Error(`Invalid Mod path: ${String(path)}`)
    let decoded
    try {
        decoded = decodeURIComponent(path)
    } catch {
        throw new Error(`Invalid Mod path: ${path}`)
    }
    if (decoded.split(/[\\/]/).includes('..')) throw new Error(`Mod path escapes its root: ${path}`)
    const result = resolve(root, decoded)
    if (result !== root && !result.startsWith(`${root}${sep}`)) throw new Error(`Mod path escapes its root: ${path}`)
    return result
}

function runtimePaths(manifest: ModManifest): string[] {
    return [
        manifest.gameplay?.nodeModule,
        manifest.gameplay?.cocosModule,
        manifest.client?.module,
        manifest.client?.bundle,
    ].filter((path): path is string => Boolean(path))
}

function option(args: string[], name: string) {
    const index = args.indexOf(name)
    if (index < 0) return undefined
    if (!args[index + 1]) throw new Error(`${name} requires a value`)
    return args[index + 1]
}

async function exists(path: string) {
    return stat(path).then(() => true, () => false)
}

async function requireFile(path: string) {
    if (!await exists(path) || !(await stat(path)).isFile()) throw new Error(`Missing file: ${path}`)
}

async function requireDirectory(path: string) {
    if (!await exists(path) || !(await stat(path)).isDirectory()) throw new Error(`Missing directory: ${path}`)
}

function requireInput(value: string | undefined): string {
    if (!value) throw new Error('Mod name or directory is required')
    return value
}

function writeJson(path: string, value: unknown) {
    return writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

function usage(exitCode: number) {
    console.info(`Usage:
  npm run mod:init -- <name> [--out <directory>]
  npm run mod:test -- <packed-directory>
  npm run mod:pack -- <name-or-directory> [--out <directory>] [--publish <zip-file>]`)
    process.exitCode = exitCode
}
