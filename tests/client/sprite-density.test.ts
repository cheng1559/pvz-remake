import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

test('HD sprites preserve logical geometry and normalize cropped and sliced UVs exactly once', () => {
    const module = { exports: {} as Record<string, any> }
    const code = transpileModule(readFileSync('assets/scripts/client/content/SpriteDensity.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports: module.exports })
    const { setSpriteDensity, getSpriteDensity, applySpriteDensity } = module.exports
    const texture = { width: 512, height: 256 }
    const rect = { x: 16, y: 8, width: 32, height: 40 }
    const size = { width: 48, height: 50 }
    const offset = { x: -3, y: 2 }
    const frame = {
        texture, rect, originalSize: size, offset, insetLeft: 4, insetTop: 3,
        packable: true, uv: [] as number[], unbiasUV: [] as number[],
        uvSliced: [] as { u: number, v: number }[],
        reset() {
            const l = rect.x / texture.width, r = (rect.x + rect.width) / texture.width
            const t = rect.y / texture.height, b = (rect.y + rect.height) / texture.height
            this.uv = [l, b, r, b, l, t, r, t]
            this.unbiasUV = [...this.uv]
            this.uvSliced = [{ u: (rect.x + this.insetLeft) / texture.width, v: (rect.y + this.insetTop) / texture.height }]
        },
    }
    frame.reset()
    const geometry = JSON.stringify({ rect, size, offset, left: frame.insetLeft, top: frame.insetTop })
    const originalUV = [...frame.uv]
    applySpriteDensity(frame)
    assert.equal(getSpriteDensity(frame), 1)
    assert.equal(frame.packable, true)
    assert.deepEqual(frame.uv, originalUV)

    setSpriteDensity(texture, 2)
    applySpriteDensity(frame)
    assert.deepEqual(frame.uv, [16 / 256, 48 / 128, 48 / 256, 48 / 128, 16 / 256, 8 / 128, 48 / 256, 8 / 128])
    assert.deepEqual(frame.unbiasUV, frame.uv)
    assert.deepEqual(frame.uvSliced, [{ u: 20 / 256, v: 11 / 128 }])
    assert.equal(frame.packable, false, 'dynamic atlas must not copy a logical rect from a physical HD texture')
    assert.equal(JSON.stringify({ rect, size, offset, left: frame.insetLeft, top: frame.insetTop }), geometry)
    const uv = [...frame.uv]
    applySpriteDensity(frame)
    assert.deepEqual(frame.uv, uv, 'reapplying must not double the UVs')

    frame.insetLeft = 8
    frame.insetTop = 6
    applySpriteDensity(frame)
    assert.deepEqual(frame.uvSliced, [{ u: 24 / 256, v: 14 / 128 }])
    assert.deepEqual(frame.uv, uv, 'editing slice borders must preserve the normal UVs')
})
