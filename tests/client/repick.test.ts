import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as chooserPages from '@/shared/content/chooserPages'
import * as protocol from '@/shared/protocol'

class Component { enabled = true; isValid = true; node?: unknown }
class ReanimPlayer extends Component {}
class ParticlePlayer extends Component {}

function load(path: string, modules: Record<string, unknown>) {
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {}, console })
    return module.exports
}

test("a repick drops the chooser in, holds it while choosing and lifts it out after Let's Rock, on its own ticks", () => {
    const { LevelSeedChooser } = load('assets/scripts/client/level/LevelSeedChooser.ts', {
        cc: { Component, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/input/UIHoverManager': { UIHoverManager: { isModalBlocked: false, refreshHoverStates() {} } },
    })
    const ticks: number[] = [], sent: unknown[] = []
    const almanac = { node: { active: true } }
    const chooser = Object.assign(Object.create(LevelSeedChooser.prototype), {
        // The pages are not what this is about: their layout is skipped.
        age: 0, choices: [], start: {}, syncPlaceholders() {}, syncIntro(tick: number) { ticks.push(tick) }, layOut() {},
        pageButtons: [almanac], send: (command: unknown) => sent.push(command),
    })
    const snapshot = (repick: boolean, choosing = repick) => ({ seedPackets: [], seedChooser: { slots: 6, choosing, ...(repick ? { repick: true } : {}) } })
    chooser.sync(snapshot(false, true))
    assert.equal(chooser.repickTick, undefined, "the intro's chooser runs on the intro's ticks")
    assert.equal(almanac.node.active, true, "the intro's chooser shows the almanac")
    chooser.sync(snapshot(true))
    assert.deepEqual([chooser.repickTick, ticks, almanac.node.active], [400, [400], false], 'a repick starts the drop at once, without the almanac')
    for (let frame = 0; frame < 60; frame++) chooser.update(0.01)
    assert.equal(chooser.repickTick, 425, 'down and held while choosing')
    // Let's Rock: still a repick, no longer choosing, until the level goes on.
    chooser.sync(snapshot(true, false))
    chooser.update(0.1)
    assert.deepEqual([chooser.repickTick, sent], [460, []], "Let's Rock lifts it from 450")
    chooser.update(1)
    chooser.update(1)
    // The command comes from the chooser's own context, so it is compared as JSON.
    assert.equal(JSON.stringify([chooser.repickTick, sent]), JSON.stringify([475, [{ type: 'finishRepick' }]]),
        'out as quickly as it came in, the level goes on once')
    chooser.sync(snapshot(false))
    chooser.sync(snapshot(true))
    assert.equal(chooser.repickTick, 400, 'the next repick drops it again')
    assert.equal(Object.getOwnPropertyDescriptor(LevelSeedChooser.prototype, 'choosing')!.get!.call({ snapshot: { seedChooser: undefined } }), false,
        'a bank dealt again after a repick is not choosing')
})

test('a repick stands the level still but its chooser, and attaching a chooser binds it, whenever it comes', () => {
    const { LevelView } = load('assets/scripts/client/level/LevelView.ts', {
        cc: { Component, _decorator: { ccclass: () => (value: unknown) => value }, Tween: { pauseAllByTarget() {}, resumeAllByTarget() {} } },
        '@/client/reanim/ReanimPlayer': { ReanimPlayer }, '@/client/particle/ParticlePlayer': { ParticlePlayer },
    })
    // The lawn's, the HUD's (a tutorial arrow, the award's arrow) and the chooser's own (a card's plant).
    const lawn = new ReanimPlayer(), arrow = new ParticlePlayer(), card = new ReanimPlayer(), other = new Component()
    const chooserNode = {}
    card.node = chooserNode
    const view = new LevelView({ children: [], getComponentsInChildren: () => [lawn, arrow, card, other] })
    const sent: unknown[] = []
    view.bindSeedChooser((command: unknown) => sent.push(command))
    let send: (command: unknown) => void = () => {}
    const chooser = { bind(value: typeof send) { send = value }, holds: (node: unknown) => node === chooserNode }
    view.attachSeedChooser(chooser)
    view.standStill(true)
    assert.deepEqual([lawn.enabled, arrow.enabled, card.enabled, other.enabled], [false, false, true, true])
    view.standStill(false)
    assert.deepEqual([lawn.enabled, arrow.enabled], [true, true])

    send({ type: 'confirmSeeds' })
    assert.deepEqual([view.seedChooser, sent], [chooser, [{ type: 'confirmSeeds' }]], 'a chooser a repick opens sends like the intro\'s')
})

test("a repick's music waits with the level, through the pause menu's resume too", () => {
    const calls: string[] = []
    const { LevelAudioPresenter } = load('assets/scripts/client/level/LevelAudioPresenter.ts', {
        '@/client/music/MusicSystem': { MusicSystem: { pause: () => calls.push('pause'), resume: () => calls.push('resume'), playTune: async () => {} } },
    })
    const audio = Object.assign(Object.create(LevelAudioPresenter.prototype), { ownsMusic: true, musicHeld: false })
    audio.holdMusic(true)
    audio.holdMusic(true)
    audio.resume()
    assert.deepEqual(calls, ['pause'], 'held once; the menu cannot let it go')
    audio.holdMusic(false)
    assert.deepEqual(calls, ['pause', 'resume'])
})

test('a card the bank holds that nothing offers gets its card in its slot, so the chooser shows and can put it back', () => {
    const { LevelSeedChooser } = load('assets/scripts/client/level/LevelSeedChooser.ts', {
        cc: { Component, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/input/UIHoverManager': { UIHoverManager: { isModalBlocked: false, refreshHoverStates() {} } },
        '@/shared/protocol': { chooserEntryKey: (entry: { seedId: string, team?: string }) => `${entry.seedId}|${entry.team ?? ''}` },
        './LevelGeometry': { seedPacketX: (slot: number) => 85 + slot * 59 },
    })
    const added: Array<{ seedId: string, team?: string }> = []
    const chooser = Object.assign(Object.create(LevelSeedChooser.prototype), {
        age: 0, choices: [] as unknown[], start: {}, slots: 6, bankShift: 0, pageButtons: [], syncPlaceholders() {}, syncIntro() {}, layOut() {},
        addChoice(card: { seedId: string, team?: string }) {
            added.push(card)
            const placed: number[][] = []
            const choice = { ...card, key: `${card.seedId}|${card.team ?? ''}`, slot: -1, placed,
                view: { node: { setPosition: (x: number, y: number) => placed.push([x, y]), position: { x: 0, y: 0 } }, raiseIcon() {} } }
            this.choices.push(choice)
            return choice
        },
    })
    const snapshot = { seedPackets: [{ seedId: 'pvz:peashooter' }, { seedId: 'pvz:explodenut', team: 'zombies' }, null], seedChooser: { slots: 6, choosing: true } }
    chooser.sync(snapshot)
    chooser.sync(snapshot)
    assert.equal(JSON.stringify(added), JSON.stringify([{ seedId: 'pvz:peashooter' }, { seedId: 'pvz:explodenut', team: 'zombies' }]), 'once each')
    assert.deepEqual(chooser.choices.map((choice: { slot: number }) => choice.slot), [0, 1], 'straight in their slots')
})

test('a chooser lays its pages out from the offer it has now, as /cheatseed turning over between repicks changes the grid', () => {
    const { LevelSeedChooser } = load('assets/scripts/client/level/LevelSeedChooser.ts', {
        cc: { Component, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/shared/protocol': protocol, '@/shared/content/chooserPages': chooserPages,
    })
    const definitions = { seeds: { 'pvz:pea': { kind: 'plant' }, 'pvz:sun': { kind: 'plant' }, 'pvz:normal': { kind: 'zombie' } },
        seedCatalog: { 'pvz:pea': { position: 0 }, 'pvz:sun': { position: 3 } } }
    const added: string[] = [], shown: string[][] = [], turner = { node: { active: true } }
    const chooser = Object.assign(Object.create(LevelSeedChooser.prototype), {
        definitions, choices: [] as Array<{ key: string }>, pages: [], page: 0, offerKey: '', pageTurners: [{ button: turner, step: 1 }],
        addChoice(card: { seedId: string, team?: string }) {
            const choice = { ...card, key: protocol.chooserEntryKey(card as protocol.ChooserEntry), view: { raiseIcon() {} } }
            added.push(choice.key)
            this.choices.push(choice)
            return choice
        },
        showCards(cards: Array<{ seedId: string, team?: string, place: number }>) { shown.push(cards.map(card => `${card.seedId}${card.team ? `@${card.team}` : ''}:${card.place}`)) },
    })
    // The level opens the chooser owning the Peashooter alone.
    chooser.layOut(false, ['pvz:pea'], [])
    assert.deepEqual([shown.at(-1), turner.node.active], [['pvz:pea:0'], false])
    // `/cheatseed` on, the next repick offers every grid seed and the pages: the cards it lacks are made then.
    const all = ['pvz:pea', 'pvz:sun'], entries = chooserPages.cheatSeedEntries(definitions as any, all)
    const count = added.length
    chooser.layOut(true, all, entries)
    assert.deepEqual([shown.at(-1), turner.node.active], [['pvz:pea:0', 'pvz:sun:3'], true])
    assert.equal(added.length - count, 1 + entries.length, 'the Sunflower and every page card, once')
    chooser.turnPage(1)
    assert.deepEqual(shown.at(-1), ['pvz:normal@plants:0'])
    // Off again: the grid is the owned seeds once more, on its single page.
    chooser.layOut(false, ['pvz:pea'], [])
    assert.deepEqual([shown.at(-1), turner.node.active, added.length], [['pvz:pea:0'], false, count + 1 + entries.length])
})
