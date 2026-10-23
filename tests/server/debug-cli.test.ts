import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { getDebugCliCompletions, getDebugCliSuffix, parseDebugCliCommand } from '@/shared/debug/DebugCli'

const definitions = parseGameplayDefinitions(JSON.parse(readFileSync('tools/content/pvz-base/gameplay/definitions.json', 'utf8')))
const levels = parseGameplayLevels(JSON.parse(readFileSync('tools/content/pvz-base/gameplay/levels.json', 'utf8')), definitions)
function setup(debug = true, levelId = 'pvz:adventure-1-1') {
    const game = new LocalIntegratedGame(definitions, levels, undefined, debug)
    game.start({ levelId, randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] })
    game.command({ type: 'completeIntro' })
    game.command({ type: 'pause' })
    game.update(0)
    return game
}

test('CLI accepts old syntax, completes installed content and rejects malformed arguments', () => {
    assert.deepEqual(parseDebugCliCommand(' /PLANT "Pea Shooter" 3 1 '), { name: 'plant', args: ['Pea Shooter', '3', '1'] })
    assert.deepEqual(parseDebugCliCommand('sun set 100'), { name: 'sun', args: ['set', '100'] })
    assert.deepEqual(parseDebugCliCommand('/pack load hd'), { name: 'pack', args: ['load', 'hd'] })
    assert.deepEqual(getDebugCliCompletions('/pack ', undefined, true), ['/pack install', '/pack load', '/pack unload', '/pack uninstall', '/pack list'])
    assert.equal(getDebugCliSuffix('/pack is'), '')
    assert.equal(getDebugCliSuffix('/pack is '), '')
    assert.equal(getDebugCliSuffix('/pack ins'), 'tall')
    assert.equal(getDebugCliSuffix('/pack install'), '')
    assert.equal(getDebugCliSuffix('/pack load'), ' [installed_id]')
    assert.deepEqual(parseDebugCliCommand('/mod load local:widescreen'), { name: 'mod', args: ['load', 'local:widescreen'] })
    assert.deepEqual(getDebugCliCompletions('/mod ', undefined, true), ['/mod install', '/mod load', '/mod unload', '/mod uninstall', '/mod list'])
    assert.equal(getDebugCliSuffix('/mod is'), '')
    assert.equal(getDebugCliSuffix('/mod ins'), 'tall')
    assert.equal(getDebugCliSuffix('/mod install'), '')
    for (const command of ['/unknown', '/win extra', '/cooldown yes', '/pack invalid', '/item sun 3', '/sun remove 1']) {
        assert.equal((parseDebugCliCommand(command) as { failure: string }).failure, 'syntax')
    }
    const game = setup()
    const catalog = game.debugCommand('catalog').catalog!
    assert.deepEqual(catalog.plants, ['sunflower', 'peashooter', 'repeater'])
    assert.deepEqual(getDebugCliCompletions('/plant re', catalog), ['/plant repeater'])
    assert.deepEqual(getDebugCliCompletions('/collect ', catalog, true), ['/collect auto', '/collect click', '/collect move'])
    assert.equal(getDebugCliSuffix('/plant repeater', catalog), ' {row} {col}')
    assert.throws(() => setup(false).debugCommand('/sun set 999'), /unsupported-command/)
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
    assert.equal(game.debugCommand('/collect auto').ok, true)
    assert.equal(game.debugCommand('/item sun').ok, true)
    game.update(0.01)
    assert.equal(game.render().items[0].state, 'collecting')
    game.command({ type: 'pause' })
    game.update(0)
    assert.equal(game.debugCommand('/win').ok, true)
    game.command({ type: 'resume' })
    game.update(0)
    assert.equal(game.render().result, 'won')
    assert.equal(game.render().paused, false)
    assert.ok(game.drainEvents().some(event => event.type === 'levelWon'))
})
