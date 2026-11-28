import assert from 'node:assert/strict'
import test from 'node:test'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { StartSessionPacket } from '@/shared/protocol'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'
import { adventureSeeds } from './adventure-seeds'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-2-2', randomSeed: 3, initialMoney: 0, firstAdventure: true, ownedSeeds: adventureSeeds(levels, 'pvz:adventure-2-2'), mods: [] }
const offer = { cost: 75 }

function start(packet: Partial<StartSessionPacket> = {}) {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, ...packet })
    return server
}

/** The lines Dave says, clicked through. */
function lines(server: IntegratedGameServer, count: number): number[] {
    const said: number[] = []
    for (let line = 0; line < count; line++) {
        said.push(server.snapshot().dialog!.index)
        assert.equal(runCommand(server, { type: 'advanceDialog' }), undefined)
    }
    return said
}

test('2-2 tells what has been saved and what Dave will sell once the price is (CutScene::StartLevelIntro, 1401)', () => {
    // The price is the next upgrade's: the first slot's, or the second's to one who owns the first.
    for (const packet of [{ initialMoney: 74, packetUpgradeOffer: offer }, { initialMoney: 499, packetUpgradeOffer: { cost: 500 }, packetUpgrades: 1 }]) {
        const server = start(packet)
        assert.deepEqual(lines(server, 2), [1401, 1402], JSON.stringify(packet))
        assert.equal(server.snapshot().dialog, undefined)
        assert.equal(server.snapshot().tutorial.step, 'complete')
        assert.equal(server.snapshot().seedChooser!.slots, 6 + (packet.packetUpgrades ?? 0))
    }
    for (const packet of [
        { initialMoney: 2000, packetUpgradeOffer: offer, firstAdventure: false },
        { initialMoney: 74 },
        { initialMoney: 2000 },
        { initialMoney: 20000, packetUpgradeOffer: { cost: 2000 }, packetUpgrades: 2 },
    ]) {
        const server = start(packet)
        assert.equal(server.snapshot().dialog, undefined, JSON.stringify(packet))
        assert.equal(server.snapshot().tutorial.step, 'complete')
    }
})

test('one who can afford the first seed slot on 2-2 is offered it there, as from 2-3 on (not the original, which never gets there)', () => {
    const bought = start({ initialMoney: 80, packetUpgradeOffer: offer })
    assert.deepEqual(lines(bought, 2), [1501, 1502])
    assert.deepEqual(bought.snapshot().dialog, { index: 1503, question: { kind: 'pvz:packetUpgrade', cost: 75, slots: 7 } })
    assert.equal(runCommand(bought, { type: 'answerDialog', accept: true }), undefined)
    assert.deepEqual([bought.snapshot().money, bought.snapshot().seedChooser!.slots], [5, 7])
    assert.deepEqual(lines(bought, 2), [1510, 1511])
    assert.equal(bought.snapshot().dialog, undefined)

    const declined = start({ initialMoney: 80, packetUpgradeOffer: offer })
    lines(declined, 2)
    runCommand(declined, { type: 'advanceDialog' })
    assert.equal(runCommand(declined, { type: 'answerDialog', accept: false }), undefined)
    assert.deepEqual(lines(declined, 1), [1520])
    assert.deepEqual([declined.snapshot().dialog, declined.snapshot().money, declined.snapshot().seedChooser!.slots], [undefined, 80, 6])
})

test('one who owns the first seed slot and can afford the second is offered it on 2-2, as from 2-6 on', () => {
    const server = start({ initialMoney: 600, packetUpgradeOffer: { cost: 500 }, packetUpgrades: 1 })
    assert.deepEqual(lines(server, 2), [1551, 1552])
    assert.deepEqual(server.snapshot().dialog, { index: 1553, question: { kind: 'pvz:packetUpgrade', cost: 500, slots: 8 } })
    assert.equal(runCommand(server, { type: 'answerDialog', accept: true }), undefined)
    assert.deepEqual([server.snapshot().money, server.snapshot().seedChooser!.slots], [100, 8])
    assert.deepEqual(lines(server, 1), [1560])
    assert.equal(server.snapshot().dialog, undefined)
})
