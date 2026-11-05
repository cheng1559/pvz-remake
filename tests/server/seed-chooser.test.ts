import { readBaseContent, readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { chooserSeeds, parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { buildGameplayContent } from '@/shared/content/DefinitionRegistry'
import type { GameCommand, JsonValue } from '@/shared/protocol'
import { adventureSeeds } from './adventure-seeds'
import { seedChooser } from '@/server/seeds/seedChooser'
import { TICK_SECONDS } from '@/shared/protocol'

const source = readGameplaySource
const definitions = parseGameplayDefinitions(source('definitions'), source('seed-catalog'))
const levels = parseGameplayLevels(source('levels'), definitions)
const options = { levelId: 'pvz:seed-chooser-test', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] }
const seeds = chooserSeeds(definitions)
const setup = (save?: JsonValue) => {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({ ...options, ...(save === undefined ? {} : { save }) })
    return game
}
const command = (game: LocalIntegratedGame, value: GameCommand) => { game.command(value); game.update(0) }
const chosen = (game: LocalIntegratedGame) => game.render().seedPackets.map(packet => packet.seedId)

test('the bank fills with the available seeds while they fit and opens the chooser once there are more', () => {
    const start = (levelId: string, firstAdventure: boolean, packetUpgrades = 0) => {
        const game = new LocalIntegratedGame(definitions, levels)
        // A first adventure owns what the earlier levels awarded; a replay's player has collected every seed.
        game.start({ ...options, levelId, firstAdventure, ...(firstAdventure ? { ownedSeeds: adventureSeeds(levels, levelId) } : {}),
            ...(packetUpgrades ? { packetUpgrades } : {}) })
        return game.render()
    }
    // Board::InitLevel: a first adventure's bank holds every unlocked seed, in order, up to level 7.
    const firstSeven = ['pvz:peashooter', 'pvz:sunflower', 'pvz:cherrybomb', 'pvz:wallnut', 'pvz:potatomine', 'pvz:snowpea']
    for (const [levelId, count] of [['1-1', 1], ['1-2', 2], ['1-3', 3], ['1-4', 4], ['1-6', 5], ['1-7', 6]] as const) {
        const snapshot = start(`pvz:adventure-${levelId}`, true)
        assert.deepEqual([snapshot.seedPackets.map(packet => packet.seedId), snapshot.seedChooser], [firstSeven.slice(0, count), undefined], levelId)
    }
    // Board::ChooseSeedsOnCurrentLevel: 1-8 is the first with more seeds (7) than slots (6), and every replay chooses.
    assert.equal(start('pvz:adventure-1-8', true).seedChooser?.slots, 6)
    assert.equal(start('pvz:adventure-1-1', false).seedChooser?.slots, 6)
    // Board::GetNumSeedsInBank: 6 plus the upgrades, never more than the seeds there are.
    assert.equal(start('pvz:adventure-1-8', true, 3).seedChooser, undefined, 'nine slots take all seven seeds, so nothing is chosen')
    assert.equal(start('pvz:adventure-1-8', false, 3).seedChooser?.slots, 9)
    assert.equal(start('pvz:adventure-1-5', true).seedPackets.length, 0, 'a conveyor level starts with an empty bank')
    // The owned seeds are the bank's, in catalog order; ones the catalog lacks are left out.
    const owning = new LocalIntegratedGame(definitions, levels)
    owning.start({ ...options, levelId: 'pvz:adventure-1-1', ownedSeeds: ['pvz:hypnoshroom', 'test:missing', 'pvz:peashooter'] })
    assert.deepEqual(owning.render().seedPackets.map(packet => packet.seedId), ['pvz:peashooter', 'pvz:hypnoshroom'])
    // CutScene::ShowShovel: the 1-4 award, from 1-5 on a first adventure and on every replay.
    const owned = (levelId: string, firstAdventure: boolean) => (start(levelId, firstAdventure).extensions['pvz:tools'] as { owned: string[] } | undefined)?.owned
    assert.deepEqual([owned('pvz:adventure-1-4', true), owned('pvz:adventure-1-5', true), owned('pvz:adventure-1-1', false)], [undefined, ['pvz:shovel'], ['pvz:shovel']])
})

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
    assert.deepEqual(game.render().seedChooser?.warnings, ['SEED_CHOOSER_SUN_WARNING'])
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
    while (game.render().gameplayTick < 1) game.update(TICK_SECONDS)
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
        game.update(TICK_SECONDS)
        for (const event of game.drainEvents()) if (event.type === 'seedPacketFlashRequested') flashes.push(`${game.render().gameplayTick}:${event.data.seedId}`)
    }
    assert.ok(flashes.includes(`${ready}:pvz:wallnut`), 'the 50-sun wall-nut flashes as its opening recharge ends')
    assert.equal(flashes.filter(flash => flash.endsWith(':pvz:wallnut')).length, 1)
    game.debugCommand('/cooldown false')
    for (let tick = 0; tick < 5; tick++) game.update(TICK_SECONDS)
    assert.ok(!game.drainEvents().some(event => event.type === 'seedPacketFlashRequested' && event.data.seedId === 'pvz:cherrybomb'),
        'clearing the cherry bomb\'s recharge is not a recharge finishing')
})

test('chooser levels share the global seed catalog, including registered seeds, without a per-level pool', () => {
    const { definitions: expanded, levels: sharedLevels } = buildGameplayContent(
        readBaseContent().gameplay, [{
            ownerId: 'test', data: {
                seeds: { 'test:pea': { ...definitions.seeds['pvz:peashooter'] } },
                seedCatalog: { 'test:pea': { position: 20 } },
                levels: { 'test:chooser': { ...levels.levels[options.levelId] } },
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

test('the seed catalog is a table of grid places that Mods extend and override', () => {
    // The grid holds the original's 48 plant seed types; the hidden seeds follow the Imitater's 48 from
    // SEED_EXPLODE_O_NUT (49), so the chooser never offers them.
    assert.deepEqual(['pvz:explodenut', 'pvz:bowling-wallnut', 'pvz:bowling-explodenut'].map(id => definitions.seedCatalog[id].position), [49, 50, 51])
    assert.deepEqual(seeds.map(id => definitions.seedCatalog[id].position), seeds.map((_, index) => index))
    const build = (data: Record<string, unknown>) => buildGameplayContent(readBaseContent().gameplay, [{ ownerId: 'test', data }]).definitions
    // Overrides move anyone's seed; the chooser follows place order and skips the gap left behind.
    const moved = build({ overrides: { seedCatalog: { 'pvz:sunflower': { position: 30 }, 'pvz:explodenut': { position: 13 } } } })
    assert.deepEqual(chooserSeeds(moved), [...seeds.filter(id => id !== 'pvz:sunflower'), 'pvz:explodenut', 'pvz:sunflower']
        .sort((left, right) => moved.seedCatalog[left].position - moved.seedCatalog[right].position))
    assert.equal(chooserSeeds(moved).includes('pvz:explodenut'), true)
    // The upgrade plants' sixth row (40-47) is offered; the Imitater's place (48) and beyond are not.
    const edges = build({ overrides: { seedCatalog: { 'pvz:explodenut': { position: 47 }, 'pvz:bowling-wallnut': { position: 48 } } } })
    assert.equal(chooserSeeds(edges).at(-1), 'pvz:explodenut')
    assert.equal(chooserSeeds(edges).includes('pvz:bowling-wallnut'), false)
    // A Mod registers only its own seeds; two seeds cannot share a place.
    assert.throws(() => build({ seedCatalog: { 'pvz:explodenut': { position: 13 } } }), /cannot register/)
    assert.throws(() => build({ seeds: { 'test:pea': { ...definitions.seeds['pvz:peashooter'] } }, seedCatalog: { 'test:pea': { position: 0 } } }),
        /same place/)
})

test('Mods offer cards beyond the grid, on either side, which the bank tells apart and a save keeps', () => {
    const original = seedChooser.entries
    seedChooser.entries = (defs, owned) => [...original(defs, owned),
        { seedId: 'pvz:explodenut' }, { seedId: 'pvz:zombie-normal', team: 'plants' }, { seedId: 'pvz:zombie-normal' },
        // The seed's own side is the same card as no side at all, so an owned grid seed is offered already.
        { seedId: 'pvz:peashooter', team: 'zombies' }, { seedId: 'pvz:sunflower', team: 'plants' }, { seedId: 'pvz:explodenut' }, { seedId: 'test:missing' }]
    try {
        const game = setup()
        assert.deepEqual(game.render().seedChooser?.entries, [
            { seedId: 'pvz:explodenut' }, { seedId: 'pvz:zombie-normal', team: 'plants' }, { seedId: 'pvz:zombie-normal' },
            { seedId: 'pvz:peashooter', team: 'zombies' },
        ])
        const packets = () => game.render().seedPackets.map(packet => ({ seedId: packet.seedId, ...(packet.team ? { team: packet.team } : {}) }))
        command(game, { type: 'chooseSeed', seedId: 'pvz:explodenut' })
        command(game, { type: 'chooseSeed', seedId: 'pvz:zombie-normal', team: 'plants' })
        command(game, { type: 'chooseSeed', seedId: 'pvz:zombie-normal', team: 'zombies' })
        command(game, { type: 'chooseSeed', seedId: 'pvz:peashooter', team: 'zombies' })
        command(game, { type: 'chooseSeed', seedId: 'pvz:peashooter' })
        assert.deepEqual(packets(), [{ seedId: 'pvz:explodenut' }, { seedId: 'pvz:zombie-normal', team: 'plants' }, { seedId: 'pvz:zombie-normal' },
            { seedId: 'pvz:peashooter', team: 'zombies' }, { seedId: 'pvz:peashooter' }])
        // Not offered: a hidden seed on the other side, or a seed the chooser does not list.
        game.command({ type: 'chooseSeed', seedId: 'pvz:explodenut', team: 'zombies' })
        game.command({ type: 'chooseSeed', seedId: 'pvz:bowling-wallnut' })
        game.update(0)
        assert.equal(packets().length, 5)
        // Each side goes back on its own.
        command(game, { type: 'chooseSeed', seedId: 'pvz:zombie-normal', team: 'plants' })
        assert.deepEqual(packets().map(packet => packet.team), [undefined, undefined, 'zombies', undefined])
        command(game, { type: 'chooseSeed', seedId: 'pvz:zombie-normal', team: 'plants' })
        const save = game.saveAtBoundary()
        // A save holds them even once nothing offers them any more, and they can still go back.
        seedChooser.entries = original
        const restored = setup(save)
        assert.deepEqual(restored.render().seedPackets.map(packet => [packet.seedId, packet.team]), packets().map(packet => [packet.seedId, packet.team]))
        assert.equal(restored.render().seedChooser?.entries, undefined)
        command(restored, { type: 'chooseSeed', seedId: 'pvz:explodenut' })
        assert.equal(restored.render().seedPackets.some(packet => packet.seedId === 'pvz:explodenut'), false)
    } finally {
        seedChooser.entries = original
    }
})

test('one chooser offer serves each operation, so a changing Mod answer cannot split slots from cards', () => {
    const original = seedChooser.entries
    let calls = 0
    // A Mod whose answer changes from call to call: each operation asks once and works from that answer.
    seedChooser.entries = (defs, owned) => [...original(defs, owned), ...['pvz:explodenut', 'pvz:bowling-wallnut', 'pvz:bowling-explodenut']
        .slice(0, ++calls % 3 + 1).map(seedId => ({ seedId }))]
    try {
        const game = setup()
        calls = 0
        game.update(TICK_SECONDS)
        assert.equal(calls, 1, 'one snapshot asks once')
        calls = 0
        game.command({ type: 'chooseSeed', seedId: 'pvz:explodenut' })
        game.update(0)
        assert.equal(calls, 2, 'the choice and the snapshot after it ask once each')
    } finally {
        seedChooser.entries = original
    }
})

test("a Mod's cards count like owned seeds towards the slots and opening the chooser", () => {
    const original = seedChooser.entries
    const start = (cards: Array<{ seedId: string, team?: 'plants' | 'zombies' }>) => {
        seedChooser.entries = (defs, owned) => [...original(defs, owned), ...cards]
        const game = new LocalIntegratedGame(definitions, levels)
        // A first adventure's 1-1 owns the Peashooter alone, so the base fills its one slot without a chooser.
        game.start({ ...options, levelId: 'pvz:adventure-1-1', firstAdventure: true, ownedSeeds: adventureSeeds(levels, 'pvz:adventure-1-1') })
        return game
    }
    try {
        const plain = start([]).render()
        assert.deepEqual([plain.seedChooser, plain.seedPackets.map(packet => packet.seedId)], [undefined, ['pvz:peashooter']])
        // A few more cards still fit: they all go in the bank, in order, each on its side.
        const few = start([{ seedId: 'pvz:explodenut' }, { seedId: 'pvz:zombie-normal', team: 'plants' }]).render()
        assert.deepEqual([few.seedChooser, few.seedPackets.map(packet => [packet.seedId, packet.team])],
            [undefined, [['pvz:peashooter', undefined], ['pvz:explodenut', undefined], ['pvz:zombie-normal', 'plants']]])
        // More cards than slots open the chooser, with the full six slots.
        const many = ['pvz:explodenut', 'pvz:bowling-wallnut', 'pvz:bowling-explodenut', 'pvz:zombie-normal', 'pvz:zombie-conehead', 'pvz:zombie-flag']
        const game = start(many.map(seedId => ({ seedId })))
        assert.deepEqual([game.render().seedChooser?.slots, game.render().seedChooser?.availableSeeds], [6, ['pvz:peashooter']])
        for (const seedId of ['pvz:peashooter', ...many.slice(0, 5)]) command(game, { type: 'chooseSeed', seedId })
        command(game, { type: 'confirmSeeds' })
        assert.equal(game.render().seedChooser?.choosing, false)
        assert.deepEqual(chosen(game), ['pvz:peashooter', ...many.slice(0, 5)])
    } finally {
        seedChooser.entries = original
    }
})

test('a chosen bank that started with empty slots loads, as a Mod may start it before the bank is full', () => {
    const game = setup()
    for (const seedId of seeds.slice(0, 6)) command(game, { type: 'chooseSeed', seedId })
    command(game, { type: 'confirmSeeds' })
    const save = game.saveAtBoundary() as { seedBank: { packets: unknown[] } }
    save.seedBank.packets.splice(3)
    const restored = setup(save as unknown as JsonValue)
    assert.deepEqual([restored.render().seedChooser?.choosing, restored.render().seedChooser?.slots, chosen(restored)], [false, 6, seeds.slice(0, 3)])
    // A bank without a chooser still holds exactly its seeds.
    const start = { ...options, levelId: 'pvz:adventure-1-1', firstAdventure: true, ownedSeeds: adventureSeeds(levels, 'pvz:adventure-1-1') }
    const fixed = new LocalIntegratedGame(definitions, levels)
    fixed.start(start)
    const fixedSave = fixed.saveAtBoundary() as { seedBank: { packets: unknown[] } }
    fixedSave.seedBank.packets.length = 0
    assert.throws(() => new LocalIntegratedGame(definitions, levels).start({ ...start, save: fixedSave as unknown as JsonValue }), /seed bank size/)
})

test('partial and confirmed seed choices survive saving without reselecting or losing slot order', () => {
    const game = setup()
    for (const seedId of seeds.slice(0, 3)) command(game, { type: 'chooseSeed', seedId })
    const restored = setup(game.saveAtBoundary())
    assert.equal(restored.render().seedChooser?.choosing, true)
    assert.deepEqual(chosen(restored), seeds.slice(0, 3))
    for (const seedId of seeds.slice(3, 6)) command(restored, { type: 'chooseSeed', seedId })
    assert.equal(restored.render().seedChooser?.warnings, undefined)
    command(restored, { type: 'confirmSeeds' })
    const confirmed = setup(restored.saveAtBoundary())
    assert.equal(confirmed.render().seedChooser?.choosing, false)
    assert.deepEqual(chosen(confirmed), seeds.slice(0, 6))
})
