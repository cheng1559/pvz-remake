import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { Color, Mask, Node, Sprite, Vec3 } from 'cc'
import type { JsonObject, WorldSnapshot } from '@/shared/protocol'
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

/** The tools the server gives this game; a level does not list them. */
export function ownedTools(snapshot: WorldSnapshot): string[] {
    return (snapshot.extensions['pvz:tools'] as { owned: string[] } | undefined)?.owned ?? []
}

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
    private conveyor?: Node
    private belt?: Sprite
    private beltFrames: import('cc').SpriteFrame[] = []
    private dave?: CrazyDaveView
    private daveDialog?: number
    private tooltip?: UITooltip
    private shovelButton?: UIButton
    private shovelHotkey?: UILabel
    private shovelX = 0

    static async create(parent: Node, bankLayer: Node, content: LoadedContent, ui: UI, initial: WorldSnapshot, cursorLayer: Node, seedBank: LevelSeedBank, player: LevelPlayer, tooltipSurface: Node, daveLayer: Node): Promise<LevelBoardHud> {
        const root = uiNode({ name: 'BoardHud', parent, anchor: { x: 0, y: 1 }, size: { width: 800, height: 600 } }).node
        const result = new LevelBoardHud(root, content, ui, player)
        const sprites = new SpriteRepository(content.registry, content.loader)
        const level = content.levels.levels[initial.levelId]
        if (ownedTools(initial).includes('pvz:shovel')) {
            const [bankFrame, shovelFrame] = await Promise.all(['shovelbank', 'shovel'].map(id => sprites.load(`pvz:${id}`)))
            const layout = content.presentation.shovel
            result.shovelX = layout.x + seedBankExtraWidth(level.conveyor?.capacity ?? initial.seedChooser?.slots ?? initial.seedPackets.length)
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
            // Board::DrawUIBottom draws the seed bank (and its conveyor) before the shovel.
            if (result.shovelBank) conveyor.setSiblingIndex(result.shovelBank.getSiblingIndex())
            ui.image(conveyor, backdrop, { x: layout.backdropX, y: 0 })
            result.beltFrames = Array.from({ length: layout.frames }, (_, index) => getAtlasFrame(frame, index, layout.beltWidth, layout.beltHeight, 1))
            result.belt = ui.image(conveyor, result.beltFrames[0], { x: layout.clipX, y: layout.beltY }).node.getComponent(Sprite)!
            const clip = uiNode({ name: 'ConveyorPackets', parent: conveyor, position: { x: layout.clipX, y: 0 }, anchor: { x: 0, y: 1 }, size: layout, mask: Mask.Type.GRAPHICS_RECT }).node
            seedBank.attachConveyor(clip)
        }
        // Dave comes for scripted dialogue. He stands on a screen layer outside the board, so neither the lawn's shift
        // nor the intro camera moves him.
        if (initial.tutorial.dave && initial.tutorial.step !== 'complete') {
            const stage = uiNode({ name: 'DaveStage', parent: daveLayer, position: { x: -400, y: 300 }, anchor: { x: 0, y: 1 }, size: { width: 800, height: 600 } }).node
            result.dave = await CrazyDaveView.create(stage, content, ui)
        }
        root.setSiblingIndex(cursorLayer.getSiblingIndex())
        if (initial.tick > 0 || initial.phase === 'gameplay') result.delay = content.presentation.dave.delay
        result.sync(initial)
        return result
    }

    private constructor(private root: Node, private content: LoadedContent, private ui: UI, private player: LevelPlayer) {}

    /** The line asks a Yes/No question (`pvz:dialog`'s `question`); the level answers it (CutScene::CrazyDaveDialogDone). */
    onQuestion?: (question: JsonObject) => void

    /** Board::GetSeedBankExtraWidth: the shovel bank moves right as the seed bank widens. */
    setSeedBankSlots(slots: number): void {
        if (!this.shovelBank) return
        this.shovelX = this.content.presentation.shovel.x + seedBankExtraWidth(slots)
        this.shovelBank.setPosition(this.shovelX, this.shovelBank.position.y)
    }

    get blocksIntro(): boolean { return !!this.dave && this.snapshot?.phase !== 'gameplay' && (this.snapshot?.tutorial.step !== 'complete' || this.dave.busy || this.delay < this.content.presentation.dave.delay) }
    get dialogReady(): boolean { return this.dave?.canAdvance ?? false }
    /** LawnApp::mCrazyDaveState is not CRAZY_DAVE_OFF: Dave is entering, talking or leaving. */
    get daveOut(): boolean { return this.dave?.busy ?? false }

    update(dt: number, introTicks: number): void {
        this.introTicks = introTicks
        this.delay += dt
        this.dave?.update(dt)
        if (this.snapshot) this.sync(this.snapshot)
    }

    sync(snapshot: WorldSnapshot): void {
        this.snapshot = snapshot
        const dialog = snapshot.extensions['pvz:dialog'] as { index: number; question?: JsonObject } | undefined
        if (this.dave && this.delay >= this.content.presentation.dave.delay && dialog?.index !== this.daveDialog) {
            this.daveDialog = dialog?.index
            const line = dialog && this.ui.text(`CRAZY_DAVE_${dialog.index}`)
            if (dialog) this.dave.say(line!.replace(/\{PLAYER_NAME\}/g, this.player.name)
                .replace(/\{MONEY\}/g, formatMoney(snapshot.money)).replace(/\{UPGRADE_COST\}/g, formatMoney(this.player.upgradeCost)))
            else this.dave.leave()
            if (dialog?.question) this.onQuestion?.(dialog.question)
        }
        if (this.shovelBank) {
            const layout = this.content.presentation.shovel
            // The shovel leaves for a repick (`/repick`) until the level goes on, as it is hidden for the intro's choice.
            this.shovelBank.active = snapshot.result !== 'lost' && (!!snapshot.tutorial.toolsInIntro || snapshot.phase === 'gameplay')
                && !snapshot.seedChooser?.choosing && !snapshot.seedChooser?.repick
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
