import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind,ScriptTarget,transpileModule } from 'typescript'

function loadLevelModule(name: string, modules: Record<string, unknown>) {
    const exports: Record<string, any> = {}
    const code = transpileModule(readFileSync(`assets/scripts/client/level/${name}.ts`, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports, require: (id: string) => modules[id] ?? {} })
    return exports
}

test('conveyor keyboard selection uses packet identity and respects page and dialog scopes', () => {
    const page = {}, modal: any = { activeModalRoot: page, isInputBlocked: false }
    const settings = { hotkeysEnabled: true }
    const { LevelInputPresenter } = loadLevelModule('LevelInputPresenter', {
        cc: { KeyCode: { SPACE: 32, ENTER: 13, DIGIT_0: 48, DIGIT_1: 49, KEY_D: 68, KEY_F: 70 } },
        '@/client/input/UIHoverManager': { UIHoverManager: modal },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: settings },
        '@/platform/Haptics': { Haptics: { play() {} } },
    })
    const commands: any[] = []
    const snapshot: any = { paused: false, phase: 'gameplay', result: 'playing', cursor: { mode: 'none' },
        seedPackets: [], conveyorPackets: [{ id: 17, seedId: 'nut' }] }
    const input = new LevelInputPresenter({ isChildOf: (node: unknown) => node === page },
        { render: () => snapshot, command: (command: unknown) => commands.push(command), update() {} },
        { introComplete: true, pointerOffsetY: () => 0, seedPacketAt: (_snapshot: unknown, index: number) => index === 0 ? {
            selected: snapshot.cursor.packetId === 17,
            cooldownRemaining: 0, canAfford: true, command: { type: 'selectConveyorPacket', packetId: 17 },
        } : undefined, audio: { seedPacketSelected() {}, plantingCancelled() {} } })
    input.enabled = true
    input.onKeyDown({ keyCode: 49 })
    assert.deepEqual({ ...commands.pop() }, { type: 'selectConveyorPacket', packetId: 17 })
    snapshot.cursor = { mode: 'seed', seedId: 'nut', packetId: 17 }
    input.onKeyDown({ keyCode: 49 })
    assert.equal(commands.pop().type, 'clearCursor')
    for (const command of [{ type: 'selectSeed', seedId: 'pea' }, { type: 'selectConveyorPacket', packetId: 18 }]) {
        snapshot.cursor = { mode: 'seed', seedId: 'nut', packetId: 17 }
        const previous = input.view.seedPacketAt
        input.view.seedPacketAt = () => ({ selected: false, availability: {}, command })
        input.onKeyDown({ keyCode: 50 })
        assert.deepEqual({ ...commands.pop() }, command, 'another slot replaces the held plant without clearing it first')
        assert.equal(commands.length, 0)
        input.view.seedPacketAt = previous
    }
    const shovel = { toolId: 'pvz:shovel', button: { node: { activeInHierarchy: true }, interactable: true } }
    input.toolButtons = [shovel]
    snapshot.cursor = { mode: 'none' }
    input.onKeyDown({ keyCode: 70 })
    assert.deepEqual({ ...commands.pop() }, { type: 'selectTool', toolId: 'pvz:shovel' })
    snapshot.cursor = { mode: 'tool', toolId: 'pvz:shovel' }
    input.onKeyDown({ keyCode: 70 })
    assert.equal(commands.pop().type, 'clearCursor')
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
