import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

test('repeated entity additions keep restore waiting for the original animation load', async () => {
    // Exercise the renderer's task scheduling without initializing the Cocos runtime.
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(
        readFileSync('assets/scripts/client/showcase/Adventure11EntityRenderer.ts', 'utf8'),
        { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } },
    )
    runInNewContext(compiled.outputText, {
        exports: module.exports,
        require: () => ({}),
        console,
    })
    const renderer = new module.exports.Adventure11EntityRenderer(
        0, { loadedMods: { plantUpgrades: [] } }, {}, {}, { children: [] },
    )
    let release!: () => void
    const loading = new Promise<void>(resolve => { release = resolve })
    let loaded = false
    let restored = false
    let failure: unknown
    const player = {
        restore() {
            assert.ok(loaded, 'animation must finish loading before restore')
            restored = true
        },
    }
    renderer.create = async (id: number) => {
        if (renderer.entities.has(id)) return
        renderer.entities.set(id, { getComponent: () => player })
        await loading
        loaded = true
    }
    const world = {
        plants: [], zombies: [], projectiles: [], items: [], lawnMowers: [],
        cursor: { mode: 'none' },
    }
    const added = { added: [1], removed: [] }
    renderer.sync(world, added, [])
    const creation = renderer.creationTasks.get(1)
    renderer.sync(world, added, [])
    const restoring = renderer.restore([{ kind: 'sun', entityId: 1, animation: {} }])
        .catch((error: unknown) => { failure = error })
    try {
        await setImmediate()
        assert.equal(failure, undefined)
        assert.equal(restored, false)
        release()
        await restoring
        assert.equal(failure, undefined)
        assert.equal(restored, true)
    } finally {
        release()
        await Promise.all([creation, restoring])
    }
})
