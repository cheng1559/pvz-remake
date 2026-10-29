import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
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
    assert.deepEqual(parseDebugCliCommand('/grave 3 2'), { name: 'grave', args: ['3', '2'] })
    assert.deepEqual(parseDebugCliCommand('/mod'), { name: 'mod', args: [] })
    assert.deepEqual(getDebugCliCompletions('/mod ', undefined, true), [])
    assert.equal(getDebugCliSuffix('/mod'), '')
    assert.equal(getDebugCliSuffix('/'), '', 'a bare slash suggests nothing until a letter is typed')
    assert.deepEqual(getDebugCliCompletions('/', undefined, true), [], 'nor does Tab')
    assert.equal(getDebugCliSuffix('/mod ins'), '')
    for (const args of ['install', 'load local:widescreen', 'unload all', 'uninstall local:hd', 'list']) {
        assert.equal((parseDebugCliCommand('/mod ' + args) as { failure: string }).failure, 'syntax')
    }
    for (const command of ['/unknown', '/win extra', '/cooldown yes', '/mod invalid', '/item sun 3', '/sun remove 1', '/hdseed true', '/hdseed false', '/grave', '/grave 3', '/grave 3 2 1']) {
        assert.equal((parseDebugCliCommand(command) as { failure: string }).failure, 'syntax')
    }
    assert.deepEqual(getDebugCliCompletions('/hd'), [])
    assert.equal(getDebugCliSuffix('/hdseed'), '')
    const game = setup()
    const catalog = game.debugCommand('catalog').catalog!
    assert.deepEqual(catalog.plants, ['bowling-wallnut', 'bowling-explodenut', 'sunflower', 'peashooter', 'repeater', 'cherrybomb', 'wallnut', 'potatomine', 'snowpea', 'chomper', 'explodenut', 'puffshroom', 'sunshroom', 'fumeshroom', 'gravebuster'])
    assert.deepEqual(catalog.zombies, ['flag', 'normal', 'conehead', 'buckethead', 'pole_vaulter', 'newspaper'])
    assert.deepEqual(getDebugCliCompletions('/plant re', catalog), ['/plant repeater'])
    assert.deepEqual(getDebugCliCompletions('/seed 1 sn', catalog), ['/seed 1 snowpea'])
    assert.deepEqual(getDebugCliCompletions('/collect ', catalog, true), ['/collect auto', '/collect click', '/collect move'])
    assert.deepEqual(getDebugCliCompletions('/plantinvincible ', catalog, true), ['/plantinvincible true', '/plantinvincible false'])
    assert.equal((parseDebugCliCommand('/plantinvincible yes') as { failure: string }).failure, 'syntax')
    assert.equal(getDebugCliSuffix('/plant repeater', catalog), ' {row} {col}')
    assert.throws(() => setup(false).debugCommand('/sun set 999'), /unsupported-command/)
})

test('CLI graves appear while paused, block planting and survive saves outside the authored layout', () => {
    const game = setup()
    const tick = game.render().gameplayTick
    for (const command of ['/grave 0 1', '/grave 6 1', '/grave 1 10', '/grave nope 1']) {
        assert.equal(game.debugCommand(command).failure, 'syntax')
    }
    assert.equal(game.debugCommand('/grave 3 2').ok, true)
    assert.equal(game.debugCommand('/grave 1 9').ok, true, 'debug commands can use inactive board rows')
    const graves = game.render().graves!
    assert.deepEqual(graves.map(({ row, column }) => [row, column]), [[2, 1], [0, 8]])
    assert.equal(game.render().paused, true)
    assert.equal(game.render().gameplayTick, tick)
    assert.equal(game.debugCommand('/grave 3 2').failure, 'condition')
    assert.equal(game.debugCommand('/plant wallnut 3 3').ok, true)
    assert.equal(game.debugCommand('/grave 3 3').failure, 'condition')
    assert.deepEqual(game.render().graves, graves)
    const save = game.saveAtBoundary()
    const restored = new LocalIntegratedGame(definitions, levels, undefined, true)
    restored.start({ levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [], save })
    assert.deepEqual(restored.render(), game.render())
    game.command({ type: 'resume' })
    game.command({ type: 'selectSeed', seedId: 'pvz:peashooter' })
    game.command({ type: 'placePlant', row: 2, column: 1 })
    game.update(0)
    assert.equal(game.lastRejection?.code, 'cell-has-grave')

    const finalSave = JSON.parse(JSON.stringify(save))
    finalSave.wave.index = levels.levels['pvz:adventure-1-1'].waves.length - 1
    finalSave.wave.nextWaveAtTick = finalSave.gameplayTick + 1
    finalSave.wave.hugeWaveAnnounced = true
    finalSave.level.paused = false
    const final = new IntegratedGameServer(definitions, levels)
    final.restore(finalSave)
    for (let tick = 0; tick < 300; tick++) final.tick()
    assert.equal(final.snapshot().wave.index, levels.levels['pvz:adventure-1-1'].waves.length)
    assert.deepEqual(final.snapshot().graves, graves, 'day levels keep graves without scheduling unsupported grave zombies')
})

test('plant invincibility blocks bites until disabled and does not prevent removal', () => {
    const game = setup()
    assert.equal(game.debugCommand('/plant wallnut 3 2').ok, true)
    assert.equal(game.debugCommand('/zombie normal 3 3').ok, true)
    assert.equal(game.debugCommand('/plantinvincible true').ok, true)
    assert.equal(game.render().paused, true)
    assert.equal(game.debugCommand('/plant wallnut 2 2').ok, true)
    const before = game.render().plants.map(plant => plant.health)
    game.command({ type: 'resume' })
    game.update(8)
    assert.equal(game.render().zombies[0].state, 'eating')
    assert.deepEqual(game.render().plants.map(plant => plant.health), before)
    assert.equal(game.debugCommand('/plantinvincible false').ok, true)
    game.update(2)
    assert.ok(game.render().plants.find(plant => plant.row === 2)!.health < before[0])
    assert.equal(game.debugCommand('/plantinvincible true').ok, true)
    assert.equal(game.debugCommand('/removeplant 3 2').ok, true)
    assert.equal(game.render().plants.some(plant => plant.row === 2), false)
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
    for (const command of ['/seed 0 snowpea', '/seed 3 snowpea', '/seed 1 missing']) {
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

test('CLI can put one seed in two slots; each slot recharges, flashes and restores on its own', () => {
    const game = setup(true, 'pvz:adventure-1-2')
    game.debugCommand('/sun set 500')
    assert.equal(game.debugCommand('/seed 1 sunflower').ok, true)
    game.command({ type: 'resume' })
    game.update(definitions.tickSeconds)
    assert.deepEqual(game.render().seedPackets.map(packet => packet.seedId), ['pvz:sunflower', 'pvz:sunflower'])
    game.command({ type: 'selectSeed', seedId: 'pvz:sunflower', slot: 1 })
    game.update(0)
    assert.deepEqual(game.render().seedPackets.map(packet => packet.selected), [false, true])
    game.command({ type: 'placePlant', row: 2, column: 0 })
    game.update(0)
    const cooldown = definitions.seeds['pvz:sunflower'].cooldownTicks
    assert.deepEqual(game.render().seedPackets.map(packet => packet.cooldownRemaining), [0, cooldown])
    // Without a slot, the ready copy is picked over the recharging one.
    game.command({ type: 'selectSeed', seedId: 'pvz:sunflower' })
    game.update(0)
    assert.deepEqual(game.render().seedPackets.map(packet => packet.selected), [true, false])
    game.command({ type: 'clearCursor' })
    game.drainEvents()
    for (let i = 0; i < cooldown; i++) game.update(definitions.tickSeconds)
    const flashes = game.drainEvents().filter(event => event.type === 'seedPacketFlashRequested').map(event => event.data.slot)
    assert.deepEqual(flashes, [1], 'only the recharged slot flashes')
    const restored = new LocalIntegratedGame(definitions, levels, undefined, true)
    restored.start({ levelId: 'pvz:adventure-1-2', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [], save: game.saveAtBoundary() })
    assert.deepEqual(restored.render().seedPackets, game.render().seedPackets)
})
