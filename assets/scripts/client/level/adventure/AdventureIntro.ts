import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import type { BoardDefinition } from '@/shared/content/gameplay'
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
import type { ContentRegistry } from '@/client/content/ContentRegistry'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { ParticleAssets } from '@/client/particle/ParticleAssets'
import type { LevelIntro } from '../LevelIntro'
import type { LevelIntroContext } from '../LevelPresentation'
import type { ClientContentLoader } from '@/client/content/ClientContentLoader'
import { randomAnimationRate, type ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { UIButton } from '@/client/ui/UIButton'
import type { UITooltip } from '@/client/ui/UITooltip'
import type { UI } from '@/client/ui/UI'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { GameplayDefinitions } from '@/shared/content/gameplay'

const WIDTH = 800
const HEIGHT = 600
const INTRO_BASE_END = 655
const READY_SET_PLANT_TICKS = 183
const PAN_RIGHT_START = 150
const PAN_RIGHT_END = 350
const PAN_LEFT_START = 450
const PAN_LEFT_END = 600
const ROLL_SOD_START = 600
const ROLL_SOD_END = 800
const LAWN_MOWER_START = 620
const LAWN_MOWER_DURATION = 25
const SEED_BANK_START = 600
const SEED_BANK_DURATION = 25
const HOUSE_NAME_DURATION = 250
/** CutScene::mGraveStoneTime: night graves rise after the pan, delaying the mowers and Ready-Set-Plant. */
const GRAVE_STONE_TICKS = 100

/** CutScene::PlaceStreetZombies apportions the configured slots from the actual wave roster. */
export function adventurePreviewTypes(counts: Readonly<Record<string, number>>, definitions: PresentationDefinitions, capacity: number): string[] {
    const entries = Object.entries(counts).filter(([id, count]) => count > 0 && !definitions.zombies[id]?.flag)
    const total = entries.reduce((sum, [, count]) => sum + count, 0)
    return entries.flatMap(([id, count]) => Array.from({ length: Math.max(1, Math.min(count, Math.floor(count * capacity / total))) }, () => id))
}

function applyPreviewParts(player: ReanimPlayer, typeId: string, definitions: PresentationDefinitions, hasTongue: boolean): void {
    const definition = definitions.zombies[typeId]
    const parts = definition.parts
    for (const track of parts.helms) player.setTracksVisible([track], definition.helm?.track === track)
    player.setTracksVisible(parts.hair, !definition.helm || definition.helm.showsHair === true)
    player.setTracksVisible(parts.tongue, hasTongue)
}

export class AdventureIntro implements LevelIntro {
    private ticks = 0
    private destroyed = false
    private hasOpeningDialog = false
    private readonly previewTooltips = new Map<Node, { hit: Node; tooltip: UITooltip }>()
    private previewTooltipContext?: { ui: UI; gameplay: GameplayDefinitions }

    static async create(context: LevelIntroContext, layout: AdventureIntroLayout): Promise<AdventureIntro> {
        const { content, level, slots, board, entityLayer, bank, houseName, audio, mowerShadow, entityNodes, previewZombies } = context
        const sprites = new SpriteRepository(content.registry, content.loader)
        const [sod] = await Promise.all([sprites.load(layout.sod), ...(layout.rolls.length ? [ParticleAssets.load('pvz:sodroll')] : [])])
        const sodClip = uiNode({
            node: slots.sodClip, position: { x: layout.x - 400, y: 300 - layout.y }, anchor: { x: 0, y: 1 },
            size: { width: layout.rolls.length ? 0 : layout.width, height: sod.originalSize.height }, mask: Mask.Type.GRAPHICS_RECT,
        }).node
        uiNode({ node: slots.sodRow, position: { x: -(layout.sourceX ?? 0) }, anchor: { x: 0, y: 1 }, sprite: { frame: sod, sizeMode: Sprite.SizeMode.RAW, trim: false } })
        uiNode({ node: slots.tutorialLawnFlash, position: { x: layout.x - 400, y: 300 - layout.y }, anchor: { x: 0, y: 1 },
            sprite: { frame: sod, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node.active = false
        if (layout.existingSod) {
            const existing = layout.existingSod
            const middle = await sprites.load(existing.sprite)
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
            await player.load('pvz:sodroll', content.registry, content.loader)
            player.play({ loop: false, rate: 1, hideOnFinish: false })
            player.pause()
            node.active = false
            return player
        }))

        let ready: ReanimPlayer | null = null
        if (layout.readySetPlant) {
            const node = uiNode({ name: 'ReadySetPlant', parent: board, position: { x: 0, y: -24 }, active: false }).node
            ready = node.addComponent(ReanimPlayer)
            await ready.load('pvz:readysetplant', content.registry, content.loader)
            ready.play({ loop: false, rate: 1, hideOnFinish: false })
            ready.pause()
        }
        const introZombies: Node[] = []
        const previewTypes = new Map<Node, string>()
        const types = layout.stationary ? [] : adventurePreviewTypes(previewZombies, content.presentation, layout.previewCapacity)
        const introPositions: Array<{ x: number, y: number, z: number }> = []
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
            introPositions.push({
                x: 430 + gridX * 56 + Math.floor(Math.random() * 15),
                y: 230 - gridY * 90 - (gridX % 2) * 30 - Math.floor(Math.random() * 15),
                z: 100 + gridY * 4 + (gridX % 2) * 2,
            })
        }
        await Promise.all(introPositions.map(async (position, index) => {
            const typeId = types[index]
            const definition = content.presentation.zombies[typeId]
            const animations = content.animations.resolve(definition.animationTarget)
            const idle2 = !!animations.idle2 && Math.random() < content.animations.zombieIdle2Chance
            const clip = idle2 ? animations.idle2 : animations.idle
            const node = uiNode({
                name: `IntroZombie-${index}`, parent: entityLayer, position,
                size: { width: 120, height: 120 }, anchor: { x: 0, y: 1 },
            }).node
            uiNode({
                name: 'ZombieShadow', parent: node, position: { x: definition.shadowX, y: -(definition.shadowY ?? 92) }, anchor: { x: 0, y: 1 },
                sprite: { frame: mowerShadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
            })
            const player = uiNode({
                name: 'ZombieAnimation', parent: node, position: { x: clip.x, y: clip.y },
                anchor: { x: 0, y: 1 },
            }).node.addComponent(ReanimPlayer)
            await player.load(clip.reanimId, content.registry, content.loader)
            applyPreviewParts(player, typeId, content.presentation, Math.random() < content.definitions.zombies[typeId].tongueChance)
            player.play({ loop: true, rate: randomAnimationRate(content.animations.rates[idle2 ? 'zombieIdle2' : 'zombieIdle']) / (clip.fps ?? 12) * clip.rateScale, timeSeconds: Math.random() * 20 })
            introZombies.push(node)
            previewTypes.set(node, typeId)
        }))
        introZombies.sort((left, right) => left.position.z - right.position.z)
            .forEach((node, index) => node.setSiblingIndex(index))
        const intro = new AdventureIntro(board, sodClip, sodRolls, layout, ready, introZombies, previewTypes, content.presentation, bank, houseName,
            content.definitions.boards[level.board],
            entityNodes, audio, content.registry, content.loader, content.animations)
        intro.graveTicks = level.graves?.length ? GRAVE_STONE_TICKS : 0
        intro.hasOpeningDialog = context.hasOpeningDialog === true
        if (context.previewTooltipSurface) intro.installPreviewTooltips(context.ui, context.previewTooltipSurface, content.definitions)
        return intro
    }

    private installPreviewTooltips(ui: UI, surface: Node, gameplay: GameplayDefinitions): void {
        this.previewTooltipContext = { ui, gameplay }
        for (const node of this.introZombies) {
            const hit = uiNode({ name: 'ZombieHitArea', parent: node, active: false, anchor: { x: 0, y: 1 } }).node
            const tooltip = ui.tooltip(hit, { text: '', gap: -10, offset: [5, 0], surface })
            const button = hit.addComponent(UIButton)
            button.changeCursor = false
            button.hapticsEnabled = false
            button.rightClickTriggers = false
            button.onPress = () => {}
            button.canInteract = () => surface.activeInHierarchy && this.ticks === 425 && !GameDebugSettings.isMobileMode()
            button.onHoverChange = hovering => hovering ? tooltip.show() : tooltip.hide()
            this.previewTooltips.set(node, { hit, tooltip })
            this.syncPreviewTooltip(node)
        }
    }

    private syncPreviewTooltip(node: Node): void {
        const preview = this.previewTooltips.get(node)
        if (!preview) return
        const { ui, gameplay } = this.previewTooltipContext!
        const typeId = this.previewTypes.get(node)!
        const body = gameplay.zombies[typeId].body
        uiNode({ node: preview.hit, position: { x: body.x, y: -body.y }, size: body })
        preview.tooltip.title = ui.text(this.definitions.zombies[typeId].nameKey ?? typeId)
    }

    constructor(
        private readonly board: Node,
        private readonly sodClip: Node,
        private readonly sodRolls: ReanimPlayer[],
        private readonly layout: AdventureIntroLayout,
        private readonly ready: ReanimPlayer | null,
        private readonly introZombies: Node[],
        private readonly previewTypes: Map<Node, string>,
        private readonly definitions: PresentationDefinitions,
        private readonly bank: Node,
        private readonly houseName: Node,
        private readonly geometry: BoardDefinition,
        private readonly entityNodes: () => Iterable<Node>,
        private readonly audio: LevelAudioPresenter,
        private readonly registry: ContentRegistry,
        private readonly loader: ClientContentLoader,
        private readonly animations: ClientAnimationRegistry,
    ) { if (layout.stationary) this.ticks = SEED_BANK_START }

    get complete(): boolean {
        return this.ticks >= this.endTick
    }

    private graveTicks = 0
    private get sodTicks(): number { return this.layout.rolls.length ? ROLL_SOD_END - ROLL_SOD_START : 0 }
    private get readyStart(): number { return INTRO_BASE_END + this.sodTicks + this.graveTicks }
    get graveStartTick(): number | undefined { return this.graveTicks ? PAN_LEFT_END + this.sodTicks : undefined }
    private get endTick(): number { return this.readyStart + (this.layout.readySetPlant ? READY_SET_PLANT_TICKS : 0) }

    get elapsedTicks(): number { return this.ticks }

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
                const player = node.getChildByName('ZombieAnimation')!.getComponent(ReanimPlayer)!
                return {
                    slot,
                    typeId: this.previewTypes.get(node)!,
                    x: node.position.x,
                    y: node.position.y,
                    z: node.position.z,
                    hasTongue: this.definitions.zombies[this.previewTypes.get(node)!].parts.tongue.some(track => player.isTrackVisible(track)),
                    reanim: player.snapshot(),
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
                node.setPosition(preview.x, preview.y, preview.z)
                const definition = this.definitions.zombies[preview.typeId]
                if (!definition) throw new Error(`Intro zombie is not installed: ${preview.typeId}`)
                this.previewTypes.set(node, preview.typeId)
                const clip = Object.values(this.animations.resolve(definition.animationTarget)).find(clip => clip.reanimId === preview.reanim.id)
                if (!clip) throw new Error(`Intro animation is not installed: ${preview.reanim.id}`)
                let animationNode = node.getChildByName('ZombieAnimation')
                let player = animationNode?.getComponent(ReanimPlayer) ?? null
                if (!player || player.snapshot().id !== preview.reanim.id) {
                    if (animationNode?.isValid) animationNode.destroy()
                    animationNode = uiNode({
                        name: 'ZombieAnimation', parent: node, position: { x: clip.x, y: clip.y },
                        anchor: { x: 0, y: 1 },
                    }).node
                    player = animationNode.addComponent(ReanimPlayer)
                    await player.load(preview.reanim.id, this.registry, this.loader)
                }
                player.restore(preview.reanim)
                applyPreviewParts(player, preview.typeId, this.definitions, preview.hasTongue)
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
            hit.active = tick === 425
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

        const bankHeight = uiNode({ node: this.bank }).transform.height || 87
        const bankStart = SEED_BANK_START + this.sodTicks
        this.bank.active = tick > bankStart
        this.bank.setPosition(
            easeInOut(475, PAN_LEFT_END, tick, 0, 10),
            easeInOut(bankStart, bankStart + SEED_BANK_DURATION, tick, bankHeight, 0),
        )

        for (const node of this.entityNodes()) {
            if (!node.getChildByName('CachedMower')) continue
            const row = Math.round((HEIGHT / 2 - node.position.y - this.geometry.origin.y - 23) / this.geometry.cell.height)
            const start = LAWN_MOWER_START + this.sodTicks + this.graveTicks + (2 - row) * 5
            node.active = tick > start || this.complete
            if (node.active && !this.complete) {
                node.setPosition(
                    easeInOut(start, start + LAWN_MOWER_DURATION, tick, -480, -421),
                    node.position.y,
                )
            }
        }
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
