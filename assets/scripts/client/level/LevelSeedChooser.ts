import { modResources } from '@/client/content/ModResources'
import { Color, EventMouse, Node, UITransform, type EventTouch, SpriteFrame } from 'cc'
import { SeedPacketView } from '@/client/hud/SeedPacketView'
import { plantDefinition } from '@/client/plants/definitions'
import { UIButton } from '@/client/ui/UIButton'
import type { UITooltip } from '@/client/ui/UITooltip'
import type { UI } from '@/client/ui/UI'
import { uiNode } from '@/client/view/uiNode'
import { fitViewport, uiAreaEdge, uiAreaInset } from '@/client/view/ClientViewport'
import { easeInOut } from '@/client/view/GameScreenMath'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { chooserEntryKey as cardKey, type ChooserEntry, type GameCommand, type WorldSnapshot } from '@/shared/protocol'
import { CHOOSER_PLACES, FIVE_ROW_PLACES, type GameplayDefinitions } from '@/shared/content/gameplay'
import { packetTeam } from '@/shared/content/teams'
import type { LoadedContent } from './LevelView'
import { seedPacketX } from './LevelGeometry'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

/** A card in the chooser grid: an offered seed, on its side, at a grid place (8 columns in reading order from 0). */
export interface ChooserCard extends ChooserEntry {
    place: number
}

interface Choice extends ChooserEntry {
    key: string
    view: SeedPacketView
    shadow: SeedPacketView
    button: UIButton
    tooltip: UITooltip
    /** Where it waits in the grid; none while the grid does not show it. */
    home?: { x: number, y: number }
    slot: number
    motion?: { fromX: number, fromY: number, x: number, y: number, start: number, end: number }
    /** SeedNotRecommendedToPick: grayed while it waits in the chooser. */
    notRecommended: boolean
    grayed?: boolean
}

/** A repick's last tick: the chooser is out and the bank back from its choosing place, as quickly as they came in. */
export const REPICK_END_TICK = 475

/** Seed ownership/order comes from the server. Only card flights and panel motion live here. */
export class LevelSeedChooser {
    readonly previewTooltipSurface: Node
    /** SeedChooserScreen's Almanac and Store buttons; the app opens the page over the paused level. */
    onAlmanac: () => void = () => {}
    onStore: () => void = () => {}
    /**
     * Mods: a card goes back from the bank while the grid does not show it. Showing it now (showCards) lets it fly to
     * its place; otherwise it just leaves the bank.
     */
    onCardHidden: (card: ChooserEntry) => void = () => {}
    readonly definitions: GameplayDefinitions
    /** The grid SeedChooserScreen shows: the owned catalog seeds at their catalog places. */
    readonly catalogCards: readonly ChooserCard[]
    /** The cards Mods offer beyond the catalog grid (seedChooser.entries); the grid shows them only through showCards. */
    readonly entries: readonly ChooserEntry[]
    private snapshot?: WorldSnapshot
    private send: (command: GameCommand) => void = () => {}
    private age = 0
    private introTick = 0
    /**
     * A repick in play (`/repick`): the chooser's own ticks on the intro's timeline, dropping in over 400–425 and lifting
     * out over 450–475 (REPICK_END_TICK) while the camera stays where it is, the bank sliding with it;
     * undefined until the first repick.
     */
    repickTick?: number
    /**
     * The mouse wheel anywhere over the level while the chooser is out, for a Mod (seed-chooser-pages turns its pages).
     * A Mod uses this rather than listening on a node of its own, which would take the presses under it.
     */
    onWheel?: (event: EventMouse) => void
    private bankShift = 0
    private repickFinished = false
    /** The almanac and store buttons, which a repick leaves out. */
    private readonly pageButtons: UIButton[] = []
    private warningOpen = false
    private readonly panel: Node
    private readonly edge: Node
    private readonly cards: Node
    private readonly flying: Node
    /**
     * The pictures of the resting cards, over their backgrounds (SeedPacketViewArgs.iconLayer), so a tilted picture
     * standing out of its packet is not hidden by a neighbour. A chosen card's shadow left in the grid draws its
     * picture with them; a card in flight draws whole, its picture on it.
     */
    private readonly cardIcons: Node
    private readonly buttons: Node
    private readonly choices: Choice[] = []
    private readonly start: UIButton
    private readonly emptySlots: Node[] = []
    private slots: number
    private readonly silhouette: SpriteFrame
    private readonly gridShadows: Node
    private gridSilhouettes: Node[] = []

    static async create(ui: UI, content: LoadedContent, parent: Node, available: readonly string[], slots: number, inputRoot: Node,
        notRecommended: (seedId: string) => string | undefined = () => undefined,
        pages: { almanac?: boolean, store?: boolean } = {}, entries: readonly ChooserEntry[] = []): Promise<LevelSeedChooser> {
        const [background, silhouette] = await Promise.all(['seedchooser_background', 'seedpacketsilhouette'].map(async id => {
            const sprite = await modResources.asset(id, SpriteFrame)
            if (!sprite) throw new Error(`Missing seed chooser sprite: ${id}`)
            return sprite
        }))
        return new LevelSeedChooser(ui, content, parent, available, slots, background, silhouette, inputRoot, notRecommended, pages, entries)
    }

    private constructor(private readonly ui: UI, content: LoadedContent, parent: Node, available: readonly string[], slots: number, background: SpriteFrame, silhouette: SpriteFrame, inputRoot: Node,
        notRecommended: (seedId: string) => string | undefined = () => undefined, pages: { almanac?: boolean, store?: boolean } = {},
        entries: readonly ChooserEntry[] = []) {
        const sprites = new SpriteRepository(content.registry, content.loader)
        this.definitions = content.definitions
        this.slots = slots
        this.silhouette = silhouette
        this.previewTooltipSurface = uiNode({ name: 'ZombiePreviewTooltips', parent, active: false,
            position: { x: background.originalSize.width }, anchor: { x: 0, y: 1 },
            size: { width: 800 - background.originalSize.width, height: 600 } }).node
        fitViewport(this.previewTooltipSurface, size => {
            // HUD's origin stays at (-400, 300); start at the left-anchored chooser edge and extend to the visible right edge.
            const left = background.originalSize.width - uiAreaInset()
            this.previewTooltipSurface.setPosition(left, size.height / 2 - 300)
            this.previewTooltipSurface.getComponent(UITransform)!.setContentSize(Math.max(1, 400 + size.width / 2 - left), size.height)
        })
        // The chooser hugs the left screen edge together with the seed bank, keeping their relative position.
        this.edge = uiAreaEdge(parent, 'left')
        this.panel = uiNode({ name: 'SeedChooser', parent: this.edge, active: false, anchor: { x: 0, y: 1 }, size: { width: 800, height: 600 } }).node
        ui.image(this.panel, background, { y: 87 })
        ui.label(this.panel, { text: ui.text('CHOOSE_YOUR_PLANTS'), font: 'yellow', color: Color.WHITE, x: 229, y: 110, baseline: true, align: 'center' })
        const shadows = uiNode({ name: 'ChooserShadows', parent: this.panel }).node
        this.cards = uiNode({ name: 'ChooserCards', parent: this.edge, active: false }).node
        this.cardIcons = uiNode({ name: 'ChooserCardIcons', parent: this.edge }).node
        this.flying = uiNode({ name: 'FlyingSeeds', parent: this.edge, active: false }).node
        this.buttons = uiNode({ name: 'ChooserButtons', parent: this.edge, active: false }).node
        this.gridShadows = uiNode({ name: 'GridSilhouettes', parent: shadows }).node
        this.addEmptySlots()
        // SeedChooserScreen::GetSeedPositionInChooser: a seed keeps its own place in the catalog, so one not unlocked
        // yet leaves its place empty (a silhouette) instead of the later seeds moving up.
        this.catalogCards = available.map(seedId => {
            const place = content.definitions.seedCatalog[seedId]?.position
            if (place === undefined) throw new Error(`Seed chooser seed is not in the catalog: ${seedId}`)
            return { seedId, place }
        })
        this.entries = entries
        for (const card of [...available.map(seedId => ({ seedId }) as ChooserEntry), ...this.entries]) {
            const seed = content.definitions.seeds[card.seedId]
            const args = { definitions: content.presentation, name: `Choose-${cardKey(card)}`, parent: this.cards, layer: parent.layer,
                x: 0, y: 0, cost: seed.sunCost, costFont: ui.assets.fonts.packetCost, loadSprite: (name: string) => sprites.load(`pvz:${name}`) }
            const views = [new SeedPacketView({ ...args, name: `ChosenShadow-${cardKey(card)}`, parent: shadows, iconLayer: this.cardIcons }),
                new SeedPacketView({ ...args, iconLayer: this.cardIcons })]
            let tooltipOptions: Parameters<UI['tooltip']>[1]
            let warning: string | undefined
            if (seed.kind === 'zombie') {
                // A zombie seed's packet draws its zombie (SEED_ZOMBIE_*), named as the almanac names it.
                for (const view of views) view.setSeed(-1, seed.sunCost, seed.id)
                tooltipOptions = { text: ui.text(content.presentation.zombies[seed.id]?.nameKey ?? seed.id), gap: 0 }
            } else if (seed.kind === 'grave') {
                for (const view of views) view.setSeed(-1, seed.sunCost, undefined, true)
                tooltipOptions = { text: ui.text('GRAVE_SEED'), gap: 0 }
            } else {
                const visual = plantDefinition(content.presentation, seed.id).visual
                for (const view of views) view.setSeed(visual.seedType, seed.sunCost)
                const nameKey = visual.nameKey ?? String(visual.seedType).toUpperCase()
                warning = card.team === undefined ? notRecommended(card.seedId) : undefined
                tooltipOptions = { title: ui.text(nameKey), text: ui.text(visual.tooltipKey ?? `${nameKey}_TOOLTIP`), gap: 0,
                    ...(warning ? { warning: ui.text(warning) } : {}) }
            }
            const [shadow, view] = views
            // A card of the other side from its seed's own faces the other way, as it does in the bank.
            if (packetTeam(seed, card.team)) for (const packet of views) packet.setMirrored(true)
            shadow.applyColor(new Color(55, 55, 55))
            shadow.node.active = false
            view.node.setSiblingIndex(slots)
            view.node.active = false
            const tooltip = ui.tooltip(view.node, tooltipOptions)
            const button = view.node.addComponent(UIButton)
            button.hapticsEnabled = false
            button.clickOnPress = true
            button.canInteract = () => !!this.snapshot && !this.snapshot.paused && this.choosing && this.introTick >= 425 && !this.warningOpen
            const choice: Choice = { ...card, key: cardKey(card), view, shadow, button, tooltip, slot: -1, notRecommended: warning !== undefined }
            button.onHoverChange = hovering => hovering && !this.inFlight ? tooltip.show() : tooltip.hide()
            this.choices.push(choice)
        }
        // The pictures in the order of their cards, each drawn over the earlier ones (SeedChooserScreen::Draw goes through
        // the seed types in turn), so a picture standing out of its packet shows over the card before it.
        for (const choice of this.choices) choice.view.raiseIcon()
        this.start = ui.button(this.buttons, { text: ui.text('LETS_ROCK_BUTTON'), skin: 'seed', font: 'yellow',
            color: Color.WHITE, disabledColor: new Color(64, 64, 64), x: 154, y: 545, width: 156, height: 42,
            rightClickTriggers: false, enabled: false, onClick: () => this.confirm() })
        this.start.canInteract = () => this.canStart
        // LawnApp::CanShowAlmanac and CanShowStore show them; SeedChooserScreen::ButtonDepress ignores them while seeds fly.
        for (const [shown, key, x, open] of [[pages.almanac, 'ALMANAC_BUTTON', 560, () => this.onAlmanac()],
            [pages.store, 'SHOP_BUTTON', 680, () => this.onStore()]] as const) {
            if (!shown) continue
            const button = ui.button(this.buttons, { text: ui.text(key), skin: 'seedSmall', x, y: 572, rightClickTriggers: false, onClick: open })
            this.pageButtons.push(button)
            button.canInteract = () => !!this.snapshot && !this.snapshot.paused && this.choosing && this.introTick >= 425 && !this.warningOpen && !this.inFlight
        }
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
        // The mouse wheel while the chooser is out, for a Mod to use (onWheel).
        const wheel = (event: EventMouse) => { if (this.panel.active) this.onWheel?.(event) }
        // HUD is above the seed bank. Listening on it would turn it into a hit target covering the bank. The level's root
        // is under everything, so listening there takes no click from anything else: a node with any mouse listener
        // takes every mouse press over it (NodeEventProcessor._handleMouseDown), whatever it listens for.
        inputRoot.on(Node.EventType.MOUSE_DOWN, pointerDown, this, true)
        inputRoot.on(Node.EventType.TOUCH_START, pointerDown, this, true)
        inputRoot.on(Node.EventType.MOUSE_WHEEL, wheel, this, true)
        this.panel.once(Node.EventType.NODE_DESTROYED, () => {
            inputRoot.off(Node.EventType.MOUSE_DOWN, pointerDown, this, true)
            inputRoot.off(Node.EventType.TOUCH_START, pointerDown, this, true)
            inputRoot.off(Node.EventType.MOUSE_WHEEL, wheel, this, true)
        })
        this.showCards(this.catalogCards)
    }

    /**
     * Shows these cards in the grid, each at its place, with silhouettes on the places left empty (SeedChooserScreen::
     * Draw); five rows, or six once a card sits at 40-47 (Has7Rows). `places` limits the silhouettes to the first that
     * many places (a page of its own that need not fill the grid); the whole grid by default. Cards in the bank stay
     * there; a card waiting in the grid that is not listed is put away.
     */
    showCards(cards: readonly ChooserCard[], places?: number): void {
        const homes = new Map(cards.map(card => {
            const seed = this.definitions.seeds[card.seedId], team = seed && packetTeam(seed, card.team)
            return [cardKey({ seedId: card.seedId, ...(team ? { team } : {}) }), card.place]
        }))
        const sixRows = cards.some(card => card.place >= FIVE_ROW_PLACES)
        const grid = (index: number) => ({ x: index % 8 * 53 + 22, y: Math.floor(index / 8) * (sixRows ? 70 : 73) + (sixRows ? 123 : 128) })
        for (const node of this.gridSilhouettes) node.destroy()
        const taken = new Set(cards.map(card => card.place))
        this.gridSilhouettes = []
        for (let index = 0; index < Math.min(places ?? Infinity, sixRows ? CHOOSER_PLACES : FIVE_ROW_PLACES); index++) {
            if (!taken.has(index)) this.gridSilhouettes.push(this.ui.image(this.gridShadows, this.silhouette, grid(index)).node)
        }
        for (const choice of this.choices) {
            const place = homes.get(choice.key)
            choice.home = place === undefined ? undefined : grid(place)
            if (choice.home) choice.shadow.node.setPosition(choice.home.x, -choice.home.y)
            choice.tooltip.hide()
        }
        this.syncIntro(this.introTick)
        UIHoverManager.refreshHoverStates()
    }

    /** Until the first snapshot the chooser is choosing; a bank that went back to being dealt after a repick is not. */
    get choosing(): boolean { return this.snapshot ? this.snapshot.seedChooser?.choosing === true : true }
    get active(): boolean { return this.panel.active }
    private get inFlight(): boolean { return this.choices.some(choice => !!choice.motion) }

    bind(send: (command: GameCommand) => void): void { this.send = send }

    /** A seed-slot upgrade bought in the intro adds an empty slot; the bank squeezes its packets to fit. */
    setSlots(slots: number): void {
        if (slots <= this.slots) return
        this.slots = slots
        this.addEmptySlots()
        for (const choice of this.choices) if (choice.slot >= 0 && !choice.motion) {
            const destination = this.slotPosition(choice.slot)
            choice.view.node.setPosition(destination.x, -destination.y)
        }
    }

    private addEmptySlots(): void {
        for (let index = this.emptySlots.length; index < this.slots; index++) {
            const node = this.ui.image(this.cards, this.silhouette).node
            // Empty slots stay under the cards, in slot order.
            node.setSiblingIndex(index)
            this.emptySlots.push(node)
        }
        this.emptySlots.forEach((node, index) => { const { x, y } = this.slotPosition(index); node.setPosition(x, -y) })
    }

    /** Board::GetSeedPacketPositionX, 8px below the bank's top, from where the bank stands now. */
    private slotPosition(slot: number): { x: number, y: number } {
        return { x: seedPacketX(slot, this.slots) + this.bankShift, y: 8 }
    }

    /**
     * How far the bank stands right of its choosing place (SEED_BANK_OFFSET_X), while a repick slides it there and back:
     * the cards resting in it and its empty slots ride along (SeedChooserScreen::GetSeedPositionInBank reads mSeedBank->mX).
     */
    setBankShift(shift: number): void {
        if (shift === this.bankShift) return
        this.bankShift = shift
        for (const choice of this.choices) if (choice.slot >= 0 && !choice.motion) {
            const destination = this.slotPosition(choice.slot)
            choice.view.node.setPosition(destination.x, -destination.y)
        }
        this.emptySlots.forEach((node, index) => { const { x, y } = this.slotPosition(index); node.setPosition(x, -y) })
    }

    placeBefore(node: Node): void {
        this.edge.setSiblingIndex(node.getSiblingIndex())
    }

    /** Presses Let's Rock from the keyboard, as a click on it would; whether it could be pressed. */
    pressStart(): boolean {
        return this.start.trigger()
    }

    /** Puts `node`, the chooser's sibling, right under it: over everything else, below the chooser's cards. */
    placeUnder(node: Node): void {
        const from = node.getSiblingIndex(), to = this.edge.getSiblingIndex()
        // setSiblingIndex takes the node out before putting it back in.
        node.setSiblingIndex(from < to ? to - 1 : to)
    }

    sync(snapshot: WorldSnapshot): void {
        const before = this.snapshot
        this.snapshot = snapshot
        // A repick drops the chooser in from the top again, its cards straight in their places.
        const repick = snapshot.seedChooser?.repick === true
        if (repick && snapshot.seedChooser!.choosing && (this.repickTick === undefined || this.repickTick >= 450)) {
            this.repickTick = 400
            this.repickFinished = false
            this.syncIntro(400)
        }
        for (const button of this.pageButtons) button.node.active = !repick
        for (const choice of this.choices) {
            const slot = snapshot.seedPackets.findIndex(packet => packet?.seedId === choice.seedId && packet.team === choice.team)
            if (slot !== choice.slot) {
                const oldSlot = choice.slot
                choice.slot = slot
                // A card going back to a place the grid does not show: a Mod may show it first. Showing it places the
                // waiting cards, so the card starts its flight from where it was.
                if (slot < 0 && !choice.home) {
                    const position = choice.view.node.position.clone()
                    this.onCardHidden({ seedId: choice.seedId, ...(choice.team ? { team: choice.team } : {}) })
                    choice.view.node.setPosition(position)
                }
                const destination = slot < 0 ? choice.home : this.slotPosition(slot)
                if (!destination) { this.land(choice); choice.view.node.active = false; continue }
                if (before && this.introTick >= 425 && snapshot.seedChooser?.choosing) {
                    this.move(choice, destination, slot >= 0 && oldSlot >= 0 ? 15 : 25)
                } else choice.view.node.setPosition(destination.x, -destination.y)
            }
        }
        // SeedChooserScreen::EnableStartButton: the button looks enabled exactly while the bank is full; a dialog or the
        // intro only keeps it from being pressed (canInteract), as GameButton::IsMouseOver does.
        this.start.interactable = !!snapshot.seedChooser && snapshot.seedPackets.length === snapshot.seedChooser.slots
        this.syncPlaceholders()
    }

    update(dt: number): void {
        this.age += dt * 100
        // A repick holds the chooser down while choosing and lifts it out after Let's Rock; once the bank is back in its
        // place the level goes on.
        if (this.repickTick !== undefined && this.repickTick < REPICK_END_TICK) {
            this.repickTick = this.snapshot?.seedChooser?.repick && this.choosing ? Math.min(425, this.repickTick + dt * 100)
                : Math.min(REPICK_END_TICK, Math.max(450, this.repickTick) + dt * 100)
        }
        if (this.repickTick === REPICK_END_TICK && this.snapshot?.seedChooser?.repick && !this.choosing && !this.repickFinished) {
            this.repickFinished = true
            this.send({ type: 'finishRepick' })
        }
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
        // A pointer already resting on Let's Rock lights it once the chooser has arrived.
        if (this.introTick < 425 && tick >= 425) UIHoverManager.refreshHoverStates()
        this.introTick = tick
        // The intro's preview zombies are not there for a repick.
        this.previewTooltipSurface.active = tick === 425 && this.choosing && !this.snapshot?.paused && !this.snapshot?.seedChooser?.repick
        this.panel.active = tick >= 400 && tick < 475
        this.cards.active = this.panel.active
        this.flying.active = this.panel.active
        this.buttons.active = this.panel.active
        const y = tick <= 425 ? easeInOut(400, 425, tick, -516, 0) : easeInOut(450, 475, tick, 0, -516)
        this.panel.setPosition(0, y)
        this.buttons.setPosition(0, y)
        for (const choice of this.choices) {
            // A card waiting in the grid shows only while the grid lists it.
            choice.view.node.active = this.panel.active && (choice.slot < 0 ? !!choice.home || !!choice.motion : this.choosing)
            if (choice.slot < 0 && !choice.motion && choice.home) choice.view.node.setPosition(choice.home.x, y - choice.home.y)
            // SeedChooserScreen::Draw grays not-recommended packets to 115 only while they sit in the chooser.
            const grayed = choice.notRecommended && choice.slot < 0 && !choice.motion
            if (grayed !== (choice.grayed ?? false)) {
                choice.grayed = grayed
                choice.view.applyColor(grayed ? new Color(115, 115, 115) : Color.WHITE)
            }
        }
        this.syncPlaceholders()
        if (!this.panel.active) for (const choice of this.choices) choice.tooltip.hide()
    }

    private syncPlaceholders(): void {
        for (const choice of this.choices) choice.shadow.node.active = !!choice.home && (choice.slot >= 0 || !!choice.motion)
        this.emptySlots.forEach((node, index) => {
            node.active = this.panel.active && this.choosing && !this.choices.some(choice => choice.slot === index && !choice.motion)
        })
    }

    private pick(choice: Choice): void {
        for (const candidate of this.choices) this.land(candidate)
        if (choice.slot < 0 && this.snapshot!.seedPackets.length >= this.snapshot!.seedChooser!.slots) return
        for (const candidate of this.choices) candidate.tooltip.hide()
        void SoundSystem.play(SoundEffect.Tap)
        this.send({ type: 'chooseSeed', seedId: choice.seedId, ...(choice.team ? { team: choice.team } : {}) })
    }

    private move(choice: Choice, destination: { x: number, y: number }, duration: number): void {
        choice.view.node.setParent(this.flying)
        choice.view.setIconLayer(undefined)
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
        choice.view.setIconLayer(this.cardIcons)
        this.syncPlaceholders()
        // The cards and their pictures in reading order, each over the one before it, as SeedChooserScreen::Draw and
        // SeedBank::Draw go left to right.
        this.choices.filter(candidate => !candidate.motion)
            .sort((a, b) => b.view.node.position.y - a.view.node.position.y || a.view.node.position.x - b.view.node.position.x)
            .forEach((candidate, index) => { candidate.view.node.setSiblingIndex(this.emptySlots.length + index); candidate.view.raiseIcon() })
        UIHoverManager.refreshHoverStates()
    }

    /** Let's Rock answers once the intro has shown the chooser, while choosing, unpaused and with no warning open. */
    private get canStart(): boolean {
        return !!this.snapshot && !this.snapshot.paused && this.choosing && this.introTick >= 425 && !this.warningOpen
    }

    private confirm(): void {
        if (!this.start.interactable || !this.canStart) return
        for (const choice of this.choices) { this.land(choice); choice.tooltip.hide() }
        const warnings = this.snapshot?.seedChooser?.warnings ?? []
        if (!warnings.length) { this.send({ type: 'confirmSeeds' }); return }
        this.warningOpen = true
        // DisplayRepickWarningDialog: each warning in turn; any repick stops the start.
        void (async () => {
            for (const warning of warnings) {
                const confirmed = await this.ui.dialog(this.edge.parent!, { title: this.ui.text('DIALOG_WARNING'), message: this.ui.text(warning),
                    confirmText: this.ui.text('DIALOG_BUTTON_YES'), cancelText: this.ui.text('REPICK_BUTTON') }).result
                if (!confirmed || !this.panel.isValid) { this.warningOpen = false; return }
            }
            this.warningOpen = false
            this.send({ type: 'confirmSeeds' })
        })()
    }
}
