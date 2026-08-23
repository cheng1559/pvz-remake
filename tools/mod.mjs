import { spawnSync } from 'node:child_process'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tsc = join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')

const [command, input, ...options] = process.argv.slice(2)

try {
    if (command === 'init') await init(input, option(options, '--out'))
    else if (command === 'build') await build(requireInput(input))
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
    await mkdir(join(root, 'gameplay', 'source'), { recursive: true })
    await mkdir(join(root, 'gameplay', 'node'), { recursive: true })
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
    await writeFile(join(root, 'gameplay', 'node', 'package.json'), '{\n  "type": "module"\n}\n')
    await writeFile(join(root, 'gameplay', 'source', 'index.ts'), `export interface GameplayApi {
    registerDefinition(value: { id: string; kind: string }): void
}

export function register(api: GameplayApi) {
    api.registerDefinition({ id: 'local:${name}', kind: 'mod' })
}
`)
    console.info(`[mod] Created ${relative(projectRoot, root)}`)
}

async function build(input) {
    const root = await modRoot(input)
    const manifest = await manifestAt(root)
    if (manifest.gameplay) {
        const source = join(root, 'gameplay', 'source', 'index.ts')
        await requireFile(source)
        const nodeEntry = inside(root, manifest.gameplay.nodeModule)
        const cocosEntry = inside(root, manifest.gameplay.cocosModule)
        runTsc(source, dirname(nodeEntry), 'ES2022', join(root, 'gameplay', 'source'))
        runTsc(source, dirname(cocosEntry), 'System', join(root, 'gameplay', 'source'))
        await writeFile(join(dirname(nodeEntry), 'package.json'), '{\n  "type": "module"\n}\n')
        await requireFile(nodeEntry)
        await requireFile(cocosEntry)
    }
    if (manifest.client) {
        const source = join(root, 'client', 'source', 'index.ts')
        const moduleEntry = inside(root, manifest.client.module)
        if (await exists(source)) runTsc(source, dirname(moduleEntry), 'System', join(root, 'client', 'source'))
        await requireFile(moduleEntry)
        await requireDirectory(inside(root, manifest.client.bundle))
    }
    console.info(`[mod] Built ${manifest.id}`)
    return { root, manifest }
}

async function test(input) {
    const { root, manifest } = await build(input)
    let registrations = 0
    if (manifest.gameplay) {
        const entry = inside(root, manifest.gameplay.nodeModule)
        const loaded = await import(`${pathToFileURL(entry).href}?mod-test=${Date.now()}`)
        if (typeof loaded.register !== 'function') throw new Error(`${manifest.gameplay.nodeModule} must export register(api)`)
        const register = () => { registrations++ }
        await loaded.register({
            registerDefinition: register,
            enhanceSystem: register,
            replaceSystem: register,
            registerPlantUpgrade: register,
        })
    }
    console.info(`[mod] Tested ${manifest.id} (${registrations} registrations)`)
}

async function pack(input, output) {
    const { root, manifest } = await build(input)
    const destination = output
        ? resolve(output)
        : join(projectRoot, 'dist', 'mods', root.split(sep).at(-1))
    await rm(destination, { recursive: true, force: true })
    await mkdir(destination, { recursive: true })
    await cp(join(root, 'mod.json'), join(destination, 'mod.json'))
    const copied = new Set()
    for (const path of runtimePaths(manifest)) {
        const source = inside(root, path)
        const sourceDirectory = (await stat(source)).isDirectory() ? source : dirname(source)
        const relativeDirectory = relative(root, sourceDirectory)
        if (copied.has(relativeDirectory)) continue
        copied.add(relativeDirectory)
        await cp(sourceDirectory, join(destination, relativeDirectory), { recursive: true })
    }
    console.info(`[mod] Packed ${manifest.id} -> ${destination}`)
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
  npm run mod:build -- <name-or-directory>
  npm run mod:test -- <name-or-directory>
  npm run mod:pack -- <name-or-directory> [--out <directory>]`)
    process.exitCode = exitCode
}
