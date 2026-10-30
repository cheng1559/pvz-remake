import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { readGameplaySource } from '../../tools/mod/content'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const money = (game: LocalIntegratedGame) => game.render().items.filter(item => definitions.items[item.typeId]?.kind === 'money')

function play21(initialMoney: number, firstAdventure = true) {
    const game = new LocalIntegratedGame(definitions, levels, undefined, true)
    game.start({ levelId: 'pvz:adventure-2-1', randomSeed: 3, initialMoney, firstAdventure, mods: [] })
    while (game.render().extensions['pvz:dialog']) { game.command({ type: 'advanceDialog' }); game.update(0) }
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
    game.command({ type: 'collectItemAt', itemId: first.entityId })
    for (let tick = 0; tick < 300 && game.render().items.some(item => item.entityId === first.entityId); tick++) game.update(definitions.tickSeconds)
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
    for (let wave = 0; wave < levels.levels['pvz:adventure-2-1'].waves.length; wave++) game.debugCommand('/nextwave')
    game.debugCommand('/damage 5000')
    const award = game.render().items.find(item => item.typeId === 'pvz:sunshroom')!
    game.command({ type: 'collectItemAt', itemId: award.entityId })
    game.update(0)
    game.drainEvents()
    const purse = game.render().money + money(game).reduce((sum, item) => sum + definitions.items[item.typeId].value, 0)
    const scored: number[] = []
    for (let tick = 1; tick <= 600; tick++) {
        game.update(definitions.tickSeconds)
        if (game.drainEvents().some(event => event.type === 'mowerScored')) scored.push(tick)
    }
    assert.deepEqual(scored, [200, 240, 280, 320, 360])
    assert.equal(game.render().lawnMowers.length, 0)
    assert.equal(game.render().money, purse + 25)
})
