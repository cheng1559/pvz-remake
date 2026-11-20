import assert from 'node:assert/strict'
import test from 'node:test'
import { itemAt, LEVEL_AWARD, parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { readGameplaySource } from '../../tools/mod/content'
import { adventureSeeds } from './adventure-seeds'
import { runCommand } from './run-command'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)

test('an item is picked by where the click is, as Coin::MouseHitTest has it', () => {
    const day = levels.levels['pvz:adventure-1-1'], whack = levels.levels['pvz:adventure-2-5']
    const lying = (typeId: string, x: number, y: number) => ({ typeId, state: 'available', x, y })
    const sun = lying('pvz:sun', 100, 100), coin = lying('pvz:coin_silver', 300, 100), award = lying(LEVEL_AWARD, 500, 100)
    const items = [sun, coin, award]
    // The sun takes clicks 15 around (COIN_SUN); a coin and the award only on themselves.
    assert.equal(itemAt(items, definitions.items, day, 86, 100), sun)
    assert.equal(itemAt(items, definitions.items, day, 290, 100), undefined)
    assert.equal(itemAt(items, definitions.items, day, 501, 101), award)
    assert.equal(itemAt(items, definitions.items, day, 501, 101, false), undefined, 'the award passed over')
    // Whack-a-Zombie widens every item by 15, and 30 more below.
    assert.equal(itemAt(items, definitions.items, whack, 290, 100), coin)
    assert.equal(itemAt(items, definitions.items, whack, 310, 100 + 60 + 15 + 29), coin)
    // The last of two in one place is on top; one being collected takes no click.
    const over = lying('pvz:coin_gold', 100, 100)
    assert.equal(itemAt([sun, over], definitions.items, day, 110, 110), over)
    assert.equal(itemAt([sun, { ...over, state: 'collecting' }], definitions.items, day, 110, 110), sun)
})

test('the server collects what is at the point it is sent, and nothing for a miss', () => {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ protocolVersion: 1, sequence: 1, type: 'startSession', levelId: 'pvz:adventure-1-1', randomSeed: 12345, initialMoney: 50,
        firstAdventure: true, ownedSeeds: adventureSeeds(levels, 'pvz:adventure-1-1'), mods: [] })
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    // 1-1's first sun falls once the peashooter is down.
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })
    let snapshot = server.snapshot()
    for (let tick = 0; tick < 2000 && !snapshot.items.some(item => item.state === 'available'); tick++) snapshot = server.tick()
    const sun = snapshot.items.find(item => item.state === 'available')!
    assert.equal(runCommand(server, { type: 'collectItemAt', x: sun.x - 100, y: sun.y - 100 }), 'item-not-found')
    assert.equal(runCommand(server, { type: 'collectItemAt', x: sun.x + 30, y: sun.y + 30 }), undefined)
    assert.equal(server.snapshot().items.find(item => item.entityId === sun.entityId)?.state, 'collecting')
})
