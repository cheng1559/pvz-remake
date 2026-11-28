// Compiles native/engine/common/music (the module player) and the libopenmpt it plays with to WebAssembly, for the web's
// AudioWorklet and the tests. Native builds compile the same source directly. Requires Emscripten (em++); the generated
// module is committed so other builds do not need it.
import { execFile } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const LIBOPENMPT = 'native/engine/common/third_party/libopenmpt'
const OUTPUT = 'assets/resources/music/pvz_music.bin'
// libopenmpt's Makefile: LIBOPENMPT_CXX_SOURCES, with minimp3 and stb_vorbis for samples a module keeps compressed.
const SOURCE_DIRECTORIES = ['src/openmpt/all', 'src/openmpt/base', 'src/openmpt/logging', 'src/openmpt/random', 'common',
    'src/openmpt/fileformat_base', 'src/openmpt/soundbase', 'src/openmpt/soundfile_data', 'soundlib', 'soundlib/plugins',
    'soundlib/plugins/dmo', 'sounddsp', 'libopenmpt']
const C_SOURCES = ['include/minimp3/minimp3.c', 'include/stb_vorbis/stb_vorbis.c']
const EXPORTS = ['create', 'destroy', 'load', 'play', 'stop', 'set_volume', 'set_channel_volume', 'queue_jump', 'jumps',
    'position', 'playing', 'channels', 'render'].map(name => `_pvz_music_${name}`)
const DEFINES = ['-DLIBOPENMPT_BUILD', '-DMPT_WITH_MINIMP3', '-DMPT_WITH_STBVORBIS', '-DSTB_VORBIS_NO_PULLDATA_API', '-DSTB_VORBIS_NO_STDIO']
const INCLUDES = ['src', 'common', '.', 'include'].map(path => `-I${LIBOPENMPT}/${path}`)
const FLAGS = ['-O3', '-fwasm-exceptions']

function sources(): { cxx: string[], c: string[] } {
    const cxx = SOURCE_DIRECTORIES.flatMap(directory => readdirSync(join(LIBOPENMPT, directory))
        .filter(name => name.endsWith('.cpp') && statSync(join(LIBOPENMPT, directory, name)).isFile())
        .sort().map(name => `${LIBOPENMPT}/${directory}/${name}`))
    return { cxx: [...cxx, 'native/engine/common/music/pvz_music.cpp'], c: C_SOURCES.map(path => `${LIBOPENMPT}/${path}`) }
}

async function main() {
    const directory = mkdtempSync(join(tmpdir(), 'pvz-music-'))
    try {
        const { cxx, c } = sources()
        const jobs = [...cxx.map(file => ({ file, compiler: 'em++', standard: '-std=c++17' })), ...c.map(file => ({ file, compiler: 'emcc', standard: '-std=c11' }))]
        const objects = jobs.map((_, index) => join(directory, `${index}.o`))
        let next = 0, done = 0
        const worker = async () => {
            while (next < jobs.length) {
                const index = next++, job = jobs[index]
                await run(job.compiler, [job.standard, ...FLAGS, ...DEFINES, ...INCLUDES, '-c', job.file, '-o', objects[index]], { shell: process.platform === 'win32', maxBuffer: 64 << 20 })
                    .catch(error => { throw new Error(`${relative('.', job.file)}: ${error.stderr || error.message}`) })
                if (++done % 20 === 0) console.log(`compiled ${done}/${jobs.length}`)
            }
        }
        await Promise.all(Array.from({ length: Math.max(1, availableParallelism() - 1) }, worker))
        const wasm = join(directory, 'music.wasm')
        // The object list goes in a response file: on Windows it is longer than a command line may be.
        const list = join(directory, 'objects.rsp')
        writeFileSync(list, objects.map(path => path.replace(/\\/g, '/')).join('\n'))
        await run('em++', [...FLAGS, '--no-entry', '-sSTANDALONE_WASM', '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=33554432',
            '-sERROR_ON_UNDEFINED_SYMBOLS=1', `-sEXPORTED_FUNCTIONS=${[...EXPORTS, '_malloc', '_free'].join(',')}`,
            `@${list}`, '-o', wasm], { shell: process.platform === 'win32', maxBuffer: 64 << 20 })
        mkdirSync(dirname(OUTPUT), { recursive: true })
        copyFileSync(wasm, OUTPUT)
        console.log(`${OUTPUT}: ${Math.round(statSync(OUTPUT).size / 1024)} KiB`)
    } finally {
        rmSync(directory, { recursive: true, force: true })
    }
}

await main()
