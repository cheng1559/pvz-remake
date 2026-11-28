import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { canDropLoot } from '@/server/level/loot'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import type { Session } from '@/server/session/session'
import { LEVEL_AWARD, parseGameplayDefinitions, parseGameplayLevels, pastAdventureLevel } from '@/shared/content/gameplay'
import { TICK_SECONDS } from '@/shared/protocol'

const source = readGameplaySource
const definitions = parseGameplayDefinitions(source('definitions'))
const levels = parseGameplayLevels(source('levels'), definitions)
const options = { randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] }

for (const [levelId, time] of [['pvz:sandbox-day', 'day'], ['pvz:sandbox-night', 'night']] as const) {
    test(`${levelId} has ten empty slots, no zombies but those put down, and never ends`, () => {
        assert.deepEqual([levels.levels[levelId].board, levels.levels[levelId].time], ['pvz:frontyard', time])
        const game = new LocalIntegratedGame(definitions, levels, undefined, true)
        game.start({ ...options, levelId })
        game.command({ type: 'completeIntro' })
        game.update(0)
        assert.deepEqual(game.render().seedPackets, Array(10).fill(null))
        for (let tick = 0; tick < 6000; tick++) game.update(TICK_SECONDS)
        const quiet = game.render()
        assert.deepEqual([quiet.zombies.length, quiet.wave.total, quiet.result], [0, 0, 'playing'], 'no wave comes')
        // A zombie put down and killed, the last on the lawn, drops no award.
        assert.ok(game.debugCommand('/zombie normal 3').ok)
        game.update(TICK_SECONDS)
        assert.equal(game.render().zombies.length, 1)
        assert.ok(game.debugCommand('/damage 10000').ok)
        for (let tick = 0; tick < 300; tick++) game.update(TICK_SECONDS)
        const after = game.render()
        assert.deepEqual([after.zombies.length, after.items.some(item => item.typeId === LEVEL_AWARD), after.result], [0, false, 'playing'])
        // /seed fills the slots; a save keeps the empty ones.
        assert.ok(game.debugCommand('/seed 3 peashooter').ok)
        const restored = new LocalIntegratedGame(definitions, levels, undefined, true)
        restored.start({ ...options, levelId, save: game.saveAtBoundary() })
        assert.deepEqual(restored.render().seedPackets.map(packet => packet?.seedId ?? null),
            [null, null, 'pvz:peashooter', null, null, null, null, null, null, null])
    })

    test(`${levelId}'s graves raise any of its time's grave zombies, as it names no zombies`, () => {
        assert.deepEqual(levels.levels[levelId].graveZombies, definitions.boards['pvz:frontyard'].times[time].graveZombies)
        const game = new LocalIntegratedGame(definitions, levels, undefined, true)
        game.start({ ...options, levelId })
        game.command({ type: 'completeIntro' })
        game.update(0)
        assert.ok(game.debugCommand('/griditem grave 3 5').ok)
        const raised = game.debugCommand('/gravezombies')
        assert.equal(raised.ok && raised.message, 'Raised 1 zombie(s) from graves')
        game.update(TICK_SECONDS)
        assert.equal(game.render().zombies.length, 1)
    })
}

test("the test levels are outside the Adventure, past the first adventure's checks of the level number", () => {
    for (const levelId of ['pvz:sandbox-day', 'pvz:sandbox-night', 'pvz:teams-demo', 'pvz:stress-test']) {
        assert.equal(levels.levels[levelId].adventureIndex, undefined, levelId)
    }
    const world = (levelId: string) => {
        const server = new IntegratedGameServer(definitions, levels)
        server.start({ protocolVersion: 1, sequence: 1, type: 'startSession', ...options, levelId, firstAdventure: true })
        return (server as unknown as { session: Session }).session.world
    }
    // Board::CanDropLoot: a first adventure drops money from 2-1 on; another mode always does.
    assert.deepEqual(['pvz:adventure-1-9', 'pvz:adventure-2-1', 'pvz:sandbox-day'].map(id => canDropLoot(world(id))), [false, true, true])
    const sandbox = levels.levels['pvz:sandbox-day'], nine = levels.levels['pvz:adventure-1-9']
    assert.deepEqual([pastAdventureLevel(nine, 8), pastAdventureLevel(nine, 9), pastAdventureLevel(sandbox, 1000)], [true, false, true])
})

test('a level may have neither waves nor rules, and a fixed bank may hold empty slots, but not both waves and rules', () => {
    const levelSource = () => {
        const levels = source('levels')
        levels.levels['pvz:sandbox-day'] = { ...levels.levels['pvz:sandbox-day'], seedPackets: ['pvz:peashooter', null] }
        return levels
    }
    assert.deepEqual(parseGameplayLevels(levelSource(), definitions).levels['pvz:sandbox-day'].seedPackets, ['pvz:peashooter', null])
    const both = levelSource()
    both.levels['pvz:sandbox-day'].waves = [{ zombies: ['pvz:normal'] }]
    both.levels['pvz:sandbox-day'].rules = { kind: 'pvz:adventure', count: 1 }
    assert.throws(() => parseGameplayLevels(both, definitions), /cannot combine waves and rules/)
})
