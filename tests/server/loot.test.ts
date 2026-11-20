import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { World } from '@/server/state/World'
import { dropZombieLoot } from '@/server/level/loot'
import { EconomyStateResource, LevelStateResource, RandomResource, TutorialResource } from '@/server/state/resources'
import { createEventQueue, EventQueueResource } from '@/server/state/events'
import { spawnZombie } from '@/server/zombies/spawn'
import { LEVEL_AWARD, parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { readGameplaySource } from '../../tools/mod/content'
import { TICK_SECONDS } from '@/shared/protocol'
import { withZombieTypes } from '../zombieTypes'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const money = (game: LocalIntegratedGame) => game.render().items.filter(item => definitions.items[item.typeId]?.kind === 'money')

test('Zombie::DropLoot: a zombie the level does not pick still drops at its own value (mZombieValue)', () => {
    /** What a replay of 1-1 (whose pool has only the plain zombie) drops for `typeId` on a roll of `roll`. */
    const drop = (typeId: string, roll: number, ownedUpgrades = 0) => {
        const world = withZombieTypes(new World(), definitions)
        world.resources.set(LevelStateResource, { id: 'pvz:adventure-1-1', definition: levels.levels['pvz:adventure-1-1'], board: definitions.boards['pvz:day'], phase: 'gameplay', result: 'playing', paused: false } as never)
        world.resources.set(TutorialResource, { firstAdventure: false, step: 'complete', displayedAdvice: [] })
        world.resources.set(EconomyStateResource, { sun: 0, money: 0, pendingSunSpend: 0, packetUpgrades: 0, ownedUpgrades })
        world.resources.set(RandomResource, { integer: (min: number, max: number) => min === 0 && max === 29999 ? roll : min, nextFloat: () => 0.5 } as never)
        world.resources.set(EventQueueResource, createEventQueue())
        dropZombieLoot(world, definitions, spawnZombie(world, definitions, typeId, 2, 500, 0), world)
        return [...world.items].map(item => item.typeId)
    }
    // Board::DropLootPiece: silver below 2500 times the value.
    assert.deepEqual(drop('pvz:normal', 2500), [], 'a plain zombie, worth 1')
    assert.deepEqual(drop('pvz:buckethead', 2500), ['pvz:coin_silver'], 'a buckethead outside the pool, worth its 4')
    assert.deepEqual(drop('pvz:buckethead', 4 * 2500), [])
    // A diamond below 14 times it, gold while the player owns no seed-slot upgrade (mPurchases, as the drop comes).
    assert.deepEqual(drop('pvz:normal', 13), ['pvz:coin_gold'])
    assert.deepEqual(drop('pvz:normal', 13, 1), ['pvz:diamond'])
})

function play21(initialMoney: number, firstAdventure = true) {
    const game = new LocalIntegratedGame(definitions, levels, undefined, true)
    game.start({ levelId: 'pvz:adventure-2-1', randomSeed: 3, initialMoney, firstAdventure, mods: [] })
    while (game.render().dialog) { game.command({ type: 'advanceDialog' }); game.update(0) }
    for (const seedId of ['puffshroom', 'sunflower', 'peashooter', 'wallnut', 'cherrybomb', 'potatomine']) game.command({ type: 'chooseSeed', seedId: `pvz:${seedId}` })
    game.command({ type: 'confirmSeeds' })
    game.command({ type: 'completeIntro' })
    game.update(0)
    return game
}

test('2-1 guarantees a first coin with a pickup arrow after wave 5; collected money joins the purse', () => {
    const game = play21(0)
    for (let wave = 0; wave < 6; wave++) game.debugCommand('/nextwave')
    game.debugCommand('/damage 5000')
    const [first] = money(game).filter(item => item.arrow)
    assert.equal(first?.typeId, 'pvz:coin_silver', 'Board::DropLootPiece forces the roll to 1000 for the first coin')
    const before = game.render().money
    game.drainEvents()
    game.command({ type: 'collectItemAt', x: first.x + 1, y: first.y + 1 })
    for (let tick = 0; tick < 300 && game.render().items.some(item => item.entityId === first.entityId); tick++) game.update(TICK_SECONDS)
    assert.equal(game.render().money, before + 1)
    const advice = game.drainEvents().filter(event => event.type === 'advice').map(event => event.data.key)
    assert.deepEqual(advice, ['ADVICE_CLICKED_ON_COIN'], 'Coin::Collect explains money on the first 2-1')
})

test('2-1 drops nothing that would bring the purse and the mowers\' gold to the seed-slot price', () => {
    const game = play21(50)
    for (let wave = 0; wave < 6; wave++) game.debugCommand('/nextwave')
    game.debugCommand('/damage 5000')
    assert.deepEqual(money(game), [], '50 + 5 mowers x 5 + 1 reaches 75')
})

test('after the award, each unused mower turns into five coins of gold, 200 ticks then every 40', () => {
    const game = play21(0, false)
    for (let wave = 0; wave < game.render().wave.total; wave++) game.debugCommand('/nextwave')
    game.debugCommand('/damage 5000')
    const award = game.render().items.find(item => item.typeId === LEVEL_AWARD)!
    game.command({ type: 'collectItemAt', x: award.x + 1, y: award.y + 1 })
    game.update(0)
    game.drainEvents()
    const purse = game.render().money + money(game).reduce((sum, item) => sum + definitions.items[item.typeId].value, 0)
    const scored: number[] = []
    for (let tick = 1; tick <= 600; tick++) {
        game.update(TICK_SECONDS)
        if (game.drainEvents().some(event => event.type === 'mowerScored')) scored.push(tick)
    }
    assert.deepEqual(scored, [200, 240, 280, 320, 360])
    assert.equal(game.render().mowers.length, 0, 'each mower is gone for its gold')
    assert.equal(game.render().money, purse + 25)
})

test('a first adventure drops money from level 11 on, also on levels without a script', () => {
    // Mower gold after the award follows Board::CanDropLoot, so it shows the rule without depending on zombie rolls.
    const mowerGold = (adventureIndex: number) => {
        const { tutorial: _script, ...level } = { ...levels.levels['pvz:adventure-2-2'], adventureIndex }
        const game = new LocalIntegratedGame(definitions, { ...levels, levels: { ...levels.levels, 'test:level': level } }, undefined, true)
        game.start({ levelId: 'test:level', randomSeed: 3, initialMoney: 0, firstAdventure: true, mods: [] })
        for (const seedId of game.render().seedChooser?.availableSeeds.slice(0, game.render().seedChooser!.slots) ?? []) game.command({ type: 'chooseSeed', seedId })
        game.command({ type: 'confirmSeeds' })
        game.command({ type: 'completeIntro' })
        game.update(0)
        for (let wave = 0; wave < game.render().wave.total; wave++) game.debugCommand('/nextwave')
        game.debugCommand('/damage 5000')
        const award = game.render().items.find(item => item.typeId === LEVEL_AWARD)!
        game.command({ type: 'collectItemAt', x: award.x + 1, y: award.y + 1 })
        game.update(0)
        game.drainEvents()
        let scored = 0
        for (let tick = 1; tick <= 600; tick++) {
            game.update(TICK_SECONDS)
            scored += game.drainEvents().filter(event => event.type === 'mowerScored').length
        }
        return scored
    }
    assert.equal(mowerGold(10), 0, 'no money before 2-1')
    assert.equal(mowerGold(14), 5, 'a level after 2-3 needs no script to drop money')
})
