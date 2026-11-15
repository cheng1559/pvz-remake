import { modResources } from '@/client/content/ModResources'
import { syncTutorialArrow } from './tutorialArrow'
import type { ToolPresentation } from '@/shared/content/presentation'
import { Color, Mask, Node, Sprite, Vec3 } from 'cc'
import type { JsonObject, WorldSnapshot } from '@/shared/protocol'
import { uiNode } from '@/client/view/uiNode'
import { UI } from '@/client/ui/UI'
import { UIButton } from '@/client/ui/UIButton'
import { getAtlasFrame } from '@/client/render/atlasFrame'
import { CrazyDaveView } from '@/client/characters/CrazyDaveView'
import type { LevelPlayer, LoadedContent } from './LevelView'
import { formatMoney } from '@/client/ui/formatMoney'
import type { LevelSeedBank } from './LevelSeedBank'
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
    private readonly tools: ToolSlot[] = []
    private conveyor?: Node
    private belt?: Sprite
    private beltFrames: import('cc').SpriteFrame[] = []
    private dave?: CrazyDaveView
    private daveDialog?: number

    static async create(parent: Node, bankLayer: Node, content: LoadedContent, ui: UI, initial: WorldSnapshot, cursorLayer: Node, seedBank: LevelSeedBank, player: LevelPlayer, tooltipSurface: Node, daveLayer: Node): Promise<LevelBoardHud> {
        const root = uiNode({ name: 'BoardHud', parent, anchor: { x: 0, y: 1 }, size: { width: 800, height: 600 } }).node
        const result = new LevelBoardHud(root, content, ui, player)
        const level = content.levels.levels[initial.levelId]
        const slots = level.conveyor?.capacity ?? initial.seedChooser?.slots ?? initial.seedPackets.length
        for (const toolId of ownedTools(initial)) {
            const look = content.presentation.tools[toolId]
            if (!look) throw new Error(`Tool presentation is not installed: ${toolId}`)
            const [bankFrame, frame] = await Promise.all([look.bank, look.sprite].map(id => modResources.sprite(id)))
            const bank = ui.image(bankLayer, bankFrame, { x: look.x + seedBankExtraWidth(slots), y: 0 }).node
            const image = ui.image(bank, frame, { x: look.imageOffset[0], y: look.imageOffset[1] }).node
            const hotkey = look.hotkey === undefined ? undefined : ui.label(bank, {
                text: look.hotkey, font: 'hotkey', fontSize: 16, color: new Color(213, 159, 43),
                x: bankFrame.originalSize.width - 4, y: -4, align: 'right',
            })
            // The held tool follows the pointer over the lawn, under the plant cursor.
            const cursor = ui.image(cursorLayer, frame).node
            cursor.setSiblingIndex(0)
            cursor.active = false
            const tooltip = ui.tooltip(bank, { text: ui.text(look.tooltipKey), gap: 0, surface: tooltipSurface })
            const button = bank.addComponent(UIButton)
            button.rightClickTriggers = false
            button.touchSlide = false
            button.clickOnPress = true
            button.onHoverChange = hovering => hovering ? tooltip.show() : tooltip.hide()
            result.tools.push({ toolId, look, bank, image, cursor, hotkey, button })
        }
        if (level.conveyor) {
            const layout = content.presentation.conveyor
            const [backdrop, frame] = await Promise.all(['pvz:conveyorbelt_backdrop', 'pvz:conveyorbelt'].map(id => modResources.sprite(id)))
            const conveyor = result.conveyor = uiNode({ name: 'Conveyor', parent: bankLayer, anchor: { x: 0, y: 1 } }).node
            // Board::DrawUIBottom draws the seed bank (and its conveyor) before the shovel.
            if (result.tools.length) conveyor.setSiblingIndex(result.tools[0].bank.getSiblingIndex())
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

    /** Board::GetSeedBankExtraWidth: the tools' banks move right as the seed bank widens. */
    setSeedBankSlots(slots: number): void {
        for (const tool of this.tools) tool.bank.setPosition(tool.look.x + seedBankExtraWidth(slots), tool.bank.position.y)
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
        const available = (snapshot.extensions['pvz:tools'] as { available: string[] } | undefined)?.available ?? []
        let arrow: { x: number, y: number } | undefined
        for (const tool of this.tools) {
            const { look, bank } = tool
            // The tools leave for a repick (`/repick`) until the level goes on, as they are hidden for the intro's choice.
            bank.active = snapshot.result !== 'lost' && (!!snapshot.tutorial.toolsInIntro || snapshot.phase === 'gameplay')
                && !snapshot.seedChooser?.choosing && !snapshot.seedChooser?.repick
            if (tool.hotkey) tool.hotkey.node.active = GameDebugSettings.hotkeysEnabled
            tool.button.interactable = available.includes(tool.toolId)
            if (look.arrowStep !== undefined && snapshot.tutorial.step === look.arrowStep) {
                const size = uiNode({ node: bank }).transform
                // The bank sits in the UI area's edge container, so follow its world position, as the seed arrow does.
                const at = this.root.inverseTransformPoint(new Vec3(), bank.worldPosition)
                arrow = { x: at.x + size.width / 2 + look.arrowOffset[0], y: at.y - size.height + look.arrowOffset[1] }
            }
            const held = snapshot.cursor.mode === 'tool' && snapshot.cursor.toolId === tool.toolId
            tool.image.active = !held
            tool.cursor.active = held && !!this.pointer
            if (this.pointer) tool.cursor.setPosition(this.pointer.x + look.cursorOffset[0], -this.pointer.y + look.cursorOffset[1])
        }
        if (this.tools.length) syncTutorialArrow(this.root, arrow)
        const layout = this.content.presentation.conveyor
        if (this.conveyor) {
            this.conveyor.active = snapshot.result !== 'lost' && (snapshot.phase === 'gameplay' || !this.blocksIntro)
            this.conveyor.setPosition(layout.x, snapshot.phase === 'gameplay' ? 0 : Math.max(0, layout.height * (1 - (this.introTicks - layout.introStart) / layout.introDuration)))
            const ticks = (snapshot.extensions['pvz:conveyor'] as { ticks: number }).ticks
            this.belt!.spriteFrame = this.beltFrames[Math.floor(ticks / layout.frameTicks) % this.beltFrames.length]
        }
    }

    setPointer(point?: { x: number; y: number }): void { this.pointer = point }

    bindTools(select: (toolId: string) => void): ToolButton[] {
        return this.tools.map(({ toolId, button, look }) => {
            button.onClick = () => select(toolId)
            return { toolId, button, hotkey: look.hotkey }
        })
    }
}

/** A tool's bank, as the input binds it: its button and its hotkey letter. */
export interface ToolButton { readonly toolId: string, readonly button: UIButton, readonly hotkey?: string }

interface ToolSlot {
    readonly toolId: string
    readonly look: ToolPresentation
    readonly bank: Node
    readonly image: Node
    readonly cursor: Node
    readonly hotkey?: UILabel
    readonly button: UIButton
}
