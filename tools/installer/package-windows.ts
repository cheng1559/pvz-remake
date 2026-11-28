// Packs the Windows Release build twice from the same files: into an installer with Inno Setup,
// dist/pvz-remake-v<version>-windows-x64-setup.exe, and into dist/pvz-remake-v<version>-windows-x64.zip, which unpacks into
// one folder the game runs from. Run `npm run compile:windows:release` first. Finds ISCC.exe on PATH, in the usual install
// folders, or from the ISCC variable.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync, type Zippable } from 'fflate'

const release = 'build/windows/proj/Release'
const executable = 'pvz-remake.exe'
// The installer's AppName (windows.iss), which names the folder the zip unpacks into.
const appName = 'Plants vs. Zombies'
// The debug C runtime that Cocos copies next to every build.
const debugRuntime = new Set(['msvcp140d.dll', 'ucrtbased.dll', 'vcruntime140d.dll', 'vcruntime140_1d.dll'])
if (!existsSync(join(release, executable))) throw new Error(`${release}/${executable} is missing; run npm run compile:windows:release first`)

function findCompiler(): string {
    if (process.env.ISCC) return process.env.ISCC
    const folders = [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs'), process.env['ProgramFiles(x86)'], process.env.ProgramFiles]
    for (const folder of folders) {
        const candidate = folder && join(folder, 'Inno Setup 6', 'ISCC.exe')
        if (candidate && existsSync(candidate)) return candidate
    }
    // Fall back to PATH; spawning fails with ENOENT if Inno Setup is not installed.
    return 'ISCC.exe'
}

/**
 * The C++ runtime of the Visual Studio that built the game (CMake's CMAKE_GENERATOR_INSTANCE), its default x64
 * redistributable, all of it: Cocos copies an older msvcp140.dll and vcruntime140.dll and no vcruntime140_1.dll, which the
 * game, v8.dll and msvcp140.dll need, so a player without the Visual C++ runtime installed could not start the game.
 */
function cppRuntime(): string {
    const cache = readFileSync('build/windows/proj/CMakeCache.txt', 'utf8')
    const studio = /^CMAKE_GENERATOR_INSTANCE:INTERNAL=(.+)$/m.exec(cache)?.[1].trim()
    if (!studio) throw new Error('build/windows/proj/CMakeCache.txt names no Visual Studio (CMAKE_GENERATOR_INSTANCE)')
    const version = readFileSync(join(studio, 'VC/Auxiliary/Build/Microsoft.VCRedistVersion.default.txt'), 'utf8').trim()
    const redist = join(studio, 'VC/Redist/MSVC', version, 'x64')
    const runtime = readdirSync(redist).find(name => /^Microsoft\.VC\d+\.CRT$/.test(name))
    if (!runtime) throw new Error(`${redist} holds no C++ runtime (Microsoft.VC*.CRT)`)
    return join(redist, runtime)
}

/** The files under `folder`, as paths in it with forward slashes. */
function* walk(folder: string, path = ''): Generator<string> {
    for (const name of readdirSync(join(folder, path))) {
        const entry = path ? `${path}/${name}` : name
        if (statSync(join(folder, entry)).isDirectory()) yield* walk(folder, entry)
        else yield entry
    }
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
// What players get: the executable, its DLLs and Resources/, without the link outputs (.lib, .exp) or the debug C runtime,
// and the C++ runtime it was built with in place of the one Cocos copies.
const runtime = cppRuntime()
const files = mkdtempSync(join(tmpdir(), 'pvz-remake-windows-'))
try {
    for (const name of readdirSync(release)) {
        const lower = name.toLowerCase()
        if (name === executable || lower.endsWith('.dll') && !debugRuntime.has(lower)) cpSync(join(release, name), join(files, name))
    }
    for (const name of readdirSync(runtime)) cpSync(join(runtime, name), join(files, name))
    cpSync(join(release, 'Resources'), join(files, 'Resources'), { recursive: true })
    execFileSync(findCompiler(), [`/DAppVersion=${version}`, `/DFiles=${files}`, 'tools/installer/windows.iss'], { stdio: 'inherit' })
    // What is compressed already is stored as it is, as the Mod packer does.
    const entries: Zippable = {}
    for (const path of walk(files)) entries[`${appName}/${path}`] = [readFileSync(join(files, path)), { level: /\.(png|jpe?g|mp3|ogg|zip)$/i.test(path) ? 0 : 6 }]
    mkdirSync('dist', { recursive: true })
    writeFileSync(`dist/pvz-remake-v${version}-windows-x64.zip`, zipSync(entries))
} finally {
    rmSync(files, { recursive: true, force: true })
}
