/**
 * Stages the web Release build for Cloudflare Pages, and checks a deployment of it.
 *
 * Pages takes no file over 25 MiB, and the base archive is larger. Staging copies the build without it and writes the
 * archive as 16 MiB parts, named by their hash, in the archive's folder. The built game's `.zip` downloader then
 * fetches the parts and joins them when it is asked for the archive. The engine `cc.js` is staged again under a name
 * with its hash, because `_headers` lets browsers keep `/cocos-js/*` for a year.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { runInNewContext } from 'node:vm'

export const PAGES_FILE_LIMIT = 25 * 2 ** 20
export const PAGES_PART_SIZE = 16 * 2 ** 20

/** What staging wrote, which {@link verifyPages} checks a deployment against. */
export interface PagesStage {
    /** The archive's path from the site's root. */
    readonly archive: string
    readonly archiveBytes: number
    readonly archiveSha256: string
    /** The parts in order, by name in the archive's folder and size. */
    readonly parts: readonly (readonly [string, number])[]
    /** The minified names of the asset manager that the `.zip` downloader is registered on, and of `sys`. */
    readonly manager: string
    readonly sys: string
}

// The start of the built `.zip` downloader's body, before it asks whether it runs natively.
const ZIP_DOWNLOADER = /([\w$]+)\.downloader\.register\("\.zip",function\(([\w$]+),([\w$]+),([\w$]+)\)\{(?=if\(([\w$]+)\.isNative\))/g

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

function filesIn(root: string, folder = ''): string[] {
    return readdirSync(join(root, folder), { withFileTypes: true }).flatMap(entry => {
        const path = folder ? `${folder}/${entry.name}` : entry.name
        return entry.isDirectory() ? filesIn(root, path) : entry.isFile() ? [path] : []
    })
}

/** The code put first in the `.zip` downloader: for the archive, it fetches and joins the parts, and reports progress. */
function partLoader(url: string, options: string, done: string, archive: string, size: number, parts: PagesStage['parts']): string {
    return `
const zipURL=new URL(${url},document.baseURI);
if(zipURL.pathname===${JSON.stringify(`/${archive}`)}){
  (async()=>{
    const bytes=new Uint8Array(${size});
    let offset=0;
    for(const [file,size] of ${JSON.stringify(parts)}){
      const response=await fetch(new URL(file,zipURL));
      if(!response.ok)throw new Error('Base archive download failed: '+response.status);
      const part=new Uint8Array(await response.arrayBuffer());
      if(part.length!==size)throw new Error('Incomplete base archive part: '+file);
      bytes.set(part,offset);offset+=size;
      if(${options}.onFileProgress)${options}.onFileProgress(offset,bytes.length);
    }
    return bytes.buffer;
  })().then(data=>${done}(null,data),error=>${done}(error));
  return;
}
`
}

/** Stages the web build in `source` into `target`, which it empties first. */
export function stagePages(source: string, target: string, limit = PAGES_FILE_LIMIT, partSize = PAGES_PART_SIZE): PagesStage {
    const files = filesIn(source)
    const large = files.filter(file => statSync(join(source, file)).size > limit)
    if (large.length !== 1 || !large[0].endsWith('.zip')) {
        throw new Error(`Expected the base archive to be the one file over ${limit} bytes, found ${large.join(', ') || 'none'}`)
    }
    const archive = large[0]
    rmSync(target, { recursive: true, force: true })
    for (const file of files) {
        if (file === archive) continue
        mkdirSync(dirname(join(target, file)), { recursive: true })
        copyFileSync(join(source, file), join(target, file))
    }

    const bytes = readFileSync(join(source, archive))
    const folder = join(target, posix.dirname(archive))
    mkdirSync(folder, { recursive: true })
    const parts: [string, number][] = []
    for (let offset = 0; offset < bytes.length; offset += partSize) {
        const part = bytes.subarray(offset, offset + partSize)
        const name = `base-${sha256(part).slice(0, 20)}.bin`
        writeFileSync(join(folder, name), part)
        parts.push([name, part.length])
    }

    const mainPath = join(target, 'assets/main/index.js')
    const main = readFileSync(mainPath, 'utf8')
    const matches = [...main.matchAll(ZIP_DOWNLOADER)]
    if (matches.length !== 1) throw new Error(`Expected one .zip downloader in assets/main/index.js, found ${matches.length}`)
    const [found, manager, url, options, done, sys] = matches[0]
    const at = matches[0].index + found.length
    writeFileSync(mainPath, main.slice(0, at) + partLoader(url, options, done, archive, bytes.length, parts) + main.slice(at))

    const engine = join(target, 'cocos-js/cc.js')
    const engineName = `cc-${sha256(readFileSync(engine)).slice(0, 16)}.js`
    copyFileSync(engine, join(target, 'cocos-js', engineName))
    const mapPath = join(target, 'src/import-map.json')
    const map = JSON.parse(readFileSync(mapPath, 'utf8')) as { imports?: Record<string, string> }
    const cc = map.imports?.cc
    if (!cc?.endsWith('/cc.js')) throw new Error(`src/import-map.json maps cc to ${cc}, not to cc.js`)
    map.imports!.cc = cc.slice(0, -'cc.js'.length) + engineName
    writeFileSync(mapPath, JSON.stringify(map))

    const over = filesIn(target).filter(file => statSync(join(target, file)).size > limit)
    if (over.length) throw new Error(`Staged files over ${limit} bytes: ${over.join(', ')}`)
    return { archive, archiveBytes: bytes.length, archiveSha256: sha256(bytes), parts, manager, sys }
}

type Loader = (url: string, options: { onFileProgress?(loaded: number, total: number): void },
    done: (error: Error | null, data?: ArrayBuffer) => void) => void

/**
 * Checks the deployment at `origin` of the folder `target` that staging wrote: its entry files and engine are the
 * staged ones, and the deployed `.zip` downloader joins the parts into the archive that was staged.
 */
export async function verifyPages(origin: string, target: string, stage: PagesStage): Promise<void> {
    const base = new URL(origin)
    async function download(path: string): Promise<Buffer> {
        const url = new URL(path, base)
        const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
        if (response.status !== 200) throw new Error(`${url.href}: HTTP ${response.status}`)
        return Buffer.from(await response.arrayBuffer())
    }
    async function staged(path: string): Promise<Buffer> {
        const data = await download(path)
        if (!data.equals(readFileSync(join(target, path)))) throw new Error(`${path} differs from the staged file`)
        return data
    }

    const entries = ['index.html', 'index.js', 'application.js', 'src/import-map.json', 'src/settings.json',
        'assets/main/index.js', 'assets/main/config.json', 'assets/resources/config.json']
    const [, , , map, , main] = await Promise.all(entries.map(staged))
    const engine = new URL(JSON.parse(map.toString('utf8')).imports.cc, new URL('src/import-map.json', base))
    await staged(engine.pathname.slice(1))

    // Run the deployed downloader as the browser would, against the deployment.
    const js = main.toString('utf8')
    const start = js.indexOf(`${stage.manager}.downloader.register(".zip",function`)
    const stop = js.indexOf(`),${stage.manager}.parser.register(".zip"`, start)
    if (start < 0 || stop < start) throw new Error('assets/main/index.js has no .zip downloader')
    let loader: Loader | undefined
    runInNewContext(js.slice(start, stop + 1), {
        [stage.manager]: { downloader: { register: (_extension: string, handler: Loader) => { loader = handler } } },
        [stage.sys]: { isNative: false },
        document: { baseURI: base.href },
        URL, fetch, Uint8Array, Error,
    })
    if (!loader) throw new Error('The .zip downloader did not register')
    const register = loader
    let progress = 0
    const data = await new Promise<Buffer>((resolve, reject) => register(stage.archive, {
        onFileProgress(loaded, total) {
            if (loaded <= progress || loaded > total) reject(new Error(`Base archive progress went from ${progress} to ${loaded} of ${total}`))
            progress = loaded
        },
    }, (error, buffer) => error || !buffer ? reject(error ?? new Error('No base archive')) : resolve(Buffer.from(buffer))))
    if (data.length !== stage.archiveBytes || progress !== data.length || sha256(data) !== stage.archiveSha256) {
        throw new Error('The joined base archive differs from the one that was staged')
    }
}
