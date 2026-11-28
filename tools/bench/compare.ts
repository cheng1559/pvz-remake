/**
 * Runs the in-game benchmark (assets/scripts/app/Benchmark.ts) on built games and compares them:
 *
 *   npm run bench -- <target> [<target>] [--scenario steady|combat] [--frames 1200] [--rounds 3] [--screenshots <folder>] [--chrome <path>]
 *
 * A target is a web build folder (with index.html), served here and opened in a fresh headless Chrome, or a native
 * executable or macOS app, launched with the benchmark's command line. Two targets take turns (A B, then B A), each
 * run in a fresh browser or process, as the machine's own load drifts. With --screenshots, each web run's picture of
 * the frame the level stands still on is kept, and the pixels that differ from the first run's are counted.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, extname, join, normalize, resolve, sep } from 'node:path'
import { inflateSync } from 'node:zlib'

/** What the game reports (BenchmarkResult there): only what is compared here is read. */
interface Stats { mean: number, median: number, p99: number, low1: number }
interface Result { platform: string, debug: boolean, frame: Stats, update: Stats, server: Stats, draw: Stats, drawCalls: number, zombies: number, checksum: string }
interface Request { scenario: string, frames: number }

const DEFAULT_CHROME = process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome'
const TIMEOUT_SECONDS = 600
/** How long Chrome may take to answer one debugging command. */
const COMMAND_TIMEOUT_SECONDS = 60

const TYPES: Record<string, string> = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
    '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.zip': 'application/zip',
}

const isWeb = (path: string) => existsSync(join(path, 'index.html'))

function exited(child: ChildProcess): Promise<number | null> {
    // One ended by a signal has no exit code, only the signal.
    return child.exitCode !== null || child.signalCode !== null ? Promise.resolve(child.exitCode) : new Promise(done => child.once('exit', done))
}

/** Reads until there is something to read; `read` failing is tried again, unless `retryFailures` is false. */
async function waitFor<T>(what: string, read: () => Promise<T | undefined>, retryFailures = true): Promise<T> {
    const deadline = Date.now() + TIMEOUT_SECONDS * 1000
    for (;;) {
        const value = await read().catch(error => { if (retryFailures) return undefined; throw error })
        if (value !== undefined) return value
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
        await new Promise(done => setTimeout(done, 500))
    }
}

function serve(root: string): Promise<Server> {
    const server = createServer((request, response) => {
        const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
        const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path))
        if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return void response.writeHead(404).end()
        response.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' })
        void readFile(file).then(data => response.end(data), () => response.destroy())
    })
    return new Promise((done, fail) => server.once('error', fail).listen(0, '127.0.0.1', () => done(server)))
}

/** One run in a fresh headless Chrome; `screenshot`: the file its last frame's picture goes to. */
async function runWeb(root: string, request: Request, chromePath: string, screenshot?: string): Promise<Result> {
    const server = await serve(root)
    const profile = await mkdtemp(join(tmpdir(), 'pvz-bench-chrome-'))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/?benchmark=${request.scenario}&frames=${request.frames}`
    const chrome = spawn(chromePath, [
        '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,960',
        // Frames as fast as the game makes them: the benchmark times the work, and this keeps a run short.
        '--disable-gpu-vsync', '--disable-frame-rate-limit', '--no-first-run', '--no-default-browser-check', '--mute-audio', url,
    ], { stdio: 'ignore' })
    let socket: WebSocket | undefined
    try {
        const port = await waitFor('Chrome', async () => (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0] || undefined)
        const page = await waitFor('the page', async () => {
            const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string, url: string, webSocketDebuggerUrl: string }[]
            return pages.find(page => page.type === 'page' && page.url.startsWith(url.split('?')[0]))
        })
        const ws = socket = new WebSocket(page.webSocketDebuggerUrl)
        await new Promise((done, fail) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', fail, { once: true }) })
        // A command is answered, fails, or fails with the connection: none waits for good.
        let next = 0
        const pending = new Map<number, { done(result: any): void, fail(error: Error): void }>()
        const failAll = (error: Error) => { for (const command of [...pending.values()]) command.fail(error) }
        ws.addEventListener('message', event => {
            const message = JSON.parse(String(event.data))
            const command = message.id === undefined ? undefined : pending.get(message.id)
            if (!command) return
            if (message.error) command.fail(new Error(`Chrome: ${message.error.message}`))
            else command.done(message.result)
        })
        ws.addEventListener('close', () => failAll(new Error('Chrome closed the connection')))
        ws.addEventListener('error', () => failAll(new Error('The connection to Chrome failed')))
        const send = (method: string, params: object = {}) => new Promise<any>((done, fail) => {
            if (ws.readyState !== WebSocket.OPEN) return fail(new Error('The connection to Chrome is closed'))
            const id = next++
            const timer = setTimeout(() => command.fail(new Error(`Chrome did not answer ${method}`)), COMMAND_TIMEOUT_SECONDS * 1000)
            const settle = () => { clearTimeout(timer); pending.delete(id) }
            const command = { done(result: any) { settle(); done(result) }, fail(error: Error) { settle(); fail(error) } }
            pending.set(id, command)
            ws.send(JSON.stringify({ id, method, params }))
        })
        // Until the game reports; Chrome failing ends the wait.
        const outcome = await waitFor('the benchmark', async () => {
            const { result } = await send('Runtime.evaluate', { expression: 'JSON.stringify(globalThis.pvzBenchmark ?? null)', returnByValue: true })
            const value = JSON.parse(result?.value ?? 'null') as Result | { error: string } | null
            return value ?? undefined
        }, false)
        if ('error' in outcome) throw new Error(`The benchmark failed: ${outcome.error}`)
        if (screenshot) {
            // The level stands still by now; a moment lets the frame it stands on reach the page.
            await new Promise(done => setTimeout(done, 500))
            const { data } = await send('Page.captureScreenshot', { format: 'png' })
            await writeFile(screenshot, Buffer.from(data, 'base64'))
        }
        return outcome
    } finally {
        socket?.close()
        chrome.kill()
        await exited(chrome)
        await new Promise(done => server.close(done))
        await rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
    }
}

/** One run of a native build, which writes its result to a file and quits. */
async function runNative(path: string, request: Request): Promise<Result> {
    if (path.endsWith('.app')) {
        const folder = join(path, 'Contents', 'MacOS'), files = readdirSync(folder)
        if (files.length !== 1) throw new Error(`${folder} should hold one executable`)
        path = join(folder, files[0])
    }
    const folder = await mkdtemp(join(tmpdir(), 'pvz-bench-native-')), out = join(folder, 'benchmark.json')
    const child = spawn(path, [`--benchmark=${request.scenario}`, `--frames=${request.frames}`, `--benchmark-out=${out}`], { stdio: 'ignore' })
    const timer = setTimeout(() => child.kill(), TIMEOUT_SECONDS * 1000)
    try {
        const code = await exited(child)
        if (!existsSync(out)) throw new Error(`${path} exited (${code}) without a result`)
        const outcome = JSON.parse(await readFile(out, 'utf8')) as Result | { error: string }
        if ('error' in outcome) throw new Error(`The benchmark failed: ${outcome.error}`)
        return outcome
    } finally {
        clearTimeout(timer)
        await rm(folder, { recursive: true, force: true }).catch(() => {})
    }
}

interface Picture { width: number, height: number, channels: number, pixels: Uint8Array }

/** A PNG as Chrome's screenshots are: 8 bits a channel, RGB or RGBA, not interlaced. */
function decodePng(file: Uint8Array): Picture {
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength), data: Uint8Array[] = []
    let width = 0, height = 0, channels = 0
    for (let offset = 8; offset < file.length; offset += view.getUint32(offset) + 12) {
        const type = String.fromCharCode(...file.subarray(offset + 4, offset + 8)), body = file.subarray(offset + 8, offset + 8 + view.getUint32(offset))
        if (type === 'IHDR') {
            width = view.getUint32(offset + 8)
            height = view.getUint32(offset + 12)
            channels = body[9] === 2 ? 3 : body[9] === 6 ? 4 : 0
            if (body[8] !== 8 || !channels || body[12] !== 0) throw new Error('Unsupported PNG: expected 8-bit RGB or RGBA, not interlaced')
        } else if (type === 'IDAT') data.push(body)
    }
    const raw = inflateSync(Buffer.concat(data)), stride = width * channels, pixels = new Uint8Array(stride * height)
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)], from = y * (stride + 1) + 1, to = y * stride
        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? pixels[to + x - channels] : 0, up = y ? pixels[to + x - stride] : 0
            const corner = x >= channels && y ? pixels[to + x - stride - channels] : 0
            const estimate = left + up - corner, a = Math.abs(estimate - left), b = Math.abs(estimate - up), c = Math.abs(estimate - corner)
            const predicted = filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1
                : filter === 4 ? (a <= b && a <= c ? left : b <= c ? up : corner) : 0
            pixels[to + x] = raw[from + x] + predicted
        }
    }
    return { width, height, channels, pixels }
}

/** The pixels that differ by more than `tolerance` in a colour channel; all of them if the sizes differ. */
function differingPixels(a: Picture, b: Picture, tolerance: number): number {
    if (a.width !== b.width || a.height !== b.height) return Math.max(a.width * a.height, b.width * b.height)
    let count = 0
    for (let pixel = 0; pixel < a.width * a.height; pixel++) {
        for (let channel = 0; channel < 3; channel++) {
            if (Math.abs(a.pixels[pixel * a.channels + channel] - b.pixels[pixel * b.channels + channel]) > tolerance) { count++; break }
        }
    }
    return count
}

const ROWS: { name: string, value: (result: Result) => number, digits: number }[] = [
    { name: 'frame mean (ms)', value: result => result.frame.mean, digits: 3 },
    { name: 'frame median (ms)', value: result => result.frame.median, digits: 3 },
    { name: 'frame p99 (ms)', value: result => result.frame.p99, digits: 3 },
    { name: 'frame 1% low (ms)', value: result => result.frame.low1, digits: 3 },
    { name: 'update mean (ms)', value: result => result.update.mean, digits: 3 },
    { name: 'server mean (ms)', value: result => result.server.mean, digits: 3 },
    { name: 'draw mean (ms)', value: result => result.draw.mean, digits: 3 },
    { name: 'draw calls', value: result => result.drawCalls, digits: 0 },
]

const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** The targets' medians over their runs with each one's range; with two, the change, "~" where the ranges overlap. */
function table(results: Map<string, Result[]>): string {
    const labels = [...results.keys()]
    const cells = ROWS.map(row => {
        const values = labels.map(label => results.get(label)!.map(row.value))
        const shown = values.map(list => `${median(list).toFixed(row.digits)} [${Math.min(...list).toFixed(row.digits)}–${Math.max(...list).toFixed(row.digits)}]`)
        if (values.length === 2) {
            const [a, b] = values, change = (median(b) - median(a)) / median(a) * 100
            const overlap = Math.min(...b) <= Math.max(...a) && Math.min(...a) <= Math.max(...b)
            shown.push(Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${change.toFixed(1)}%${overlap ? ' ~' : ''}` : '')
        }
        return [row.name, ...shown]
    })
    const header = ['', ...labels, ...(labels.length === 2 ? [`${labels[1]} vs ${labels[0]}`] : [])]
    const widths = header.map((title, column) => Math.max(title.length, ...cells.map(cell => cell[column].length)))
    const line = (cell: string[]) => cell.map((value, column) => column ? value.padStart(widths[column]) : value.padEnd(widths[column])).join('  ')
    return [line(header), ...cells.map(line)].join('\n')
}

async function main(): Promise<void> {
    const paths: string[] = [], options = new Map<string, string>(), argv = process.argv.slice(2)
    for (let index = 0; index < argv.length; index++) {
        if (!argv[index].startsWith('--')) paths.push(argv[index])
        else if (argv[index + 1] === undefined) throw new Error(`${argv[index]} needs a value`)
        else options.set(argv[index].slice(2), argv[++index])
    }
    if (paths.length < 1 || paths.length > 2) throw new Error('Give one or two targets: web build folders, native executables or macOS apps')
    const request = { scenario: options.get('scenario') ?? 'steady', frames: Number(options.get('frames') ?? 1200) }
    const rounds = Number(options.get('rounds') ?? 3), screenshots = options.get('screenshots'), chrome = options.get('chrome') ?? DEFAULT_CHROME
    // The scenario and frames are the game's to check: it reports one it cannot run as its result.
    if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error('--rounds must be a whole number above 0')
    if (screenshots) await mkdir(screenshots, { recursive: true })
    const targets = paths.map((path, index) => ({ label: paths.length === 2 ? 'AB'[index] : basename(path), path: resolve(path) }))
    for (const target of targets) {
        if (!existsSync(target.path)) throw new Error(`${target.path} does not exist`)
        console.log(`${target.label}: ${target.path}`)
    }
    const results = new Map(targets.map(target => [target.label, [] as Result[]]))
    const pictures: { run: string, picture: Picture }[] = []
    for (let round = 0; round < rounds; round++) {
        for (const target of round % 2 ? [...targets].reverse() : targets) {
            const run = `${target.label}-${round + 1}`, web = isWeb(target.path)
            const screenshot = screenshots && web ? join(screenshots, `${run}.png`) : undefined
            const result = web ? await runWeb(target.path, request, chrome, screenshot) : await runNative(target.path, request)
            results.get(target.label)!.push(result)
            console.log(`${run}: frame ${result.frame.mean.toFixed(2)} ms, 1% low ${result.frame.low1.toFixed(2)} ms, checksum ${result.checksum}`)
            if (screenshot) pictures.push({ run, picture: decodePng(await readFile(screenshot)) })
        }
    }
    for (const [label, list] of results) {
        const { platform, debug, zombies } = list[0], checksums = new Set(list.map(result => result.checksum))
        console.log(`${label}: ${platform}${debug ? ', debug' : ''}, ${zombies} zombies on screen` +
            (checksums.size > 1 ? '; its runs played different games' : ''))
    }
    const checksums = new Set([...results.values()].map(list => list[0].checksum))
    if (results.size === 2) console.log(checksums.size === 1 ? 'Both played the same game.' : 'The targets played different games.')
    if (pictures.length > 1) {
        // Against the first run's: its own target's other runs give the spread, the other target's the change.
        const [first, ...others] = pictures, all = first.picture.width * first.picture.height
        console.log(`Pixels differing from ${first.run}'s by more than 16 of 255 in a channel:`)
        for (const { run, picture } of others) {
            const count = differingPixels(first.picture, picture, 16)
            console.log(`  ${run}: ${count} (${(count / all * 100).toFixed(2)}%)`)
        }
    }
    console.log(`\n${request.scenario}, ${request.frames} frames, medians over the runs [range]:\n${table(results)}`)
}

main().catch(error => {
    console.error(`[bench] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
})
