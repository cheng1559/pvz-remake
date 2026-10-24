import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as particle from '@/shared/content/particle'
import * as snapshotParser from '@/client/particle/ParticlePlayerSnapshot'

import {
    parseParticlePlayerSnapshot,
    validateParticlePlayerSnapshotContent,
} from '@/client/particle/ParticlePlayerSnapshot'

const data = { id: 'pvz:peasplat', durationSeconds: 0.2 }

function snapshot(): any {
    return {
        id: 'pvz:peasplat',
        seed: 0xffffffff,
        ageTicks: 7,
        playing: true,
        visible: true,
        accumulatorSeconds: 0.005,
        remainingSeconds: 0.135,
    }
}

test('Particle player snapshot round-trips strict playback state', () => {
    const value = snapshot()
    const parsed = parseParticlePlayerSnapshot(JSON.parse(JSON.stringify(value)))
    assert.deepEqual(validateParticlePlayerSnapshotContent(parsed, data), value)
})

test('a custom particle preserves its configured remaining lifetime through restore and zero speed', () => {
    const exports: any = {}
    const code = transpileModule(readFileSync('assets/scripts/client/particle/ParticlePlayer.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    const modules: Record<string, unknown> = {
        cc: { Component: class {}, _decorator: { ccclass: () => (type: unknown) => type } },
        '@/shared/content/particle': particle,
        './ParticlePlayerSnapshot': snapshotParser,
    }
    new Function('exports', 'require', code.outputText)(exports, (id: string) => modules[id] ?? {})
    let destroyed = 0
    const player = () => {
        const result = new exports.ParticlePlayer()
        result.node = { destroy() { destroyed++ } }
        result.data = { id: 'test:custom', durationSeconds: 2, emitters: [] }
        result.play(7, 0.3)
        return result
    }
    const original = player()
    original.advance(0.12)
    const restored = player()
    restored.restore(JSON.parse(JSON.stringify(original.snapshot())))
    restored.advance(0)
    assert.equal(restored.snapshot().remainingSeconds, 0.18)
    restored.advance(0.17)
    assert.equal(destroyed, 0)
    restored.advance(0.02)
    assert.equal(destroyed, 1)
})

test('Particle player snapshot rejects malformed state', () => {
    const invalid = (change: (value: any) => void) => {
        const value = snapshot()
        change(value)
        return () => parseParticlePlayerSnapshot(value)
    }

    const invalidContent = (change: (value: any) => void) => {
        const value = snapshot()
        change(value)
        return () => validateParticlePlayerSnapshotContent(parseParticlePlayerSnapshot(value), data)
    }

    assert.throws(invalid(value => { value.node = {} }), /node is not supported/)
    assert.throws(invalid(value => { value.id = 'peasplat' }), /qualified ID/)
    assert.throws(invalid(value => { value.seed = 0x100000000 }), /uint32/)
    assert.throws(invalid(value => { value.playing = 1 }), /must be boolean/)
    assert.throws(invalid(value => { value.visible = null }), /must be boolean/)
    assert.throws(invalid(value => { value.accumulatorSeconds = 0.01 }), /within one tick/)
    assert.throws(invalid(value => { value.remainingSeconds = -1 }), /must be non-negative/)
    assert.throws(invalid(value => { value.remainingSeconds = Infinity }), /must be finite/)
    assert.throws(invalidContent(value => { value.id = 'pvz:other' }), /ID mismatch/)
    assert.throws(invalidContent(value => { value.ageTicks = 21 }), /exceeds effect duration/)
})
