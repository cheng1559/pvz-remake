import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'
import * as protocol from '@/shared/protocol'
import type { GameCommand, SeedPacketSnapshot, WorldSnapshot } from '@/shared/protocol'

// The protocol's own helpers run as they are: what is loaded asks them whether the level stands still.
const shared: Record<string, unknown> = { '@/shared/protocol': protocol, '@/shared/protocol/index': protocol }

test('conveyor keyboard selection uses packet identity and respects page and dialog scopes', () => {
    const page = {}, modal: any = { activeModalRoot: page, isInputBlocked: false }
    const settings = { hotkeysEnabled: true }
    const modules: Record<string, unknown> = {
        cc: { KeyCode: { SPACE: 32, ENTER: 13, DIGIT_0: 48, DIGIT_1: 49, KEY_F: 70 } },
        '@/client/input/UIHoverManager': { UIHoverManager: modal },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: settings },
        '@/platform/Haptics': { Haptics: { play() {} } },
    }
    const { LevelInputPresenter } = loadScript('assets/scripts/client/level/LevelInputPresenter.ts', (id: string) => modules[id] ?? shared[id] ?? {})
    const commands: any[] = []
    // The server marks the held belt packet selected.
    const snapshot: any = { paused: false, phase: 'gameplay', result: 'playing', cursor: { mode: 'none' }, seedPackets: [],
        conveyorPackets: [{ id: 17, seedId: 'nut', x: 0, availability: {}, get selected() { return snapshot.cursor.packetId === 17 } }] }
    type Packet = SeedPacketSnapshot & { command: GameCommand, x?: number }
    // LevelSeedBank.packetAt on a belt: the snapshot's packet, ready unless held, picked by its ID.
    const beltPacket = (packet: WorldSnapshot['conveyorPackets'][number]): Packet => ({ ...packet,
        ready: !packet.selected, cooldownRemaining: 0, cooldownTotal: 0, command: { type: 'selectConveyorPacket', packetId: packet.id } })
    const input = new LevelInputPresenter({ isChildOf: (node: unknown) => node === page },
        { render: () => snapshot, command: (command: unknown) => commands.push(command), update() {} },
        { introComplete: true, pointerOffsetY: () => 0, seedPacketAt: (world: WorldSnapshot, index: number): Packet | undefined =>
            world.conveyorPackets[index] && beltPacket(world.conveyorPackets[index]), audio: { seedPacketSelected() {}, plantingCancelled() {} } })
    input.enabled = true
    input.onKeyDown({ keyCode: 49 })
    assert.deepEqual({ ...commands.pop() }, { type: 'selectConveyorPacket', packetId: 17 })
    snapshot.cursor = { mode: 'seed', seedId: 'nut', packetId: 17 }
    input.onKeyDown({ keyCode: 49 })
    assert.equal(commands.pop().type, 'clearCursor')
    // A bank packet in the second slot (LevelSeedBank.packetAt picks it by its seed and slot), or the belt's second packet.
    const others: Packet[] = [
        { seedId: 'pea', ready: true, selected: false, cooldownRemaining: 0, cooldownTotal: 0, availability: {}, command: { type: 'selectSeed', seedId: 'pea', slot: 1 } },
        beltPacket({ id: 18, seedId: 'pea', x: 60, selected: false, availability: {} }),
    ]
    for (const packet of others) {
        snapshot.cursor = { mode: 'seed', seedId: 'nut', packetId: 17 }
        const previous = input.view.seedPacketAt
        input.view.seedPacketAt = () => packet
        input.onKeyDown({ keyCode: 50 })
        assert.deepEqual({ ...commands.pop() }, packet.command, 'another slot replaces the held plant without clearing it first')
        assert.equal(commands.length, 0)
        input.view.seedPacketAt = previous
    }
    const shovel = { toolId: 'pvz:shovel', hotkey: 'F', button: { node: { activeInHierarchy: true }, interactable: true } }
    input.toolButtons = [shovel]
    snapshot.cursor = { mode: 'none' }
    input.onKeyDown({ keyCode: 70 })
    assert.deepEqual({ ...commands.pop() }, { type: 'selectTool', toolId: 'pvz:shovel' })
    snapshot.cursor = { mode: 'tool', toolId: 'pvz:shovel' }
    input.onKeyDown({ keyCode: 70 })
    assert.equal(commands.pop().type, 'clearCursor')
    snapshot.cursor = { mode: 'seed', seedId: 'nut', packetId: 17 }
    input.onKeyDown({ keyCode: 70 })
    assert.deepEqual({ ...commands.pop() }, { type: 'selectTool', toolId: 'pvz:shovel' }, 'F replaces a held plant like the number keys')
    assert.equal(commands.length, 0)
    shovel.button.interactable = false
    input.onKeyDown({ keyCode: 70 })
    assert.equal(commands.length, 0, 'unavailable tools cannot be picked by keyboard')
    modal.activeModalRoot = {}
    input.onKeyDown({ keyCode: 49 })
    assert.equal(commands.length, 0, 'a dialog blocks board shortcuts, while the page itself does not')

    modal.activeModalRoot = page
    input.view.dialogReady = true
    settings.hotkeysEnabled = false
    input.onKeyDown({ keyCode: 32 })
    for (const keyCode of [32, 32, 13]) input.onKeyPressing({ keyCode })
    assert.deepEqual(commands.map(command => command.type), Array(4).fill('advanceDialog'),
        'holding Space or Enter advances Dave dialogue independently of the hotkeys switch')
    commands.length = 0
    modal.activeModalRoot = {}
    input.onKeyPressing({ keyCode: 32 })
    assert.equal(commands.length, 0, 'modal input still blocks repeated dialogue keys')
    modal.activeModalRoot = page
    input.view.dialogReady = false
    settings.hotkeysEnabled = true
    for (const keyCode of [32, 13, 49, 68, 70]) input.onKeyPressing({ keyCode })
    assert.equal(commands.length, 0, 'holding a key after dialogue must not repeat board shortcuts')
})
