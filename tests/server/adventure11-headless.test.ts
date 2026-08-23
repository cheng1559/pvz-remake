import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { parseGameplayDefinitionsV2, parseGameplayLevelsV2 } from '@/shared/content/gameplay'
import type { GameCommand, StartSessionPacket, WorldSnapshot } from '@/shared/protocol/index'
import { runCommand } from './run-command'

const source = (name: string): unknown => JSON.parse(
    readFileSync(`tools/content/pvz-base/gameplay/${name}.json`, 'utf8'),
)
const definitions = parseGameplayDefinitionsV2(source('definitions'))
const levels = parseGameplayLevelsV2(source('levels'), definitions)
const start: StartSessionPacket = {
    protocolVersion: 1,
    sequence: 1,
    type: 'startSession',
    levelId: 'pvz:adventure-1-1',
    randomSeed: 12345,
    initialMoney: 0,
    firstAdventure: true,
    mods: [],
}

test('headless 1-1 reaches the same win for the same seed and commands', () => {
    const first = new IntegratedGameServer(definitions, levels)
    const second = new IntegratedGameServer(definitions, levels)
    first.start(start)
    second.start(start)

    const command = (value: GameCommand) => {
        assert.equal(runCommand(first, value), runCommand(second, value))
    }
    command({ type: 'completeIntro' })
    command({ type: 'selectSeed', seedId: 'pvz:peashooter' })
    command({ type: 'placePlant', row: 2, column: 0 })

    let snapshot: WorldSnapshot = first.snapshot()
    let secondPlanted = false
    let awardDroppedBeforeWin = false
    while (snapshot.result === 'playing' && snapshot.tick < 30000) {
        for (const item of snapshot.items) {
            if (item.typeId === 'pvz:sunflower') {
                awardDroppedBeforeWin = true
                assert.doesNotThrow(() => new IntegratedGameServer(definitions, levels).start({
                    ...start,
                    save: JSON.parse(JSON.stringify(first.save())),
                }))
            }
            command({ type: 'collectItemAt', itemId: item.entityId })
        }
        if (!secondPlanted && snapshot.sun >= 100 && snapshot.seedPackets[0].ready) {
            command({ type: 'selectSeed', seedId: 'pvz:peashooter' })
            command({ type: 'placePlant', row: 2, column: 1 })
            secondPlanted = true
        }
        snapshot = first.tick()
        second.tick()
    }

    assert.equal(secondPlanted, true)
    assert.equal(awardDroppedBeforeWin, true)
    assert.equal(snapshot.result, 'won')
    assert.deepEqual(second.snapshot(), snapshot)
})
