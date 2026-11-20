// Packs the Windows Release build into an installer with Inno Setup: dist/pvz-remake-v<version>-windows-x64-setup.exe.
// Run `npm run compile:windows:release` first. Finds ISCC.exe on PATH, in the usual install folders, or from the ISCC variable.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const release = 'build/windows/proj/Release/pvz-remake.exe'
if (!existsSync(release)) throw new Error(`${release} is missing; run npm run compile:windows:release first`)

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

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
execFileSync(findCompiler(), [`/DAppVersion=${version}`, 'tools/installer/windows.iss'], { stdio: 'inherit' })
