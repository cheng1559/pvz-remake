import { spawnSync } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { createHash } from 'node:crypto'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tsc = join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')

const [command, input, ...options] = process.argv.slice(2)

try {
    if (command === 'init') await init(input, option(options, '--out'))
    else if (command === 'test') await test(requireInput(input))
    else if (command === 'pack') await pack(requireInput(input), option(options, '--out'))
    else usage(command === undefined ? 0 : 1)
} catch (error) {
    console.error(`[mod] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
}

async function init(name, output) {
    name = requireInput(name)
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) throw new Error('Mod name must use lowercase letters, numbers, _ or -')
    const root = output ? resolve(output) : join(projectRoot, 'mods', name)
    if (await exists(root)) throw new Error(`${relative(projectRoot, root)} already exists`)
    await mkdir(join(root, 'src', 'server'), { recursive: true })
    await mkdir(join(root, 'assets'), { recursive: true })
    await writeJson(join(root, 'assets', 'gameplay.json'), { plants: {}, seeds: {} })
    await writeJson(join(root, 'mod.json'), {
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
    host.get('content/definitions').register(assets.id, assets.json('assets/gameplay.json'))
}
`)
    console.info(`[mod] Created ${relative(projectRoot, root)}`)
}

async function pack(input, output) {
    const root = await modRoot(input)
    const manifest = await manifestAt(root)
    const destination = output ? resolve(output) : join(projectRoot, 'dist', 'mods', basename(root))
    if (root === destination || root.startsWith(`${destination}${sep}`)) throw new Error('Output must not contain the Mod source directory')
    await rm(destination, { recursive: true, force: true })
    await mkdir(destination, { recursive: true })
    await cp(join(root, 'mod.json'), join(destination, 'mod.json'))
    const assets = join(root, 'assets')
    if (await exists(assets)) await cp(assets, join(destination, 'assets'), { recursive: true })
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
    const files = {}
    async function collect(directory) {
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
    const manifestKey = `${basename(destination)}/mod.json`
    for (const path of Object.keys(files).filter(path => path !== manifestKey).sort()) {
        hash.update(path.slice(basename(destination).length + 1))
        hash.update(files[path])
    }
    manifest.contentHash = hash.digest('hex')
    await writeJson(join(destination, 'mod.json'), manifest)
    files[manifestKey] = await readFile(join(destination, 'mod.json'))
    await writeFile(`${destination}.zip`, zipSync(files))
    console.info(`[mod] Packed ${manifest.id} -> ${destination}.zip`)
}

async function test(input) {
    const root = await modRoot(input)
    const manifest = await manifestAt(root)
    for (const path of runtimePaths(manifest)) {
        const file = inside(root, path)
        if (path === manifest.client?.bundle) await requireDirectory(file)
        else await requireFile(file)
    }
    const result = spawnSync(process.execPath, [
        join(projectRoot, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', join(projectRoot, 'tsconfig.server.json'),
        join(projectRoot, 'tools/test_mod.ts'), root,
    ], { cwd: projectRoot, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Mod validation failed: ${manifest.id}`)
}

function runTsc(source, outDir, module, rootDir) {
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

async function modRoot(input) {
    const root = resolve(isAbsolute(input) || /[\\/]/.test(input) ? input : join(projectRoot, 'mods', input))
    await requireDirectory(root)
    return root
}

async function manifestAt(root) {
    const manifest = JSON.parse(await readFile(join(root, 'mod.json'), 'utf8'))
    if (manifest?.schemaVersion !== 1 || manifest.apiVersion !== 1 ||
        typeof manifest.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9/._-]*$/.test(manifest.id) ||
        (!manifest.gameplay && !manifest.client)) {
        throw new Error('Invalid mod.json')
    }
    return manifest
}

function inside(root, path) {
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

function runtimePaths(manifest) {
    return [
        manifest.gameplay?.nodeModule,
        manifest.gameplay?.cocosModule,
        manifest.client?.module,
        manifest.client?.bundle,
    ].filter(Boolean)
}

function option(args, name) {
    const index = args.indexOf(name)
    if (index < 0) return undefined
    if (!args[index + 1]) throw new Error(`${name} requires a value`)
    return args[index + 1]
}

async function exists(path) {
    return stat(path).then(() => true, () => false)
}

async function requireFile(path) {
    if (!await exists(path) || !(await stat(path)).isFile()) throw new Error(`Missing file: ${path}`)
}

async function requireDirectory(path) {
    if (!await exists(path) || !(await stat(path)).isDirectory()) throw new Error(`Missing directory: ${path}`)
}

function requireInput(value) {
    if (!value) throw new Error('Mod name or directory is required')
    return value
}

function writeJson(path, value) {
    return writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

function usage(exitCode) {
    console.info(`Usage:
  npm run mod:init -- <name> [--out <directory>]
  npm run mod:test -- <packed-directory>
  npm run mod:pack -- <name-or-directory> [--out <directory>]`)
    process.exitCode = exitCode
}
