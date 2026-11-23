import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'
import * as geometry from '@/client/level/LevelGeometry'

test('the level label shows an Adventure level its number and a level outside the Adventure its name', () => {
    const { LevelProgressMeter } = loadScript('assets/scripts/client/level/LevelProgressMeter.ts',
        (id: string) => id === './LevelGeometry' ? geometry : {}, { console })
    const label = (level: object, nameKey?: string) => {
        const levelText = { text: '', node: { active: false }, setPosition() {} }
        const nodes = { meter: { active: false }, fillClip: {}, fill: {}, head: {}, levelText }
        const ui = { text: (key: string) => ({ LEVEL: 'Level', SANDBOX_DAY: 'Sandbox: Day' })[key] ?? key }
        const meter = new LevelProgressMeter(ui, level, nodes, nameKey)
        meter.sync({ wave: { index: 0, total: 0, flagWaves: [], countdown: 0 }, gameplayTick: 1, result: 'playing' }, true)
        return levelText.text
    }
    assert.equal(label({ adventureIndex: 12 }), 'Level 2-2')
    assert.equal(label({}, 'SANDBOX_DAY'), 'Sandbox: Day', "Board::DrawLevel: another mode's name")
    assert.equal(label({ adventureIndex: 9 }, 'SANDBOX_DAY'), 'Level 1-9', 'a number wins over a name')
})
