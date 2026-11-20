import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { stagePages, verifyPages } from '../../tools/installer/pages'

const ARCHIVE = 'assets/resources/native/48/base.zip'

function build(root: string, archive: Uint8Array): void {
    const files: Record<string, string | Uint8Array> = {
        'index.html': '<!doctype html>',
        'index.js': 'start()',
        'application.js': 'run()',
        'src/settings.json': '{}',
        'src/import-map.json': '{"imports":{"cc":"./../cocos-js/cc.js"}}',
        'cocos-js/cc.js': 'engine',
        'assets/main/config.json': '{}',
        'assets/resources/config.json': '{}',
        // As the minified build registers it: `m` is the asset manager and `p` is `sys`.
        'assets/main/index.js': 'var x=1;m.downloader.register(".zip",function(e,t,i){if(p.isNative){i(new Error("native"))}'
            + 'else i(new Error("whole archive"))}),m.parser.register(".zip",function(e,t,i){return i(null,e)});',
        [ARCHIVE]: archive,
    }
    for (const [path, data] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true })
        writeFileSync(join(root, path), data)
    }
}

async function serve(root: string, run: (origin: string) => Promise<void>): Promise<void> {
    const server = createServer((request, response) => {
        const path = join(root, decodeURIComponent(new URL(request.url!, 'http://localhost').pathname))
        if (existsSync(path) && statSync(path).isFile()) response.end(readFileSync(path))
        else { response.statusCode = 404; response.end() }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`) }
    finally { await new Promise(resolve => server.close(resolve)) }
}

test('staging splits the base archive into parts the deployed downloader joins', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pvz-pages-'))
    try {
        const archive = randomBytes(10000)
        build(join(root, 'build'), archive)
        const out = join(root, 'pages')
        const stage = stagePages(join(root, 'build'), out, 4000, 3000)

        assert.equal(stage.archive, ARCHIVE)
        assert.deepEqual(stage.parts.map(([, size]) => size), [3000, 3000, 3000, 1000])
        assert.deepEqual([stage.manager, stage.sys], ['m', 'p'])
        assert.ok(!existsSync(join(out, ARCHIVE)))
        for (const [name] of stage.parts) assert.match(name, /^base-[0-9a-f]{20}\.bin$/)
        const map = JSON.parse(readFileSync(join(out, 'src/import-map.json'), 'utf8'))
        assert.match(map.imports.cc, /^\.\/\.\.\/cocos-js\/cc-[0-9a-f]{16}\.js$/)
        assert.equal(readFileSync(join(out, 'src', map.imports.cc), 'utf8'), 'engine')
        for (const entry of readdirSync(out, { recursive: true, withFileTypes: true })) {
            if (entry.isFile()) assert.ok(statSync(join(entry.parentPath, entry.name)).size <= 4000, entry.name)
        }

        await serve(out, origin => verifyPages(origin, out, stage))

        // A part that changed after staging no longer joins into the staged archive.
        writeFileSync(join(out, 'assets/resources/native/48', stage.parts[1][0]), randomBytes(3000))
        await serve(out, origin => assert.rejects(verifyPages(origin, out, stage), /differs from the one that was staged/))
    } finally { rmSync(root, { recursive: true, force: true }) }
})

test('staging wants the base archive to be the one file over the limit', () => {
    const root = mkdtempSync(join(tmpdir(), 'pvz-pages-'))
    try {
        build(join(root, 'build'), randomBytes(1000))
        assert.throws(() => stagePages(join(root, 'build'), join(root, 'pages'), 4000, 3000), /found none/)
    } finally { rmSync(root, { recursive: true, force: true }) }
})
