import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { Color, Mask, Node, Sprite, Vec3 } from 'cc'
import type { WorldSnapshot } from '@/shared/protocol'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { uiNode } from '@/client/view/uiNode'
import { UI } from '@/client/ui/UI'
import { UIButton } from '@/client/ui/UIButton'
import { getAtlasFrame } from '@/client/hud/SeedPacketRenderer'
import { CrazyDaveView } from '@/client/characters/CrazyDaveView'
import type { LevelPlayer, LoadedContent } from './LevelView'
import { formatMoney } from '@/client/ui/formatMoney'
import type { LevelSeedBank } from './LevelSeedBank'
import type { UITooltip } from '@/client/ui/UITooltip'
import type { UILabel } from '@/client/ui/UILabel'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { seedBankExtraWidth } from './LevelGeometry'

/** Optional board tools, opening dialogue and conveyor layout. Packet input belongs to LevelSeedBank. */
export class LevelBoardHud {
    private snapshot?: WorldSnapshot
    private introTicks = 0
    private delay = 0
    private pointer?: { x: number; y: number }
    private shovelArrow?: Node
    private shovelBank?: Node
    private shovel?: Node
    private cursor?: Node
    private stripe?: Node
    private conveyor?: Node
    private belt?: Sprite
    private beltFrames: import('cc').SpriteFrame[] = []
    private dave?: CrazyDaveView
    private daveDialog?: number
    private tooltip?: UITooltip
    private shovelButton?: UIButton
    private shovelHotkey?: UILabel
    private shovelX = 0

    static async create(parent: Node, bankLayer: Node, ground: Node, content: LoadedContent, ui: UI, initial: WorldSnapshot, cursorLayer: Node, seedBank: LevelSeedBank, player: LevelPlayer, tooltipSurface: Node): Promise<LevelBoardHud> {
        const root = uiNode({ name: 'BoardHud', parent, anchor: { x: 0, y: 1 }, size: { width: 800, height: 600 } }).node
        const result = new LevelBoardHud(root, content, ui, player)
        const sprites = new SpriteRepository(content.registry, content.loader)
        const level = content.levels.levels[initial.levelId], board = content.definitions.boards[level.board]
        if (level.tools?.includes('pvz:shovel')) {
            const [bankFrame, shovelFrame] = await Promise.all(['shovelbank', 'shovel'].map(id => sprites.load(`pvz:${id}`)))
            const layout = content.presentation.shovel
            result.shovelX = layout.x + seedBankExtraWidth(level.conveyor?.capacity ?? level.seedBankSlots ?? level.seedPackets.length)
            result.shovelBank = ui.image(bankLayer, bankFrame, { x: result.shovelX, y: 0 }).node
            result.shovel = ui.image(result.shovelBank, shovelFrame, { x: layout.imageOffset[0], y: layout.imageOffset[1] }).node
            result.shovelHotkey = ui.label(result.shovelBank, {
                text: 'F', font: 'hotkey', fontSize: 16, color: new Color(213, 159, 43),
                x: bankFrame.originalSize.width - 4, y: -4, align: 'right',
            })
            // The held shovel follows the pointer over the lawn, under the plant cursor.
            result.cursor = ui.image(cursorLayer, shovelFrame).node
            result.cursor.setSiblingIndex(0)
            result.cursor.active = false
            result.tooltip = ui.tooltip(result.shovelBank, { text: ui.text('SHOVEL_TOOLTIP'), gap: 0, surface: tooltipSurface })
            result.shovelButton = result.shovelBank.addComponent(UIButton)
            result.shovelButton.rightClickTriggers = false
            result.shovelButton.touchSlide = false
            result.shovelButton.clickOnPress = true
            result.shovelButton.onHoverChange = hovering => hovering ? result.tooltip!.show() : result.tooltip!.hide()
        }
        if (level.conveyor) {
            const layout = content.presentation.conveyor
            const [backdrop, frame] = await Promise.all(['conveyorbelt_backdrop', 'conveyorbelt'].map(id => sprites.load(`pvz:${id}`)))
            const conveyor = result.conveyor = uiNode({ name: 'Conveyor', parent: bankLayer, anchor: { x: 0, y: 1 } }).node
            ui.image(conveyor, backdrop, { x: layout.backdropX, y: 0 })
            result.beltFrames = Array.from({ length: layout.frames }, (_, index) => getAtlasFrame(frame, index, layout.beltWidth, layout.beltHeight, 1))
            result.belt = ui.image(conveyor, result.beltFrames[0], { x: layout.clipX, y: layout.beltY }).node.getComponent(Sprite)!
            const clip = uiNode({ name: 'ConveyorPackets', parent: conveyor, position: { x: layout.clipX, y: 0 }, anchor: { x: 0, y: 1 }, size: layout, mask: Mask.Type.GRAPHICS_RECT }).node
            seedBank.attachConveyor(clip)
        }
        if (level.bowling) {
            const [x, y] = content.presentation.conveyor.stripeOffset
            result.stripe = ui.image(ground.parent!, await sprites.load('pvz:wallnut_bowlingstripe'), {
                x: board.origin.x + (level.bowling.lineColumn + 1) * board.cell.width + x - 400, y: board.origin.y + y - 300,
            }).node
            result.stripe.setSiblingIndex(ground.getSiblingIndex() + 1)
        }
        if (level.shovelTutorial || level.introDialog && initial.tutorial.step !== 'complete') result.dave = await CrazyDaveView.create(root, content, ui)
        root.setSiblingIndex(cursorLayer.getSiblingIndex())
        if (initial.tick > 0 || initial.phase === 'gameplay') result.delay = content.presentation.dave.delay
        result.sync(initial)
        return result
    }

    private constructor(private root: Node, private content: LoadedContent, private ui: UI, private player: LevelPlayer) {}

    get blocksIntro(): boolean { return !!this.dave && this.snapshot?.phase !== 'gameplay' && (this.snapshot?.tutorial.step !== 'complete' || this.dave.busy || this.delay < this.content.presentation.dave.delay) }
    get dialogReady(): boolean { return this.dave?.canAdvance ?? false }

    update(dt: number, introTicks: number): void {
        this.introTicks = introTicks
        this.delay += dt
        this.dave?.update(dt)
        if (this.snapshot) this.sync(this.snapshot)
    }

    sync(snapshot: WorldSnapshot): void {
        this.snapshot = snapshot
        const dialog = snapshot.extensions['pvz:dialog'] as { index: number } | undefined
        if (this.dave && this.delay >= this.content.presentation.dave.delay && dialog?.index !== this.daveDialog) {
            this.daveDialog = dialog?.index
            if (dialog) this.dave.say(this.ui.text(`CRAZY_DAVE_${dialog.index}`).replace(/\{PLAYER_NAME\}/g, this.player.name)
                .replace(/\{MONEY\}/g, formatMoney(snapshot.money)).replace(/\{UPGRADE_COST\}/g, formatMoney(this.player.upgradeCost)))
            else this.dave.leave()
        }
        if (this.shovelBank) {
            const layout = this.content.presentation.shovel
            const level = this.content.levels.levels[snapshot.levelId]
            this.shovelBank.active = snapshot.result !== 'lost' && (!!level.shovelTutorial || snapshot.phase === 'gameplay')
            this.shovelHotkey!.node.active = GameDebugSettings.hotkeysEnabled
            this.shovelButton!.interactable = (snapshot.extensions['pvz:tools'] as { available: string[] } | undefined)?.available.includes('pvz:shovel') === true
            if (snapshot.tutorial.step === 'shovel-pickup') {
                const size = uiNode({ node: this.shovelBank }).transform
                // The bank sits in the UI area's edge container, so follow its world position, as the seed arrow does.
                const bank = this.root.inverseTransformPoint(new Vec3(), this.shovelBank.worldPosition)
                const x = bank.x + size.width / 2 + layout.arrowOffset[0], y = bank.y - size.height + layout.arrowOffset[1]
                if (this.shovelArrow?.isValid) this.shovelArrow.setPosition(x, y, 20)
                else this.shovelArrow = ParticlePlayer.spawn({ parent: this.root, id: "pvz:seedpacketpick", x, y, z: 20 }).node
            } else if (this.shovelArrow?.isValid) { this.shovelArrow.destroy(); this.shovelArrow = undefined }
            const held = snapshot.cursor.mode === 'tool'
            this.shovel!.active = !held
            this.cursor!.active = held && !!this.pointer
            if (this.pointer) this.cursor!.setPosition(this.pointer.x + layout.cursorOffset[0], -this.pointer.y + layout.cursorOffset[1])
        }
        const layout = this.content.presentation.conveyor
        if (this.stripe) this.stripe.active = snapshot.phase === 'gameplay' || dialog !== undefined && layout.stripeDialogs.includes(dialog.index) || snapshot.tutorial.step === 'complete'
        if (this.conveyor) {
            this.conveyor.active = snapshot.result !== 'lost' && (snapshot.phase === 'gameplay' || !this.blocksIntro)
            this.conveyor.setPosition(layout.x, snapshot.phase === 'gameplay' ? 0 : Math.max(0, layout.height * (1 - (this.introTicks - layout.introStart) / layout.introDuration)))
            const ticks = (snapshot.extensions['pvz:conveyor'] as { ticks: number }).ticks
            this.belt!.spriteFrame = this.beltFrames[Math.floor(ticks / layout.frameTicks) % this.beltFrames.length]
        }
    }

    setPointer(point?: { x: number; y: number }): void { this.pointer = point }

    bindTools(select: (toolId: string) => void): Array<{ toolId: string; button: UIButton }> {
        if (!this.shovelButton) return []
        this.shovelButton.onClick = () => select('pvz:shovel')
        return [{ toolId: 'pvz:shovel', button: this.shovelButton }]
    }
}
