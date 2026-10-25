import { Color, EventMouse, Node, UITransform, type EventTouch, type SpriteFrame } from 'cc'
import { SeedPacketView } from '@/client/hud/SeedPacketView'
import { plantDefinition } from '@/client/plants/definitions'
import { UIButton } from '@/client/ui/UIButton'
import type { UITooltip } from '@/client/ui/UITooltip'
import type { UI } from '@/client/ui/UI'
import { uiNode } from '@/client/view/uiNode'
import { easeInOut } from '@/client/view/GameScreenMath'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import type { GameCommand, WorldSnapshot } from '@/shared/protocol'
import type { LoadedContent } from './LevelView'
import { SpriteLoader } from '@/core/SpriteLoader'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

interface Choice {
    id: string
    view: SeedPacketView
    shadow: SeedPacketView
    button: UIButton
    tooltip: UITooltip
    home: { x: number, y: number }
    slot: number
    motion?: { fromX: number, fromY: number, x: number, y: number, start: number, end: number }
}

/** Seed ownership/order comes from the server. Only card flights and panel motion live here. */
export class LevelSeedChooser {
    private snapshot?: WorldSnapshot
    private send: (command: GameCommand) => void = () => {}
    private age = 0
    private introTick = 0
    private warningOpen = false
    private readonly panel: Node
    private readonly cards: Node
    private readonly flying: Node
    private readonly buttons: Node
    private readonly choices: Choice[] = []
    private readonly start: UIButton
    private readonly emptySlots: Node[] = []

    static async create(ui: UI, content: LoadedContent, parent: Node, available: readonly string[], slots: number, inputRoot: Node): Promise<LevelSeedChooser> {
        const [background, silhouette] = await Promise.all(['seedchooser_background', 'seedpacketsilhouette'].map(async id => {
            const sprite = await SpriteLoader.load(id)
            if (!sprite) throw new Error(`Missing seed chooser sprite: ${id}`)
            return sprite
        }))
        return new LevelSeedChooser(ui, content, parent, available, slots, background, silhouette, inputRoot)
    }

    private constructor(private readonly ui: UI, content: LoadedContent, parent: Node, available: readonly string[], slots: number, background: SpriteFrame, silhouette: SpriteFrame, inputRoot: Node) {
        const sprites = new SpriteRepository(content.registry, content.loader)
        this.panel = uiNode({ name: 'SeedChooser', parent, active: false, anchor: { x: 0, y: 1 }, size: { width: 800, height: 600 } }).node
        ui.image(this.panel, background, { y: 87 })
        ui.label(this.panel, { text: ui.text('CHOOSE_YOUR_PLANTS'), font: 'yellow', color: Color.WHITE, x: 229, y: 110, baseline: true, align: 'center' })
        const shadows = uiNode({ name: 'ChooserShadows', parent: this.panel }).node
        this.cards = uiNode({ name: 'ChooserCards', parent: parent, active: false }).node
        this.flying = uiNode({ name: 'FlyingSeeds', parent: parent, active: false }).node
        this.buttons = uiNode({ name: 'ChooserButtons', parent, active: false }).node
        const grid = (index: number) => ({ x: index % 8 * 53 + 22, y: Math.floor(index / 8) * 73 + 128 })
        for (let index = available.length; index < 40; index++) ui.image(shadows, silhouette, grid(index))
        for (let index = 0; index < slots; index++) this.emptySlots.push(ui.image(this.cards, silhouette, { x: 85 + index * 59, y: 8 }).node)
        for (const [index, id] of available.entries()) {
            const seed = content.definitions.seeds[id]
            const visual = plantDefinition(content.presentation, seed.plant).visual
            const home = grid(index)
            const args = { definitions: content.presentation, name: `Choose-${id}`, parent: this.cards, layer: parent.layer,
                x: home.x, y: -home.y, seedType: visual.seedType, cost: seed.sunCost, costFont: ui.assets.fonts.packetCost,
                loadSprite: (name: string) => sprites.load(`pvz:${name}`) }
            const shadow = new SeedPacketView({ ...args, name: `ChosenShadow-${id}`, parent: shadows })
            shadow.applyColor(new Color(55, 55, 55))
            shadow.node.active = false
            const view = new SeedPacketView(args)
            view.node.setSiblingIndex(slots)
            const nameKey = visual.nameKey ?? String(visual.seedType).toUpperCase()
            const tooltip = ui.tooltip(view.node, { title: ui.text(nameKey), text: ui.text(visual.tooltipKey ?? `${nameKey}_TOOLTIP`), gap: 0 })
            const button = view.node.addComponent(UIButton)
            button.hapticsEnabled = false
            button.pressOnly = true
            button.canInteract = () => !!this.snapshot && !this.snapshot.paused && this.choosing && this.introTick >= 425 && !this.warningOpen
            const choice: Choice = { id, view, shadow, button, tooltip, home, slot: -1 }
            button.onPress = () => {}
            button.onHoverChange = hovering => hovering && !this.inFlight ? tooltip.show() : tooltip.hide()
            this.choices.push(choice)
        }
        this.start = ui.button(this.buttons, { text: ui.text('LETS_ROCK_BUTTON'), skin: 'seed', font: 'yellow',
            color: Color.WHITE, disabledColor: new Color(64, 64, 64), x: 154, y: 545, width: 156, height: 42, pressOffset: [0, 0],
            rightClickTriggers: false, enabled: false, onClick: () => this.confirm() })
        const pointerDown = (event: EventMouse | EventTouch) => {
            if (!this.panel.active || !this.choosing || this.introTick < 425 || this.snapshot?.paused || UIHoverManager.isModalBlocked) return
            if (event instanceof EventMouse && (GameDebugSettings.isMobileMode() || ![0, 2].includes(event.getButton()))) return
            if (!(event instanceof EventMouse) && !GameDebugSettings.isMobileMode()) return
            // Original MouseDown lands every flight before hit testing, including clicks on another card.
            for (const choice of this.choices) this.land(choice)
            const choice = this.choices.find(choice => choice.view.node.activeInHierarchy &&
                choice.view.node.getComponent(UITransform)!.hitTest(event.getLocation(), event.windowId))
            if (choice) { this.pick(choice); event.propagationStopped = true }
        }
        // HUD is above the seed bank. Listening on it would turn it into a hit target covering the bank.
        inputRoot.on(Node.EventType.MOUSE_DOWN, pointerDown, this, true)
        inputRoot.on(Node.EventType.TOUCH_START, pointerDown, this, true)
        this.panel.once(Node.EventType.NODE_DESTROYED, () => {
            inputRoot.off(Node.EventType.MOUSE_DOWN, pointerDown, this, true)
            inputRoot.off(Node.EventType.TOUCH_START, pointerDown, this, true)
        })
    }

    get choosing(): boolean { return this.snapshot?.seedChooser?.choosing ?? true }
    get active(): boolean { return this.panel.active }
    private get inFlight(): boolean { return this.choices.some(choice => !!choice.motion) }

    bind(send: (command: GameCommand) => void): void { this.send = send }

    placeBefore(node: Node): void {
        for (const layer of [this.panel, this.cards, this.flying, this.buttons]) layer.setSiblingIndex(node.getSiblingIndex())
    }

    sync(snapshot: WorldSnapshot): void {
        const before = this.snapshot
        this.snapshot = snapshot
        for (const choice of this.choices) {
            const slot = snapshot.seedPackets.findIndex(packet => packet.seedId === choice.id)
            if (slot !== choice.slot) {
                const oldSlot = choice.slot
                choice.slot = slot
                const destination = slot < 0 ? choice.home : { x: 85 + slot * 59, y: 8 }
                if (before && this.introTick >= 425 && snapshot.seedChooser?.choosing) {
                    this.move(choice, destination, slot >= 0 && oldSlot >= 0 ? 15 : 25)
                } else choice.view.node.setPosition(destination.x, -destination.y)
            }
        }
        const ready = !!snapshot.seedChooser && snapshot.seedPackets.length === snapshot.seedChooser.slots && this.choosing && !snapshot.paused
        this.start.interactable = ready && this.introTick >= 425
        this.syncPlaceholders()
    }

    update(dt: number): void {
        this.age += dt * 100
        for (const choice of this.choices) {
            const motion = choice.motion
            if (!motion) continue
            choice.view.node.setPosition(easeInOut(motion.start, motion.end, this.age, motion.fromX, motion.x),
                -easeInOut(motion.start, motion.end, this.age, motion.fromY, motion.y))
            if (this.age >= motion.end) this.land(choice)
        }
        if (!this.inFlight && !UIHoverManager.isModalBlocked) for (const choice of this.choices) {
            if (choice.button.isHovering) choice.tooltip.show()
        }
    }

    syncIntro(tick: number): void {
        this.introTick = tick
        this.panel.active = tick >= 400 && tick < 475
        this.cards.active = this.panel.active
        this.flying.active = this.panel.active
        this.buttons.active = this.panel.active
        const y = tick <= 425 ? easeInOut(400, 425, tick, -516, 0) : easeInOut(450, 475, tick, 0, -516)
        this.panel.setPosition(0, y)
        this.buttons.setPosition(0, y)
        for (const choice of this.choices) {
            choice.view.node.active = this.panel.active && (choice.slot < 0 || this.choosing)
            if (choice.slot < 0 && !choice.motion) choice.view.node.setPosition(choice.home.x, y - choice.home.y)
        }
        this.syncPlaceholders()
        if (!this.panel.active) for (const choice of this.choices) choice.tooltip.hide()
    }

    private syncPlaceholders(): void {
        for (const choice of this.choices) choice.shadow.node.active = choice.slot >= 0 || !!choice.motion
        this.emptySlots.forEach((node, index) => {
            node.active = this.panel.active && this.choosing && !this.choices.some(choice => choice.slot === index && !choice.motion)
        })
    }

    private pick(choice: Choice): void {
        for (const candidate of this.choices) this.land(candidate)
        if (choice.slot < 0 && this.snapshot!.seedPackets.length >= this.snapshot!.seedChooser!.slots) return
        for (const candidate of this.choices) candidate.tooltip.hide()
        void SoundLoader.play(SoundEffect.Tap)
        this.send({ type: 'chooseSeed', seedId: choice.id })
    }

    private move(choice: Choice, destination: { x: number, y: number }, duration: number): void {
        choice.view.node.setParent(this.flying)
        const position = choice.view.node.position
        choice.motion = { fromX: position.x, fromY: -position.y, ...destination, start: this.age, end: this.age + duration }
        // Preserve chooser order, as in the original draw loop, rather than click/reparent order.
        this.choices.filter(candidate => candidate.motion).forEach((candidate, index) => candidate.view.node.setSiblingIndex(index))
        choice.tooltip.hide()
    }

    private land(choice: Choice): void {
        if (!choice.motion) return
        choice.view.node.setPosition(choice.motion.x, -choice.motion.y)
        choice.motion = undefined
        choice.view.node.setParent(this.cards)
        this.syncPlaceholders()
        this.choices.filter(candidate => !candidate.motion).sort((a, b) => b.view.node.position.x - a.view.node.position.x)
            .forEach((candidate, index) => candidate.view.node.setSiblingIndex(this.emptySlots.length + index))
        UIHoverManager.refreshHoverStates()
    }

    private confirm(): void {
        if (!this.start.interactable || this.warningOpen) return
        for (const choice of this.choices) { this.land(choice); choice.tooltip.hide() }
        const warning = this.snapshot?.seedChooser?.warning
        if (!warning) { this.send({ type: 'confirmSeeds' }); return }
        this.warningOpen = true
        const dialog = this.ui.dialog(this.panel.parent!, { title: this.ui.text('DIALOG_WARNING'), message: this.ui.text(warning),
            confirmText: this.ui.text('DIALOG_BUTTON_YES'), cancelText: this.ui.text('REPICK_BUTTON') })
        void dialog.result.then(confirmed => {
            this.warningOpen = false
            if (confirmed && this.panel.isValid) this.send({ type: 'confirmSeeds' })
        })
    }
}
