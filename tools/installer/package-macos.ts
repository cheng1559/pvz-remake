// Packs the macOS Release build into a disk image: dist/pvz-remake-v<version>-macos-<arch>.dmg, <arch> being `universal`
// for the arm64 and x86_64 build Cocos makes. Run `npm run compile:macos:release` first, on macOS.
// The app is signed ad hoc: a certificate's name in the signature (an Apple Development one carries its Apple ID's email)
// is readable by anyone with the image, and gives players nothing over ad hoc unless it is a notarized Developer ID.
// SIGN_IDENTITY signs with a certificate instead. The window's background is tools/installer/dmg-background.png
// (660x400 points, drawn at 144 dpi), or DMG_BACKGROUND. Needs the Xcode command line tools (codesign, SetFile).
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The Windows installer's AppName, and the bundle's OUTPUT_NAME (native/engine/mac/CMakeLists.txt).
const appName = 'Plants vs. Zombies'
const release = `build/mac/proj/Release/${appName}.app`
const entitlements = 'native/engine/mac/entitlements.plist'
const background = process.env.DMG_BACKGROUND ?? 'tools/installer/dmg-background.png'

if (process.platform !== 'darwin') throw new Error('The macOS disk image can only be built on macOS')
if (!existsSync(release)) throw new Error(`${release} is missing; run npm run compile:macos:release first`)
// Finder finds a volume by its name: with another of the same name mounted (an earlier disk image opened), the layout
// goes to that one and this one gets none.
const sameName = readdirSync('/Volumes').filter(name => name === appName || name.startsWith(`${appName} `))
if (sameName.length) throw new Error(`Eject ${sameName.map(name => `/Volumes/${name}`).join(', ')} first: Finder would lay out that volume instead`)

function run(command: string, args: string[], input?: string): string {
    return execFileSync(command, args, { encoding: 'utf8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'] })
}

function bundleValue(key: string): string {
    return run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, join(release, 'Contents/Info.plist')]).trim()
}

function sleep(ms: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// The version the Windows installer takes, which the bundle's Info.plist must carry too.
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const bundleVersion = bundleValue('CFBundleShortVersionString')
if (bundleVersion !== version) {
    throw new Error(`native/engine/mac/Info.plist gives version ${bundleVersion}, package.json ${version}; rebuild after making them match`)
}
const archs = run('lipo', ['-archs', join(release, 'Contents/MacOS', bundleValue('CFBundleExecutable'))]).trim().split(/\s+/)
const arch = archs.length > 1 ? 'universal' : archs[0] === 'x86_64' ? 'x64' : archs[0]

const output = `dist/pvz-remake-v${version}-macos-${arch}.dmg`
const writable = output.replace(/\.dmg$/, '.rw.dmg')
const stage = 'dist/macos-dmg-root'
const app = join(stage, `${appName}.app`)
rmSync(stage, { recursive: true, force: true })
rmSync(writable, { force: true })
rmSync(output, { force: true })
mkdirSync(join(stage, '.background'), { recursive: true })

run('ditto', [release, app])
// A certificate is best given by its SHA-1: a keychain can hold two of one name (a renewed one), which codesign finds ambiguous.
const identity = process.env.SIGN_IDENTITY || '-'
console.log(identity === '-' ? 'Signing ad hoc' : `Signing with ${identity}`)
run('codesign', ['--force', '--deep', '--timestamp=none', '--options', 'runtime', '--entitlements', entitlements, '--sign', identity, app])
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
symlinkSync('/Applications', join(stage, 'Applications'))
const hasBackground = existsSync(background)
if (hasBackground) copyFileSync(background, join(stage, '.background/background.png'))
else console.warn(`${background} is missing; the disk image has no background`)

run('hdiutil', ['create', '-volname', appName, '-srcfolder', stage, '-ov', '-format', 'UDRW', writable, '-quiet'])
const mount = mkdtempSync(join(tmpdir(), 'pvz-remake-dmg-'))
let attached = false
try {
    run('hdiutil', ['attach', writable, '-mountpoint', mount, '-nobrowse', '-quiet'])
    attached = true
    // Finder lays the window out and keeps it in the volume's .DS_Store.
    run('osascript', ['-'], `
set dmgFolder to POSIX file "${mount}" as alias
tell application "Finder"
  open dmgFolder
  set dmgWindow to container window of dmgFolder
  set current view of dmgWindow to icon view
  set toolbar visible of dmgWindow to false
  set statusbar visible of dmgWindow to false
  set bounds of dmgWindow to {120, 120, 780, 520}
  set viewOptions to icon view options of dmgWindow
  set arrangement of viewOptions to not arranged
  set icon size of viewOptions to 160
  set text size of viewOptions to 16
  set label position of viewOptions to bottom
  ${hasBackground ? `set background picture of viewOptions to POSIX file "${mount}/.background/background.png"` : ''}
  set position of item "${appName}.app" of dmgFolder to {180, 170}
  set position of item "Applications" of dmgFolder to {480, 170}
  update dmgFolder without registering applications
  delay 3
  close dmgWindow
end tell
`)
    for (let attempt = 0; attempt < 20 && !existsSync(join(mount, '.DS_Store')); attempt++) sleep(500)
    if (!existsSync(join(mount, '.DS_Store'))) throw new Error('Finder did not write the window layout')

    // The volume shows the app's icon.
    const icon = join(mount, `${appName}.app/Contents/Resources/AppIcon.icns`)
    if (existsSync(icon)) {
        copyFileSync(icon, join(mount, '.VolumeIcon.icns'))
        run('SetFile', ['-c', 'icnC', join(mount, '.VolumeIcon.icns')])
        run('SetFile', ['-a', 'C', mount])
    }
    run('sync', [])
    // `hdiutil detach` is deprecated for it.
    run('diskutil', ['eject', mount])
    attached = false
} finally {
    if (attached) {
        try { run('diskutil', ['eject', 'force', mount]) } catch { /* left attached; the mount point stays */ }
    }
    // Only an empty mount point is removed, never a volume still attached there.
    try { rmdirSync(mount) } catch { /* still attached */ }
}

run('hdiutil', ['convert', writable, '-format', 'UDZO', '-imagekey', 'zlib-level=9', '-o', output, '-quiet'])
rmSync(writable, { force: true })
rmSync(stage, { recursive: true, force: true })
console.log(output)
