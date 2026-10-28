import { easeInOut,linearFloat } from '@/client/view/GameScreenMath'
import { parsePresentationDefinitions } from '@/shared/content/presentation'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind,ScriptTarget,transpileModule } from 'typescript'
import { readPresentationSource } from '../../tools/mod/content'

const definitions = parsePresentationDefinitions(readPresentationSource())
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
        { introComplete: true, seedPacketAt: (_snapshot: unknown, index: number) => index === 0 ? {
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

function introFixture(index: number) {
    const particles: any[] = []
    const module = { exports: {} as Record<string, any> }
    const code = transpileModule(readFileSync('assets/scripts/client/level/adventure/AdventureIntro.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => ({
        '@/client/view/uiNode': { uiNode: (args: any) => {
            const result = args.node ?? node()
            if (args.position) result.setPosition(args.position.x, args.position.y)
            if (args.size) Object.assign(result.transform, args.size)
            return { node: result, transform: result.transform }
        } },
        '@/client/view/GameScreenMath': { easeInOut, linearFloat },
        '@/client/particle/ParticlePlayer': { ParticlePlayer: { spawn: (value: any) => particles.push(value) } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { isMobileMode: () => false } },
    }[id] ?? {}) })
    const node = () => ({ isValid: true, active: true, position: { x: 0, y: 0 },
        transform: { height: 600, width: 0, setContentSize(width: number) { this.width = width } },
        setPosition(x: number, y: number) { this.position = { x, y } }, addComponent: () => ({}) })
    const board = node(), sod = node(), bank = node(), house = node(), readyNode = node()
    bank.transform.height = 87
    const sounds: string[] = []
    const ready = { node: readyNode, time: 0, seek(time: number) { this.time = time } }
    const layout = definitions.levels![`pvz:adventure-1-${index}`].intro
    const intro = new module.exports.AdventureIntro(board, sod, [], layout, ready, [], new Map(), definitions, bank, house,
        { origin: { y: 80 }, cell: { height: 100 } }, () => [],
        { sodRollStarted: () => sounds.push('sod'), readySetPlant: () => sounds.push('ready') }, {}, {}, {})
    return { intro, board, sod, bank, ready, sounds, particles, node, previewTypes: module.exports.adventurePreviewTypes }
}




test('1-4 reveals the full lawn, places both sod effects correctly and restores its ready animation by intro time', async () => {
    const { intro, sod, bank, ready, sounds, particles } = introFixture(4)
    intro.sync()
    assert.equal(sod.transform.width, 0)
    assert.equal(intro.update(6), false)
    assert.deepEqual(particles.map(value => [value.x + 400, 300 - value.y]), [[32, 150], [32, 511]])
    intro.update(1)
    assert.equal(sod.transform.width, 773 / 2)
    assert.equal(bank.active, false)
    intro.update(1.55)
    assert.deepEqual(sounds, ['sod', 'ready'])
    assert.equal(bank.position.y, 0)
    assert.equal(ready.node.active, true)
    await intro.restore({ ticks: 900, previews: [] })
    assert.equal(ready.time, 0.45)
    assert.deepEqual(sounds, ['sod', 'ready'], 'restoring cannot repeat the start sound')
    assert.equal(intro.update(1.38), true)
    assert.equal(ready.node.active, false)
})

test('street previews include coneheads in wave proportions and exclude flag zombies', () => {
    const { previewTypes } = introFixture(3)
    for (const [index, normal, conehead] of [[3, 8, 2], [10, 14, 3]]) {
        const capacity = definitions.levels![`pvz:adventure-1-${index}`].intro.previewCapacity
        const types = [...previewTypes({ 'pvz:normal': 16, 'pvz:conehead': 4, 'pvz:flag': 1 }, definitions, capacity)]
        assert.equal(types.filter(id => id === 'pvz:normal').length, normal)
        assert.equal(types.filter(id => id === 'pvz:conehead').length, conehead)
        assert.equal(types.includes('pvz:flag'), false)
    }
})
