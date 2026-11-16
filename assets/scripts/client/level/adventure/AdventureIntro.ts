import { modResources } from '@/client/content/ModResources'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { ZOMBIE_FLAG_LAYER } from '@/shared/content/gameplay'
import { renderOrder } from '@/shared/content/renderOrder'
import type { AdventureIntroLayout, PresentationDefinitions } from '@/shared/content/presentation'
import { Mask, Node, Sprite, Vec3 } from 'cc'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import { easeInOut, linearFloat } from '@/client/view/GameScreenMath'
import { LevelAudioPresenter } from '../LevelAudioPresenter'
import type {
    LevelIntroSnapshot,
    LevelParticleOwnerSnapshot,
} from '../LevelPresentationSnapshot'
import { ParticleAssets } from '@/client/particle/ParticleAssets'
import type { LevelIntro } from '../LevelIntro'
import type { LevelIntroContext } from '../LevelPresentation'
import { SEED_CHOOSER_SLIDE } from '../LevelSeedChooser'
import { createOffBoardZombie } from '@/client/view/offBoard'
import type { ZombieView } from '@/client/zombies/ZombieView'
import { UIButton } from '@/client/ui/UIButton'
import type { UITooltip } from '@/client/ui/UITooltip'
import type { UI } from '@/client/ui/UI'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'

const WIDTH = 800
const HEIGHT = 600
const INTRO_BASE_END = 655
const READY_SET_PLANT_TICKS = 183
const PAN_RIGHT_START = 150
const PAN_RIGHT_END = 350
const PAN_LEFT_START = 450
const PAN_LEFT_END = 600
/** CutScene's TimeSeedBankRightStart: the bank slides from its choosing place back right as the camera pans left. */
const SEED_BANK_RIGHT_START = 475
const ROLL_SOD_START = 600
const ROLL_SOD_END = 800
/** CutScene's TimeLawnMowerStart for the middle row (each row up starts 5 later) and TimeLawnMowerDuration. */
const LAWN_MOWER_START = 620
const LAWN_MOWER_DURATION = 25
const SEED_BANK_START = 600
const SEED_BANK_DURATION = 25
const HOUSE_NAME_DURATION = 250
/** CutScene::mGraveStoneTime: night graves rise after the pan, delaying the mowers and Ready-Set-Plant. */
const GRAVE_STONE_TICKS = 100

/** CutScene::PlaceStreetZombies apportions the configured slots from the actual wave roster, leaving out a zombie that carries a flag. */
export function adventurePreviewTypes(counts: Readonly<Record<string, number>>, definitions: Pick<GameplayDefinitions, 'zombies'>, capacity: number): string[] {
    const entries = Object.entries(counts).filter(([id, count]) => count > 0 && !definitions.zombies[id]?.animation.layers[ZOMBIE_FLAG_LAYER])
    const total = entries.reduce((sum, [, count]) => sum + count, 0)
    return entries.flatMap(([id, count]) => Array.from({ length: Math.max(1, Math.min(count, Math.floor(count * capacity / total))) }, () => id))
}

/**
 * A street's zombie, drawn by its view as it stands off the board (CutScene::PlaceAZombie makes a zombie of
 * ZOMBIE_WAVE_CUTSCENE), with the tongue it was given: by the node it is in.
 */
const street = new WeakMap<Node, { view: ZombieView, hasTongue: boolean }>()

/** The zombie in a street node's `Body`, its shadow beside that. */
async function standInStreet(node: Node, typeId: string, hasTongue: boolean): Promise<ZombieView> {
    street.get(node)?.view.destroy()
    node.getChildByName('Body')?.destroy()
    const view = await createOffBoardZombie(uiNode({ name: 'Body', parent: node }).node, typeId, { hasTongue })
    if (!view) throw new Error(`Street zombie is not drawn off the board: ${typeId}`)
    street.set(node, { view, hasTongue })
    return view
}

export class AdventureIntro implements LevelIntro {
    private ticks = 0
    private destroyed = false
    private hasOpeningDialog = false
    private readonly previewTooltips = new Map<Node, { hit: Node; tooltip: UITooltip }>()
    private previewTooltipContext?: { ui: UI; gameplay: GameplayDefinitions; almanacZombies: readonly string[] }

    static async create(context: LevelIntroContext, layout: AdventureIntroLayout): Promise<AdventureIntro> {
        const { content, level, slots, board, entityLayer, bank, houseName, audio, previewZombies } = context
        const [sod] = await Promise.all([modResources.sprite(layout.sod), ...(layout.rolls.length ? [ParticleAssets.load('pvz:sodroll')] : [])])
        const sodClip = uiNode({
            node: slots.sodClip, position: { x: layout.x - 400, y: 300 - layout.y }, anchor: { x: 0, y: 1 },
            size: { width: layout.rolls.length ? 0 : layout.width, height: sod.originalSize.height }, mask: Mask.Type.GRAPHICS_RECT,
        }).node
        uiNode({ node: slots.sodRow, position: { x: -(layout.sourceX ?? 0) }, anchor: { x: 0, y: 1 }, sprite: { frame: sod, sizeMode: Sprite.SizeMode.RAW, trim: false } })
        uiNode({ node: slots.tutorialLawnFlash, position: { x: layout.x - 400, y: 300 - layout.y }, anchor: { x: 0, y: 1 },
            sprite: { frame: sod, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node.active = false
        if (layout.existingSod) {
            const existing = layout.existingSod
            const middle = await modResources.sprite(existing.sprite)
            const node = uiNode({
                name: 'ExistingSod', parent: board, position: { x: existing.x - WIDTH / 2, y: HEIGHT / 2 - existing.y }, anchor: { x: 0, y: 1 },
                sprite: { frame: middle, sizeMode: Sprite.SizeMode.RAW, trim: false },
            }).node
            node.setSiblingIndex(sodClip.getSiblingIndex())
        }
        slots.sodRoll.active = false
        const sodRolls = await Promise.all(layout.rolls.map(async (roll, index) => {
            const node = uiNode({
                ...(index === 0 ? { node: slots.sodRoll } : { name: 'SodRoll', parent: board }),
                position: { x: roll.x - WIDTH / 2, y: HEIGHT / 2 - roll.y },
                size: { width: WIDTH, height: HEIGHT }, anchor: { x: 0, y: 1 },
            }).node
            node.setSiblingIndex(slots.sodRoll.getSiblingIndex() + index)
            const player = node.addComponent(ReanimPlayer)
            await player.load('pvz:sodroll')
            player.play({ loop: false, rate: 1, hideOnFinish: false })
            player.pause()
            node.active = false
            return player
        }))

        let ready: ReanimPlayer | null = null
        if (layout.readySetPlant) {
            // Screen text: it stays centered when a wide viewport shifts the lawn.
            const node = uiNode({ name: 'ReadySetPlant', parent: slots.overlayLayer, position: { x: 0, y: -24 }, active: false }).node
            ready = node.addComponent(ReanimPlayer)
            await ready.load('pvz:readysetplant')
            ready.play({ loop: false, rate: 1, hideOnFinish: false })
            ready.pause()
        }
        const previewTypes = new Map<Node, string>()
        const types = layout.stationary ? [] : adventurePreviewTypes(previewZombies, content.definitions, layout.previewCapacity)
        const introPositions: Array<{ x: number, y: number, order: number }> = []
        const introSpots = Array.from({ length: 5 }, (_, gridX) =>
            Array.from({ length: 5 }, (_, gridY) => ({ gridX, gridY })),
        ).flat().filter(({ gridX, gridY }) => gridX !== 4 || gridY !== 0)
        while (introPositions.length < types.length) {
            const blocked = content.presentation.zombies[types[introPositions.length]].previewBlockedCells ?? []
            const spots = introSpots.filter(({ gridX, gridY }) => !blocked.some(cell => cell.column === gridX && cell.row === gridY))
            const spot = spots[Math.floor(Math.random() * spots.length)]
            if (!spot) throw new Error('No available preview slot')
            const { gridX, gridY } = spot
            introSpots.splice(introSpots.indexOf(spot), 1)
            // CutScene::PlaceAZombie: with the chooser's Almanac or Store button showing, the last row only shifts sideways.
            const fixedY = gridY === 4 && context.chooserPages === true
            introPositions.push({
                x: 430 + gridX * 56 + Math.floor(Math.random() * 15),
                y: 230 - gridY * 90 - (gridX % 2) * 30 - (fixedY ? 0 : Math.floor(Math.random() * 15)),
                // CutScene::PlaceAZombie draws it on the lawn layer by its cell, over what AddZombieInRow gave it: a row
                // further down, or an odd column (30 lower) of the same row, draws in front.
                order: renderOrder('lawn', 0, (gridX % 2) * 2 + gridY * 4),
            })
        }
        const placed = await Promise.all(introPositions.map(async ({ x, y, order }, index) => {
            const typeId = types[index]
            const node = uiNode({
                name: `IntroZombie-${index}`, parent: entityLayer, position: { x, y },
                size: { width: 120, height: 120 }, anchor: { x: 0, y: 1 },
            }).node
            await standInStreet(node, typeId, Math.random() < content.definitions.zombies[typeId].tongueChance)
            previewTypes.set(node, typeId)
            return { node, order }
        }))
        // Zombies of one order (a row's columns of one parity) draw in the order they were placed. A slot is its zombie's place in drawing, so a restored
        // intro draws its zombies as they were.
        const introZombies = placed.sort((left, right) => left.order - right.order).map(({ node }) => node)
        introZombies.forEach((node, index) => node.setSiblingIndex(index))
        // A conveyor level's belt stands in for the bank (Board::UpdateGame draws no bank with one).
        const shown = level.conveyor ? { ...layout, hiddenSeedBank: true } : layout
        const intro = new AdventureIntro(board, sodClip, sodRolls, shown, ready, introZombies, previewTypes, content.presentation, bank, houseName,
            audio)
        intro.seedChooser = context.seedChooser === true
        intro.graveTicks = level.graves?.length ? GRAVE_STONE_TICKS : 0
        intro.hasOpeningDialog = context.hasOpeningDialog === true
        if (context.previewTooltipSurface) {
            intro.installPreviewTooltips(context.ui, context.previewTooltipSurface, content.definitions, context.almanacZombies ?? [], context.openAlmanacZombie)
        }
        return intro
    }

    private installPreviewTooltips(ui: UI, surface: Node, gameplay: GameplayDefinitions, almanacZombies: readonly string[],
        openAlmanacZombie?: (zombieId: string) => void): void {
        this.previewTooltipContext = { ui, gameplay, almanacZombies }
        for (const node of this.introZombies) {
            const hit = uiNode({ name: 'ZombieHitArea', parent: node, active: false, anchor: { x: 0, y: 1 } }).node
            const tooltip = ui.tooltip(hit, { text: '', gap: -10, offset: [5, 0], surface })
            const button = hit.addComponent(UIButton)
            button.changeCursor = false
            button.hapticsEnabled = false
            button.rightClickTriggers = false
            button.canInteract = () => surface.activeInHierarchy && this.ticks === SEED_CHOOSER_SLIDE.onEnd
            button.onHoverChange = hovering => hovering ? tooltip.show() : tooltip.hide()
            // The arrow stays (SeedChooserScreen::UpdateCursor); a click opens the almanac on this zombie.
            button.pressSound = null
            button.clickOnPress = true
            button.onClick = () => {
                const typeId = this.previewTypes.get(node)!
                if (!openAlmanacZombie || !almanacZombies.includes(typeId)) return
                tooltip.hide()
                void SoundSystem.play(SoundEffect.Tap)
                openAlmanacZombie(typeId)
            }
            this.previewTooltips.set(node, { hit, tooltip })
            this.syncPreviewTooltip(node)
        }
    }

    private syncPreviewTooltip(node: Node): void {
        const preview = this.previewTooltips.get(node)
        if (!preview) return
        const { ui, gameplay, almanacZombies } = this.previewTooltipContext!
        const typeId = this.previewTypes.get(node)!
        const body = gameplay.zombies[typeId].body
        uiNode({ node: preview.hit, position: { x: body.x, y: -body.y }, size: body })
        preview.tooltip.title = ui.text(this.definitions.zombies[typeId].nameKey)
        preview.tooltip.text = almanacZombies.includes(typeId) ? ui.text('CLICK_TO_VIEW') : ''
    }

    constructor(
        private readonly board: Node,
        private readonly sodClip: Node,
        private readonly sodRolls: ReanimPlayer[],
        readonly layout: AdventureIntroLayout,
        private readonly ready: ReanimPlayer | null,
        readonly introZombies: Node[],
        private readonly previewTypes: Map<Node, string>,
        private readonly definitions: PresentationDefinitions,
        private readonly bank: Node,
        private readonly houseName: Node,
        private readonly audio: LevelAudioPresenter,
    ) { if (layout.stationary) this.ticks = SEED_BANK_START }

    get complete(): boolean {
        return this.ticks >= this.endTick
    }

    private graveTicks = 0
    private seedChooser = false
    private get sodTicks(): number { return this.layout.rolls.length ? ROLL_SOD_END - ROLL_SOD_START : 0 }
    private get readyStart(): number { return INTRO_BASE_END + this.sodTicks + this.graveTicks }
    get graveStartTick(): number | undefined { return this.graveTicks ? PAN_LEFT_END + this.sodTicks : undefined }
    private get endTick(): number { return this.readyStart + (this.layout.readySetPlant ? READY_SET_PLANT_TICKS : 0) }

    get elapsedTicks(): number { return this.ticks }

    /**
     * CutScene::UpdateIntro: each row's mower shows once its TimeLawnMowerStart has passed (the higher rows' later),
     * after the lawn is rolled and the graves are up, and comes on over TimeLawnMowerDuration.
     */
    mowerArrival(row: number): number {
        if (this.complete) return 1
        const start = LAWN_MOWER_START + this.sodTicks + this.graveTicks + (2 - row) * 5
        return Math.max(0, Math.min(1, (this.ticks - start) / LAWN_MOWER_DURATION))
    }

    particleOwner(node: Node): Extract<LevelParticleOwnerSnapshot, { kind: 'intro-preview' }> | null {
        for (let slot = 0; slot < this.introZombies.length; slot++) {
            const root = this.introZombies[slot]
            if (node !== root && !node.isChildOf(root)) continue
            const position = root.inverseTransformPoint(new Vec3(), node.worldPosition)
            return { kind: 'intro-preview', slot, x: position.x, y: position.y, z: position.z }
        }
        return null
    }

    particleParent(slot: number): Node | null {
        return this.introZombies[slot] ?? null
    }

    snapshot(): LevelIntroSnapshot {
        return {
            ticks: this.ticks,
            ...(this.hasOpeningDialog ? { hasOpeningDialog: true } : {}),
            previews: this.complete ? [] : this.introZombies.map((node, slot) => {
                const { view, hasTongue } = street.get(node)!
                return {
                    slot,
                    typeId: this.previewTypes.get(node)!,
                    x: node.position.x,
                    y: node.position.y,
                    hasTongue,
                    view: view.playbackSnapshot(),
                }
            }),
        }
    }

    async restore(snapshot: LevelIntroSnapshot): Promise<void> {
        if (snapshot.ticks > this.endTick || snapshot.previews.length !== (snapshot.ticks < this.endTick ? this.introZombies.length : 0)) {
            throw new Error('Invalid adventure intro state')
        }
        this.ticks = snapshot.ticks
        this.hasOpeningDialog = snapshot.hasOpeningDialog === true
        this.destroyed = this.complete
        if (this.complete) {
            for (const node of this.introZombies) if (node.isValid) node.destroy()
        } else {
            for (const preview of snapshot.previews) {
                const node = this.introZombies[preview.slot]
                if (!node?.isValid) throw new Error(`intro preview ${preview.slot} is unavailable`)
                node.setPosition(preview.x, preview.y)
                const definition = this.definitions.zombies[preview.typeId]
                if (!definition) throw new Error(`Intro zombie is not installed: ${preview.typeId}`)
                this.previewTypes.set(node, preview.typeId)
                // Its view takes back where its body was, on the clip it was on.
                const view = await standInStreet(node, preview.typeId, preview.hasTongue)
                await view.restorePlayback(preview.view, `intro preview ${preview.slot}`)
                this.syncPreviewTooltip(node)
            }
        }
        this.sync()
    }

    update(dt: number, stopAtTick = this.endTick): boolean {
        if (this.complete) return true
        const previous = this.ticks
        this.ticks = Math.min(stopAtTick, this.endTick, this.ticks + dt * 100)
        if (this.layout.rolls.length && previous < ROLL_SOD_START && this.ticks >= ROLL_SOD_START) this.startSodRoll()
        if (this.ready && previous < this.readyStart && this.ticks >= this.readyStart) this.audio.readySetPlant()
        this.sync()
        if (!this.complete) return false
        if (!this.destroyed) {
            this.destroyed = true
            for (const node of this.introZombies) if (node.isValid) node.destroy()
        }
        return true
    }

    sync(): void {
        const tick = this.ticks
        for (const { hit, tooltip } of this.previewTooltips.values()) if (hit.isValid) {
            hit.active = tick === SEED_CHOOSER_SLIDE.onEnd
            if (!hit.active) tooltip.hide()
        }
        const boardX = this.layout.stationary ? 0 : tick <= PAN_RIGHT_START
            ? 220
            : tick <= PAN_RIGHT_END
                ? easeInOut(PAN_RIGHT_START, PAN_RIGHT_END, tick, 220, -380)
                : tick <= PAN_LEFT_START
                    ? -380
                    : tick <= PAN_LEFT_END
                        ? easeInOut(PAN_LEFT_START, PAN_LEFT_END, tick, -380, 0)
                        : 0
        this.board.setPosition(boardX, 0)

        const sodProgress = this.sodTicks ? linearFloat(ROLL_SOD_START, ROLL_SOD_END, tick, 0, 1) : 1
        const sodTransform = uiNode({ node: this.sodClip }).transform
        sodTransform.setContentSize(this.layout.width * sodProgress, sodTransform.height)
        const rollProgress = linearFloat(ROLL_SOD_START, ROLL_SOD_END, tick + 1, 0, 1)
        for (const roll of this.sodRolls) {
            roll.node.active = tick >= ROLL_SOD_START && rollProgress < 1
            if (roll.node.active) roll.seek(roll.lastFrameTimeSeconds * rollProgress)
        }
        if (this.ready?.node.isValid) {
            this.ready.node.active = tick >= this.readyStart && !this.complete
            if (this.ready.node.active) this.ready.seek((tick - this.readyStart) / 100)
        }

        const houseNameTicks = Math.max(0, HOUSE_NAME_DURATION - tick)
        this.houseName.active = !this.hasOpeningDialog && !this.layout.stationary && houseNameTicks > 0
        uiNode({ node: this.houseName, opacity: Math.min(255, houseNameTicks * 15) })

        // The bank slides down from above the screen: after the lawn is rolled, or with the seed chooser's drop.
        const bankHeight = uiNode({ node: this.bank }).transform.height || 87
        // The bank drops with the chooser (CutScene's TimeSeedBankOnStart).
        const bankStart = this.seedChooser ? SEED_CHOOSER_SLIDE.onStart : SEED_BANK_START + this.sodTicks
        this.bank.active = !this.layout.hiddenSeedBank && tick > bankStart
        this.bank.setPosition(
            easeInOut(SEED_BANK_RIGHT_START, PAN_LEFT_END, tick, 0, 10),
            easeInOut(bankStart, bankStart + SEED_BANK_DURATION, tick, bankHeight, 0),
        )
    }

    private startSodRoll(): void {
        for (const roll of this.layout.rolls) ParticlePlayer.spawn({
            parent: this.board,
            id: "pvz:sodroll",
            x: 35 + roll.x - WIDTH / 2,
            y: HEIGHT / 2 - roll.particleY,

        })
        this.audio.sodRollStarted()
    }
}
