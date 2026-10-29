import { readBaseContent, readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { buildGameplayContent } from '@/shared/content/DefinitionRegistry'
import type { GameCommand, JsonValue } from '@/shared/protocol'

const source = readGameplaySource
const definitions = parseGameplayDefinitions(source('definitions'), source('seed-catalog'))
const levels = parseGameplayLevels(source('levels'), definitions)
const options = { levelId: 'pvz:seed-chooser-test', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] }
const seeds = definitions.seedCatalog
const setup = (save?: JsonValue) => {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({ ...options, ...(save === undefined ? {} : { save }) })
    return game
}
const command = (game: LocalIntegratedGame, value: GameCommand) => { game.command(value); game.update(0) }
const chosen = (game: LocalIntegratedGame) => game.render().seedPackets.map(packet => packet.seedId)

test('seed choice is authoritative, ordered, capacity checked and works at an input-only boundary', () => {
    const game = setup()
    assert.equal(game.render().seedChooser?.slots, 6)
    assert.deepEqual(game.render().seedChooser?.availableSeeds, seeds)
    assert.deepEqual(chosen(game), [])
    command(game, { type: 'completeIntro' })
    assert.equal(game.lastRejection?.code, 'seed-choice-incomplete')
    command(game, { type: 'chooseSeed', seedId: 'pvz:explodenut' })
    assert.equal(game.lastRejection?.code, 'seed-not-available')
    command(game, { type: 'confirmSeeds' })
    assert.equal(game.lastRejection?.code, 'seed-choice-incomplete')
    for (const seedId of seeds.slice(0, 6)) command(game, { type: 'chooseSeed', seedId })
    assert.deepEqual(chosen(game), seeds.slice(0, 6))
    assert.equal(game.render().gameplayTick, 0)
    command(game, { type: 'chooseSeed', seedId: seeds[6] })
    assert.equal(game.lastRejection?.code, 'seed-bank-full')
    command(game, { type: 'chooseSeed', seedId: seeds[1] })
    command(game, { type: 'chooseSeed', seedId: seeds[6] })
    assert.deepEqual(chosen(game), [seeds[0], ...seeds.slice(2, 7)])
    assert.equal(game.render().seedChooser?.warning, 'SEED_CHOOSER_SUN_WARNING')
    command(game, { type: 'pause' })
    command(game, { type: 'chooseSeed', seedId: seeds[0] })
    assert.equal(game.lastRejection?.code, 'game-paused')
    command(game, { type: 'resume' })
    command(game, { type: 'confirmSeeds' })
    assert.equal(game.render().seedChooser?.choosing, false)
    command(game, { type: 'chooseSeed', seedId: seeds[1] })
    assert.equal(game.lastRejection?.code, 'not-choosing-seeds')
    command(game, { type: 'completeIntro' })
    assert.equal(game.render().phase, 'gameplay')
})

test('with recharging disabled, chosen seeds skip their opening recharge too', () => {
    const game = new LocalIntegratedGame(definitions, levels, undefined, true)
    game.start(options)
    game.debugCommand('/cooldown false')
    command(game, { type: 'chooseSeed', seedId: 'pvz:cherrybomb' })
    assert.equal(game.render().seedPackets[0].cooldownRemaining, 0)
    game.debugCommand('/cooldown true')
    command(game, { type: 'chooseSeed', seedId: 'pvz:wallnut' })
    assert.equal(game.render().seedPackets[1].cooldownRemaining, definitions.seeds['pvz:wallnut'].initialCooldownTicks)
})

test('with recharging and sun costs disabled, every chosen packet flashes on the first gameplay tick', () => {
    const game = new LocalIntegratedGame(definitions, levels, undefined, true)
    game.start(options)
    game.debugCommand('/cooldown false')
    game.debugCommand('/suncost false')
    const picks = ['pvz:cherrybomb', ...seeds.filter(id => id !== 'pvz:cherrybomb').slice(0, 5)]
    for (const seedId of picks) command(game, { type: 'chooseSeed', seedId })
    command(game, { type: 'confirmSeeds' })
    command(game, { type: 'completeIntro' })
    game.drainEvents()
    while (game.render().gameplayTick < 1) game.update(definitions.tickSeconds)
    const flashed = game.drainEvents().filter(event => event.type === 'seedPacketFlashRequested').map(event => event.data.seedId)
    assert.deepEqual(flashed, picks, 'a 150-sun cherry bomb flashes with the rest despite the 50 starting sun')
})

test('a recharge that runs out flashes once, while one cleared by `/cooldown false` does not', () => {
    const game = new LocalIntegratedGame(definitions, levels, undefined, true)
    game.start(options)
    const picks = ['pvz:wallnut', 'pvz:cherrybomb', ...seeds.filter(id => id !== 'pvz:wallnut' && id !== 'pvz:cherrybomb').slice(0, 4)]
    for (const seedId of picks) command(game, { type: 'chooseSeed', seedId })
    command(game, { type: 'confirmSeeds' })
    command(game, { type: 'completeIntro' })
    const flashes: string[] = []
    const ready = definitions.seeds['pvz:wallnut'].initialCooldownTicks!
    while (game.render().gameplayTick < ready) {
        game.update(definitions.tickSeconds)
        for (const event of game.drainEvents()) if (event.type === 'seedPacketFlashRequested') flashes.push(`${game.render().gameplayTick}:${event.data.seedId}`)
    }
    assert.ok(flashes.includes(`${ready}:pvz:wallnut`), 'the 50-sun wall-nut flashes as its opening recharge ends')
    assert.equal(flashes.filter(flash => flash.endsWith(':pvz:wallnut')).length, 1)
    game.debugCommand('/cooldown false')
    for (let tick = 0; tick < 5; tick++) game.update(definitions.tickSeconds)
    assert.ok(!game.drainEvents().some(event => event.type === 'seedPacketFlashRequested' && event.data.seedId === 'pvz:cherrybomb'),
        'clearing the cherry bomb\'s recharge is not a recharge finishing')
})

test('chooser levels share the global seed catalog, including registered seeds, without a per-level pool', () => {
    const { definitions: expanded, levels: sharedLevels } = buildGameplayContent(
        readBaseContent().gameplay, [{
            ownerId: 'test:chooser', data: {
                seeds: { 'test:pea': { ...definitions.seeds['pvz:peashooter'] } },
                seedCatalog: ['test:pea'],
                levels: { 'test:chooser': { ...levels.levels[options.levelId], seedBankSlots: 4 } },
            },
        }],
    )
    const expected = [...seeds, 'test:pea']
    for (const levelId of [options.levelId, 'test:chooser']) {
        const game = new LocalIntegratedGame(expanded, sharedLevels)
        game.start({ ...options, levelId })
        assert.deepEqual(game.render().seedChooser?.availableSeeds, expected)
        command(game, { type: 'chooseSeed', seedId: 'test:pea' })
        assert.deepEqual(chosen(game), ['test:pea'])
    }
    assert.equal(expected.includes('pvz:bowling-wallnut'), false)
    assert.equal(expected.includes('pvz:explodenut'), false)
})

test('partial and confirmed seed choices survive saving without reselecting or losing slot order', () => {
    const game = setup()
    for (const seedId of seeds.slice(0, 3)) command(game, { type: 'chooseSeed', seedId })
    const restored = setup(game.saveAtBoundary())
    assert.equal(restored.render().seedChooser?.choosing, true)
    assert.deepEqual(chosen(restored), seeds.slice(0, 3))
    for (const seedId of seeds.slice(3, 6)) command(restored, { type: 'chooseSeed', seedId })
    assert.equal(restored.render().seedChooser?.warning, undefined)
    command(restored, { type: 'confirmSeeds' })
    const confirmed = setup(restored.saveAtBoundary())
    assert.equal(confirmed.render().seedChooser?.choosing, false)
    assert.deepEqual(chosen(confirmed), seeds.slice(0, 6))
})
