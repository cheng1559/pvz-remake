import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

test('font switching preserves layout, replaces cached frames and ignores obsolete loads', async () => {
    class Component {
        isValid = true
        node = { getComponent: () => ({ setContentSize() {} }) }
        scheduleOnce(callback: () => void) { callback() }
    }
    class Color {
        constructor(public r = 255, public g = 255, public b = 255, public a = 255) {}
    }
    class Rect {
        constructor(public x: number, public y: number, public width: number, public height: number) {}
    }
    class Frame {
        destroyed = false
        destroy() { this.destroyed = true }
    }
    const settings = { hdFontsEnabled: false }
    const glyphs: any[] = []
    const modules: Record<string, any> = {
        cc: {
            Component, Color, Rect, SpriteFrame: Frame, Sprite: { Type: { SIMPLE: 0 }, SizeMode: { CUSTOM: 0 } },
            _decorator: { ccclass: () => (value: unknown) => value, executeInEditMode: () => (value: unknown) => value, property() {} },
        },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: settings },
        '@/client/view/uiNode': { uiNode: (options: any) => {
            const node = { isValid: true, removeFromParent() {}, destroy() { this.isValid = false } }
            const glyph = { node, sprite: { spriteFrame: options.sprite.frame }, options }
            glyphs.push(glyph)
            return glyph
        } },
    }
    const load = (name: string) => {
        const module = { exports: {} as Record<string, any> }
        const compiled = transpileModule(readFileSync(`assets/scripts/client/font/${name}.ts`, 'utf8'), {
            compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
        })
        runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id], console })
        return module.exports
    }
    modules['./FontMetrics'] = load('FontMetrics')
    const { FontRenderer } = load('FontRenderer')
    const original = {
        config: { json: JSON.parse(readFileSync('assets/bundles/pvz-base/fonts/houseofterror28.json', 'utf8')) },
        textures: [{}], loadUpscaled: () => pending,
    }
    const upscaled = {
        config: { json: JSON.parse(readFileSync('assets/resources/fonts/upscaled/houseofterror28.json', 'utf8')) },
        textures: [{}],
    }
    let finish!: (value: typeof upscaled) => void
    const pending = new Promise<typeof upscaled>(resolve => { finish = resolve })
    const renderer = new FontRenderer()
    renderer.setFontAssets(original)
    renderer.string = 'W'
    const oldFrame = glyphs.at(-1).sprite.spriteFrame
    const geometry = JSON.stringify(glyphs.at(-1).options.size)
    const width = renderer.contentWidth

    settings.hdFontsEnabled = true
    renderer.update()
    settings.hdFontsEnabled = false
    renderer.update()
    finish(upscaled)
    await pending
    assert.equal(renderer.fontConfigJson, original.config, 'disabling during loading must discard the result')

    settings.hdFontsEnabled = true
    renderer.update()
    await pending
    assert.equal(renderer.fontConfigJson, upscaled.config)
    assert.equal(renderer.contentWidth, width)
    assert.equal(JSON.stringify(glyphs.at(-1).options.size), geometry)
    const frame = glyphs.at(-1).sprite.spriteFrame
    const rect = upscaled.config.json.layers[0].chars['87'].rect
    assert.deepEqual(Object.values(frame.rect), rect.map((value: number) => value * 4))
    assert.equal(oldFrame.destroyed, true)

    settings.hdFontsEnabled = false
    renderer.update()
    assert.equal(renderer.fontConfigJson, original.config)
    assert.equal(frame.destroyed, true)
    assert.equal(renderer.contentWidth, width)

    const pixel = { config: original.config, textures: [{}] }
    renderer.setFontAssets(pixel)
    const pixelFrame = glyphs.at(-1).sprite.spriteFrame
    settings.hdFontsEnabled = true
    renderer.update()
    assert.equal(renderer.layerTextures, pixel.textures, 'fonts without a variant keep their original texture')
    assert.equal(pixelFrame.destroyed, false)

    renderer.setFontAssets(original)
    renderer.onDestroy()
    renderer.isValid = false
    await pending
    assert.equal(renderer._spriteFrameCache.size, 0, 'a late load must not rebuild a destroyed renderer')
})
