import { readGameplaySource } from '../../tools/content_source'
import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { getDebugCliCompletions, getDebugCliSuffix, parseDebugCliCommand } from '@/shared/debug/DebugCli'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
function setup(debug = true, levelId = 'pvz:adventure-1-1', content = definitions) {
    const game = new LocalIntegratedGame(content, levels, undefined, debug)
    game.start({ levelId, randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] })
    game.command({ type: 'completeIntro' })
    game.command({ type: 'pause' })
    game.update(0)
    return game
}

test('CLI accepts old syntax, completes installed content and rejects malformed arguments', () => {
    assert.deepEqual(parseDebugCliCommand(' /PLANT "Pea Shooter" 3 1 '), { name: 'plant', args: ['Pea Shooter', '3', '1'] })
    assert.deepEqual(parseDebugCliCommand('sun set 100'), { name: 'sun', args: ['set', '100'] })
    assert.deepEqual(parseDebugCliCommand('/seed 1 snowpea'), { name: 'seed', args: ['1', 'snowpea'] })
    assert.deepEqual(parseDebugCliCommand('/mod'), { name: 'mod', args: [] })
    assert.deepEqual(getDebugCliCompletions('/mod ', undefined, true), [])
    assert.equal(getDebugCliSuffix('/mod'), '')
    assert.equal(getDebugCliSuffix('/mod ins'), '')
    for (const args of ['install', 'load local:widescreen', 'unload all', 'uninstall local:hd', 'list']) {
        assert.equal((parseDebugCliCommand('/mod ' + args) as { failure: string }).failure, 'syntax')
    }
    for (const command of ['/unknown', '/win extra', '/cooldown yes', '/mod invalid', '/item sun 3', '/sun remove 1', '/hdseed true', '/hdseed false']) {
        assert.equal((parseDebugCliCommand(command) as { failure: string }).failure, 'syntax')
    }
    assert.deepEqual(getDebugCliCompletions('/hd'), [])
    assert.equal(getDebugCliSuffix('/hdseed'), '')
    const game = setup()
    const catalog = game.debugCommand('catalog').catalog!
    assert.deepEqual(catalog.plants, ['bowling-wallnut', 'bowling-explodenut', 'sunflower', 'peashooter', 'repeater', 'cherrybomb', 'wallnut', 'potatomine', 'snowpea', 'chomper', 'explodenut'])
    assert.deepEqual(catalog.zombies, ['flag', 'normal', 'conehead', 'buckethead', 'pole_vaulter'])
    assert.deepEqual(getDebugCliCompletions('/plant re', catalog), ['/plant repeater'])
    assert.deepEqual(getDebugCliCompletions('/seed 1 sn', catalog), ['/seed 1 snowpea'])
    assert.deepEqual(getDebugCliCompletions('/collect ', catalog, true), ['/collect auto', '/collect click', '/collect move'])
    assert.equal(getDebugCliSuffix('/plant repeater', catalog), ' {row} {col}')
    assert.throws(() => setup(false).debugCommand('/sun set 999'), /unsupported-command/)
})

test('CLI replaces a seed slot while paused, preserves slot order and saves the new packet', () => {
    const game = setup(true, 'pvz:adventure-1-2')
    game.debugCommand('/sun set 500')
    game.command({ type: 'resume' })
    game.command({ type: 'selectSeed', seedId: 'pvz:peashooter' })
    game.command({ type: 'pause' })
    game.update(0)
    assert.equal(game.render().cursor.mode, 'seed')
    const tick = game.render().gameplayTick
    const before = game.render().seedPackets
    for (const command of ['/seed 0 snowpea', '/seed 3 snowpea', '/seed 1 missing', '/seed 1 sunflower']) {
        assert.equal(game.debugCommand(command).ok, false)
        assert.deepEqual(game.render().seedPackets, before)
    }
    assert.equal(game.debugCommand('/seed 1 snowpea').ok, true)
    assert.deepEqual(game.render().seedPackets.map(packet => packet.seedId), ['pvz:snowpea', 'pvz:sunflower'])
    assert.equal(game.render().seedPackets[0].ready, true)
    assert.equal(game.render().cursor.mode, 'none')
    assert.equal(game.render().gameplayTick, tick)
    assert.equal(game.render().paused, true)
    game.command({ type: 'resume' })
    game.command({ type: 'selectSeed', seedId: 'pvz:snowpea' })
    game.command({ type: 'placePlant', row: 2, column: 2 })
    game.update(0)
    assert.equal(game.render().plants[0].typeId, 'pvz:snowpea')
    assert.equal(game.render().availableSun, 325)
    assert.equal(game.render().seedPackets[0].cooldownRemaining, definitions.seeds['pvz:snowpea'].cooldownTicks)
    const restored = new LocalIntegratedGame(definitions, levels, undefined, true)
    restored.start({ levelId: 'pvz:adventure-1-2', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [], save: game.saveAtBoundary() })
    assert.deepEqual(restored.render(), game.render())
})

test('CLI game mutations go through the channel while paused and preserve valid saves', () => {
    const game = setup()
    const tick = game.render().gameplayTick
    assert.equal(game.debugCommand('/sun set 500').ok, true)
    assert.equal(game.render().sun, 500)
    assert.equal(game.render().paused, true)
    assert.equal(game.render().gameplayTick, tick)
    assert.equal(game.debugCommand('/sun set nope').failure, 'syntax')
    assert.equal(game.debugCommand('/plant repeater 0 1').failure, 'syntax')
    assert.equal(game.debugCommand('/zombie normal 6 1').failure, 'syntax')
    assert.equal(game.debugCommand('/item sun 1 10').failure, 'syntax')
    assert.equal(game.render().sun, 500)
    assert.equal(game.render().plants.length, 0)
    assert.equal(game.debugCommand('/plant repeater 1 1').ok, true)
    assert.equal(game.render().plants[0].typeId, 'pvz:repeater')
    assert.equal(game.render().plants[0].row, 0, 'debug planting accepts any board row')
    assert.equal(game.render().sun, 500, 'debug planting bypasses the seed bank and sun cost')
    assert.equal(game.debugCommand('/zombie NORMAL 1 9').ok, true)
    assert.equal(game.render().zombies[0].row, 0)
    assert.equal(game.debugCommand('/damage 20').ok, true)
    assert.equal(game.render().zombies[0].health, 250)
    assert.equal(game.debugCommand('/lawnmower trigger 3').ok, true)
    assert.equal(game.render().lawnMowers[0].state, 'active')
    assert.equal(game.debugCommand('/lawnmower reset 3').ok, true)
    assert.equal(game.debugCommand('/item sun 5 4').ok, true)
    game.command({ type: 'resume' })
    game.update(1.2)
    game.command({ type: 'pause' })
    game.update(0)
    assert.ok(game.render().projectiles.some(projectile => projectile.row === 0))
    const save = game.saveAtBoundary()
    const restored = new LocalIntegratedGame(definitions, levels)
    restored.start({ levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [], save })
    assert.deepEqual(restored.render(), game.render())
    assert.equal(game.debugCommand('/kill').ok, true)
    assert.equal(game.render().zombies.length, 0)
    assert.equal(game.debugCommand('/removeplant 1 1').ok, true)
    assert.equal(game.render().plants.length, 0)
})

test('CLI planting bypasses occupancy, seed availability and cooldown without spending or changing the cursor', () => {
    const game = setup(true, 'pvz:adventure-1-2')
    game.debugCommand('/sun set 500')
    game.command({ type: 'resume' })
    game.command({ type: 'selectSeed', seedId: 'pvz:peashooter' })
    game.command({ type: 'placePlant', row: 2, column: 0 })
    game.command({ type: 'selectSeed', seedId: 'pvz:sunflower' })
    game.command({ type: 'pause' })
    game.update(0)
    game.debugCommand('/sun set 0')
    const before = game.render()
    assert.equal(before.plants.length, 1)
    assert.equal(before.cursor.mode, 'seed')
    assert.ok(before.seedPackets[0].cooldownRemaining > 0)
    for (const text of ['/plant peashooter 3 1', '/plant peashooter 3 1', '/plant repeater 1 9']) {
        assert.equal(game.debugCommand(text).ok, true)
    }
    const after = game.render()
    assert.equal(after.plants.length, 4)
    assert.equal(after.sun, 0)
    assert.deepEqual(after.seedPackets, before.seedPackets)
    assert.deepEqual(after.cursor, before.cursor)
    assert.equal(after.gameplayTick, before.gameplayTick)
    const restored = new LocalIntegratedGame(definitions, levels)
    restored.start({ levelId: 'pvz:adventure-1-2', randomSeed: 1, initialMoney: 0, firstAdventure: false,
        mods: [], save: game.saveAtBoundary() })
    assert.deepEqual(restored.render(), after, 'overlapping debug plants remain valid saved entities')
})

test('CLI can create plants during the intro and after either level result', () => {
    const intro = new LocalIntegratedGame(definitions, levels, undefined, true)
    intro.start({ levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] })
    assert.equal(intro.debugCommand('/plant repeater 1 9').ok, true)
    assert.equal(intro.render().phase, 'intro')
    for (const result of ['win', 'lose']) {
        const game = setup()
        assert.equal(game.debugCommand(`/${result}`).ok, true)
        const before = game.render()
        assert.equal(game.debugCommand('/plant repeater 1 9').ok, true)
        assert.equal(game.render().result, before.result)
        assert.equal(game.render().gameplayTick, before.gameplayTick)
    }
})

test('CLI summons and waves use configured spawn positions, while explicit columns override them', () => {
    for (const [type, min, max] of [['normal', 780, 819], ['pole_vaulter', 870, 879]] as const) {
        const game = setup()
        assert.equal(game.debugCommand(`/zombie ${type} 3`).ok, true)
        const zombie = game.render().zombies[0]
        assert.ok(zombie.x >= min && zombie.x <= max, `${type} spawned at ${zombie.x}`)
        assert.equal(game.debugCommand(`/zombie ${type} 3 9`).ok, true)
        const board = definitions.boards['pvz:day']
        assert.equal(game.render().zombies.at(-1)!.x, board.origin.x + 8 * board.cell.width)
    }

    const content = structuredClone(definitions)
    content.zombies['pvz:normal'].spawn = { minX: 930, maxX: 930, flagWaveOffset: 17 }
    const game = setup(true, 'pvz:adventure-1-2', content)
    assert.equal(game.debugCommand('/zombie normal 3').ok, true)
    const summoned = game.render().zombies[0]
    assert.equal(summoned.x, 930)
    assert.equal(game.debugCommand('/nextflag').ok, true)
    const waveZombies = game.render().zombies.filter(zombie => zombie.typeId === 'pvz:normal' && zombie.entityId !== summoned.entityId)
    assert.equal(waveZombies.length, 4)
    assert.ok(waveZombies.every(zombie => zombie.x === 947))
})

test('CLI wave commands spawn flag waves immediately while preserving pause and the gameplay tick', () => {
    const first = setup()
    const wave = first.render().wave
    assert.equal(first.debugCommand('/nextflag').failure, 'condition')
    assert.deepEqual(first.render().wave, wave, 'a level without flags must keep its wave state')
    for (const command of ['/nextflag', '/nextwave']) {
        const game = setup(true, 'pvz:adventure-1-2')
        const tick = game.render().gameplayTick
        const normalWaves = command === '/nextwave' ? 5 : 1
        for (let i = 0; i < normalWaves; i++) assert.equal(game.debugCommand('/nextwave').ok, true)
        game.drainEvents()
        assert.equal(game.debugCommand(command).ok, true)
        const frame = game.render()
        assert.equal(frame.wave.index, 6)
        assert.equal(frame.zombies.filter(zombie => zombie.typeId === 'pvz:flag').length, 1)
        assert.equal(frame.paused, true)
        assert.equal(frame.gameplayTick, tick)
        const events = game.drainEvents()
        assert.equal(events.filter(event => event.type === 'zombieSpawned').length, 5)
        for (const type of ['hugeWave', 'hugeWaveSound', 'finalWave']) {
            assert.equal(events.filter(event => event.type === type).length, 1)
        }
        assert.equal(game.debugCommand('/nextflag').failure, 'condition')
        assert.equal(game.debugCommand('/nextwave').failure, 'condition')
        const save = game.saveAtBoundary()
        const restored = new LocalIntegratedGame(definitions, levels)
        restored.start({ levelId: 'pvz:adventure-1-2', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [], save })
        assert.deepEqual(restored.render(), game.render())
    }
})

test('CLI rule toggles affect authority and a debug win can resume into the normal award flow', () => {
    const game = setup()
    assert.equal(game.debugCommand('/suncost false').ok, true)
    assert.equal(game.debugCommand('/cooldown false').ok, true)
    game.command({ type: 'resume' })
    game.command({ type: 'selectSeed', seedId: 'pvz:peashooter' })
    game.command({ type: 'placePlant', row: 2, column: 0 })
    game.update(0.01)
    assert.equal(game.render().plants.length, 1)
    assert.equal(game.render().sun, 150)
    assert.equal(game.render().seedPackets[0].cooldownRemaining, 0)
    assert.equal(game.debugCommand('/sun set 75').ok, true)
    assert.equal(game.debugCommand('/collect auto').ok, true)
    game.drainEvents()
    assert.equal(game.debugCommand('/item sun').ok, true)
    game.update(0.01)
    assert.equal(game.render().items[0].state, 'collecting')
    assert.equal(game.render().availableSun, 100)
    assert.equal(game.drainEvents().some(event => event.type === 'seedPacketFlashRequested'), false,
        'collecting sun cannot cross an affordability threshold when sun costs are disabled')
    game.command({ type: 'pause' })
    game.update(0)
    assert.equal(game.debugCommand('/win').ok, true)
    game.command({ type: 'resume' })
    game.update(0)
    assert.equal(game.render().result, 'won')
    assert.equal(game.render().paused, false)
    assert.ok(game.drainEvents().some(event => event.type === 'levelWon'))
})
