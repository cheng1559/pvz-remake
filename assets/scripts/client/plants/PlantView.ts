import { loadReanim, prepareReanims } from '@/client/reanim/ReanimAssets'
import { Color, type Node, Sprite } from 'cc'
import type { ClientAnimationClip } from '@/client/content/ClientAnimationRegistry'
import { boardToLayer, type Content, type EntityView, type LevelStage, plantShadow, type StageEvent } from '@/client/level/LevelStage'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { entityTint } from '@/client/view/tints'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { EntityAttachments } from '@/client/view/EntityAttachments'
import { type LayerClips, LayerPlayers, type LayerShown, ownFrames, shownLayer } from '@/client/view/layerPlayback'
import { uiNode } from '@/client/view/uiNode'
import { PLANT_BLINK_LAYER, type PlantAnimationDefinition } from '@/shared/content/gameplay'
import { type ReanimKeyframe, type ReanimTrack, sampleReanimTrack } from '@/shared/content/reanim'
export type { LayerShown } from '@/client/view/layerPlayback'
import { renderOrder } from '@/shared/content/renderOrder'
import { ASSET_FPS } from '@/shared/content/animation'
import { type AnimatedPlant, stepPlantAnimation } from '@/shared/content/plantAnimation'
import { offBoardRandom } from '@/client/view/offBoard'
import { mirrorX, PLANT_WIDTH, plantFacingX, plantTeam } from '@/shared/content/teams'
import { type PlantSnapshot, type WorldSnapshot } from '@/shared/protocol/index'
import { plantDefinition } from './definitions'

/**
 * A plant as a view shows it: what its layers play. On the board it is the server's whole snapshot; off it (the
 * almanac, a packet's picture) there is nothing else to it but the countdown to its blink, which its view keeps on
 * with the rest (advance), and the state of its ability it is in there (PlantAnimationDefinition.offBoard).
 */
export type ShownPlant = Partial<PlantSnapshot> & Pick<PlantSnapshot, 'typeId'> & Pick<AnimatedPlant, 'blinkTicks'>
/** How a view draws its plant, where that is not the board's way. */
export interface PlantDraw {
    /** Where the plant goes in its node, in place of where each of its clips has it. */
    position?: { x: number, y: number }
    /** Its size, in place of the presentation's. */
    scale?: number
    /** `false`: without its shadow. */
    shadow?: boolean
}
export interface PlantViewContext {
    node: Node
    content: Content
    /** Off the board, what it shows from the start, which its view keeps animating (advance). */
    plant: ShownPlant
    /** The board it is on; none off the board (offBoard.ts). */
    stage?: LevelStage
    draw?: PlantDraw
}

/** Reanimation::StartBlend(20): a layer that changes its clip blends from the pose it had, unless the clip says how long. */
const BLEND_SECONDS = 0.2
/** The original's driver for a mowed zombie, which a mowed plant is squashed by too (MOWERED_CLIP). */
const MOWERED_REANIM = 'pvz:lawnmowered_zombie'
/** The point LawnMoweredZombie's locator turns a zombie about, its foot, in the zombie's own y-up units. */
const MOWERED_ZOMBIE_FOOT = { x: 50, y: -117 }
/** A plant turns about the middle of its base instead, from its top left in board units. */
const MOWED_PLANT_FOOT = { x: PLANT_WIDTH / 2, y: 80 }
/** The mowed animation's locator track, loaded once (with the mowed clip) for every squashed plant. */
let locator: { track?: ReanimTrack } | undefined

/**
 * A plant, drawn by its animation (PlantDefinition.animation): a player for each of its layers, showing the clip the
 * layer is on at its time into it. The pictures are the presentation's clip of the same name, which may be as long as
 * it likes: a loop goes at the given rate and comes round by its own length, and a clip played once is stretched over
 * the time it is given.
 *
 * On the board the server keeps the animation and `sync` follows its snapshots, with what else the board does to a
 * plant; off the board the view keeps it itself (`advance`), by the same rules (shared/content/plantAnimation). Either
 * way `pose` shows it.
 */
export class PlantView implements EntityView<PlantSnapshot> {
    /** Effects that belong to the plant, such as Mod-added marks. */
    readonly attachments = new EntityAttachments()
    protected readonly animation: PlantAnimationDefinition
    /** The layers' players are in it, over the shadow: a view moves the plant's picture by it. */
    protected root!: Node
    private layers!: LayerPlayers
    /** Tick the current shot started, for a particle that follows it; null until the next sync reports it. */
    private shotTick?: number | null
    /** The bite or production glow (Plant::mEatenFlashCountdown) of the frame being drawn. */
    protected flash = 0
    private highlighted = false
    /** It is drawn tinted (entityTint), so its players are tinted again once it is not. */
    private hasTint = false
    /** Mowed, it is frozen as it stood for its squashing. */
    private frozen = false
    /** Its shadow's node and the size of the shadow's picture, which `pose` sizes it by (placeShadow). */
    private shadow?: { node: Node, width: number, height: number }

    constructor(protected readonly context: PlantViewContext) {
        const animation = context.content.definitions.plants[context.plant.typeId].animation
        if (!animation) throw new Error(`Plant has no animation for its view: ${context.plant.typeId}`)
        this.animation = animation
    }

    async initialize(): Promise<void> {
        const { node, content, plant, draw, stage } = this.context
        // Plant::DrawShadow skips a few plants, such as the grave buster: those have no shadow in their presentation.
        const frame = draw?.shadow !== false && this.presentation.shadow && await plantShadow(content, stage)
        if (frame && node.isValid) {
            const shadow = uiNode({ name: 'PlantShadow', parent: node, anchor: { x: 0, y: 1 }, sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node
            this.shadow = { node: shadow, width: frame.originalSize.width, height: frame.originalSize.height }
            this.placeShadow(plant)
        }
        // Every clip is in memory from here on, so a layer changes to one at once.
        await prepareReanims(this.playable())
        if (!node.isValid) return
        this.root = uiNode({ name: 'Layers', parent: node }).node
        // Tracks a clip of the plant draws alone (the potato mine's light) are left to it by the others.
        const alone = Object.keys(this.animation.clips).flatMap(name => this.clips[name]?.onlyTracks ?? [])
        this.layers = new LayerPlayers(this.root, [...Object.keys(this.animation.layers), ...(this.animation.blink ? [PLANT_BLINK_LAYER] : [])], alone)
        this.pose(plant)
    }

    protected get presentation() { return plantDefinition(this.context.content.presentation, this.context.plant.typeId) }

    /** The first layer's player: the others are on its parts. */
    protected get body(): ReanimPlayer { return this.layers.player(Object.keys(this.animation.layers)[0]) }

    /** The players of the layers it shows, for whoever shows a picture of the plant (a packet stills and colors them). */
    get players(): ReanimPlayer[] { return this.layers.shown }

    private get clips(): Record<string, ClientAnimationClip | undefined> {
        const { content, plant } = this.context
        return content.animations.resolve(plant.typeId)
    }

    /** The presentation's clip of a name. */
    protected clip(name: string): ClientAnimationClip {
        const clip = this.clips[name]
        if (!clip) throw new Error(`Missing plant clip ${name}: ${this.context.plant.typeId}`)
        return clip
    }

    /**
     * The Reanim its layers may show, loaded before the first: the animation's clips and what the presentation shows in
     * their place off the board, and a Mod that shows others adds those.
     */
    protected playable(): string[] {
        return Object.keys(this.animation.clips).map(name => this.clip(name).reanimId)
    }

    /** How long one of its Reanim is, in the frames of its own pace (12 a second): what a Mod times a clip of its own by. */
    protected ownFrames(reanimId: string): number {
        return ownFrames(reanimId)
    }

    /**
     * What a layer shows: the clip the plant has it on; nothing for a layer it has nothing on. A Mod shows another clip
     * in its place here, loaded by `playable`.
     */
    protected shown(layer: string, plant: ShownPlant): LayerShown | undefined {
        const state = plant.animations?.[layer]
        // A Mod's clip that is not the animation's is a loop of its own length.
        return state && shownLayer(state, plant.animations, this.layerClips)
    }

    /**
     * Each layer on what it shows and at its time; a layer with nothing to show, or hidden, is not drawn. This is all
     * there is to a plant off the board.
     */
    pose(plant: ShownPlant): void {
        const { draw } = this.context
        this.layers.show(name => this.shown(name, plant), {
            blend: (_name, clip, first) => first ? 0 : clip.blend ?? BLEND_SECONDS,
            // The bottom layer at its place and size; another on no part, at its own place.
            place: (_name, player, clip, first) => {
                const own = draw?.position ?? clip, scale = first ? draw?.scale ?? this.presentation.scale : 1
                player.node.setPosition(own.x, own.y)
                player.node.setScale(scale, scale, 1)
            },
            basePose: (clip, track) => this.basePose(clip, track),
        })
        // Plant::DoBlink hides the eyes under the blink, for as long as it is shown.
        const blinking = this.shown(PLANT_BLINK_LAYER, plant) !== undefined
        for (const name of Object.keys(this.animation.layers)) {
            const clip = plant.animations?.[name] && this.clip(plant.animations[name].clip)
            if (clip && !clip.onlyTracks) this.layers.player(name).setTracksVisible(this.presentation.parts?.eyes ?? [], !blinking)
        }
        // On the board and off it (the almanac): the layers over the first are on its parts, so its colors reach them all.
        if (this.body.loadedId) this.body.setColorOverride(this.tinted())
        this.placeShadow(plant)
    }

    /**
     * Plant::DrawShadow: the board's plant shadow at the presentation's place, about its middle at its `scale`, or at
     * what its `states` has for the state the plant's ability is in; `[from, to]` goes from one to the other as the
     * first layer's clip plays (a sun-shroom growing: 0.5 + 0.5 * its body's anim_grow time).
     */
    private placeShadow(plant: ShownPlant): void {
        const shadow = this.shadow, place = this.presentation.shadow
        if (!shadow?.node.isValid || !place) return
        const sized = plant.ability && place.states?.[plant.ability.state]
        let scale = typeof sized === 'number' ? sized : place.scale ?? 1
        if (Array.isArray(sized)) {
            const layer = plant.animations?.[Object.keys(this.animation.layers)[0]], frames = layer && this.animation.clips[layer.clip]?.frames
            scale = sized[0] + (sized[1] - sized[0]) * (layer && frames ? Math.min(1, layer.time / frames) : 0)
        }
        shadow.node.setPosition(place.x + shadow.width * (1 - scale) / 2, place.y - shadow.height * (1 - scale) / 2, -1)
        shadow.node.setScale(scale, scale, 1)
    }

    /** The plant's clips, for what a layer shows (shownLayer). */
    private get layerClips(): LayerClips {
        return {
            picture: name => this.clip(name), played: name => this.animation.clips[name],
            duration: reanimId => ReanimPlayer.duration(reanimId) ?? 0,
        }
    }

    /** The pose a clip says its part is attached from (the first frame of the part in another of the plant's clips), when it does. */
    private basePose(clip: ClientAnimationClip, track: string): ReanimKeyframe | undefined {
        if (!clip.attachmentBase) return undefined
        const pose = ReanimPlayer.firstPose(this.clip(clip.attachmentBase).reanimId, track)
        if (!pose) throw new Error(`${clip.reanimId} is attached from a part ${clip.attachmentBase} does not have: ${track}`)
        return pose
    }

    /**
     * Off the board: its animation goes on by `ticks` by the rules the server animates a plant by (stepPlantAnimation),
     * from where Plant::PlantInitialize has one not in play start (offBoard.ts), and is posed.
     */
    advance(ticks: number): void {
        const { stage, plant } = this.context
        if (stage) throw new Error(`A plant on the board is animated by the server: ${plant.typeId}`)
        for (let tick = 0; tick < ticks; tick++) stepPlantAnimation(this.animation, plant, offBoardRandom)
        this.pose(plant)
    }

    /** A particle the presentation has follow a shot (the Fume-shroom's cloud, partway into it). */
    fire(): void {
        if (this.presentation.fireParticle) this.shotTick = null
    }

    /**
     * The plant on the board for a frame: where it stands, facing its side's way, and what the board does to any plant
     * (a mowed one is squashed, a chilled one is blue and slow, the shovel over it lights it). `onBoard` shows the
     * plant itself.
     */
    sync(plant: PlantSnapshot, world: WorldSnapshot): void {
        const { node, stage } = this.context
        this.flash = stage?.flashes.plant(plant, world.gameplayTick) ?? 0
        // A mowed plant stays as it stood.
        if (plant.mowered) { this.squash(plant); return }
        // A plant on the zombies' side faces left, mirrored across its width.
        const mirrored = plant.team === 'zombies', at = boardToLayer(plant.x + (mirrored ? PLANT_WIDTH : 0), plant.y)
        node.setPosition(at.x, at.y)
        node.setScale(mirrored ? -1 : 1, 1, 1)
        this.onBoard(plant, world)
        // A plant mind-controlled draws purple, one chilled by a hostile snow pea blue (its slower animation is the
        // server's). Its players are revisited every frame while tinted, since a layer may start a new clip, and once
        // more as it thaws.
        const tint = entityTint(!!plant.mindControlled, (plant.chilledTicks ?? 0) > 0)
        if (tint || this.hasTint) for (const player of node.getComponentsInChildren(ReanimPlayer)) player.setTint(tint)
        this.hasTint = !!tint
        if (this.highlighted) this.glow()
    }

    /** Plant::mHighlighted: the shovel is over it, so all of it is lit; without it, as much as its flash. */
    highlight(on: boolean): void {
        if (on === this.highlighted) return
        this.highlighted = on
        this.glow()
    }

    private glow(): void {
        const gray = Math.min(255, this.flash * 3)
        const color = this.highlighted ? new Color(255, 255, 255, 196) : new Color(gray, gray, gray)
        for (const player of this.context.node.getComponentsInChildren(ReanimPlayer)) player.setExtraAdditiveDraw(this.highlighted || this.flash > 0, color)
    }

    /**
     * A plant a mower crushed (PlantSnapshot.mowered) is squashed with a zombie's LawnMoweredZombie, where the server
     * has it in the driver's clip, as a mowed zombie's body (ZombieView's MoweredDriver): frozen as it stood, without its
     * shadow, its node turns and scales by the locator's pose about the middle of its base as a zombie does about its
     * foot, tipping the way the mower ran, then flattens.
     */
    private squash(plant: PlantSnapshot): void {
        const { node } = this.context
        if (!this.frozen) {
            this.frozen = true
            for (const player of node.getComponentsInChildren(ReanimPlayer)) player.pause()
            if (this.shadow?.node.isValid) this.shadow.node.active = false
        }
        if (!locator) {
            const loaded: { track?: ReanimTrack } = locator = {}
            loadReanim(MOWERED_REANIM)
                .then(({ data }) => { loaded.track = data.tracks.find(track => track.id === 'locator') })
                .catch(error => console.error('[Level] Failed to load the mowed animation', error))
        }
        // The driver's frames are its pictures', made at their own pace, as a zombie's presentation has its clip.
        const pose = locator.track && sampleReanimTrack(locator.track, plant.mowered!.time / ASSET_FPS)
        if (!pose) return
        const facing = plant.team === 'zombies' ? -1 : 1, tip = plant.mowered!.left ? -1 : 1
        const origin = boardToLayer(plant.x + (facing < 0 ? PLANT_WIDTH : 0), plant.y)
        const foot = boardToLayer(plant.x + MOWED_PLANT_FOOT.x, plant.y + MOWED_PLANT_FOOT.y)
        const linear = (degrees: number) => {
            const turn = degrees * Math.PI / 180, cos = Math.cos(turn), sin = Math.sin(turn)
            return (x: number, y: number) => ({ x: cos * pose.scaleX * x - sin * pose.scaleY * y, y: sin * pose.scaleX * x + cos * pose.scaleY * y })
        }
        // The locator moves the zombie's foot (MOWERED_ZOMBIE_FOOT); that carries over to the plant's, mirrored tipping left.
        const zombieFoot = linear(-pose.skewX)(MOWERED_ZOMBIE_FOOT.x, MOWERED_ZOMBIE_FOOT.y)
        const carry = { x: tip * (zombieFoot.x + pose.x - MOWERED_ZOMBIE_FOOT.x), y: zombieFoot.y - pose.y - MOWERED_ZOMBIE_FOOT.y }
        const body = linear(-tip * pose.skewX)(origin.x - foot.x, origin.y - foot.y)
        node.setPosition(foot.x + body.x + carry.x, foot.y + body.y + carry.y)
        node.angle = -tip * pose.skewX
        node.setScale(facing * pose.scaleX, pose.scaleY, 1)
    }

    /**
     * A particle effect of the plant's in board coordinates, at `order` (`renderOrder`), over everything on the board
     * (RENDER_LAYER_TOP) without one. `mirrored`: the effect turned round, for a plant facing left.
     */
    protected particle(effect: string, x: number, y: number, order = renderOrder('top'), tint?: Color, mirrored?: boolean): void {
        this.context.stage?.particle(effect, x, y, order, tint, mirrored)
    }

    /**
     * The plant itself on the board, by the server's snapshot: its layers, a particle that follows its shot, its color
     * and its glow (`flash`). A view adds what its plant does here.
     */
    protected onBoard(plant: PlantSnapshot, world: WorldSnapshot): void {
        this.pose(plant)
        const cue = this.presentation.fireParticle
        if (cue && this.shotTick !== undefined) {
            this.shotTick ??= world.gameplayTick
            if (world.gameplayTick - this.shotTick >= cue.delayTicks) {
                // A plant facing left puffs from its mirrored mouth, the cloud blowing left; Plant::UpdateShooting puts the
                // fume cloud on its row's particle layer.
                const team = plantTeam(plant)
                this.particle(cue.id, plant.x + plantFacingX(cue.x, team), plant.y + cue.y, renderOrder('particle', plant.row), undefined, team === 'zombies')
                this.shotTick = undefined
            }
        }
        const body = this.body
        if (!body.loadedId) return
        const gray = Math.min(255, this.flash * 3)
        body.setExtraAdditiveDraw(this.flash > 0, new Color(gray, gray, gray, 255))
    }

    /** The color the presentation draws the plant in (the explode-o-nut's red). */
    protected get tint(): Color | undefined {
        const tint = this.presentation.visual.tint
        return tint ? new Color(...tint) : undefined
    }

    /** The color the plant is drawn in under `shade` (a packet's gray, a preview's translucency): its tint, shaded. */
    tinted(shade: Color = Color.WHITE): Color {
        const tint = this.tint
        return tint ? new Color(Math.round(shade.r * tint.r / 255), Math.round(shade.g * tint.g / 255), Math.round(shade.b * tint.b / 255), shade.a)
            : shade.clone()
    }

    destroy(): void {}

    /** A plant put down: what its presentation sounds besides the board's planting (Board::DoPlantingEffects). */
    static readonly planted: StageEvent = (stage, event) => {
        SoundSystem.playSounds(stage.content.presentation.plants[String(event.data.typeId)]?.plantedSounds)
    }

    /** Plant::Fire: the plant starts what follows its shot. */
    static readonly fired: StageEvent = (stage, event) => {
        if (typeof event.data.plantId === 'number') stage.view(event.data.plantId, PlantView)?.fire()
    }

    /**
     * Plant::Fire: the plant's muzzle effect where its shot sets off (PlantPresentationDefinition.muzzle), at
     * RENDER_LAYER_LAWN_MOWER and 1 in its row. A shot of the zombies' side flies left, so the effect is mirrored across
     * the projectile's hitbox, as its splat is.
     */
    static readonly shot: StageEvent = (stage, event) => {
        const { plantTypeId, typeId, x, y, row } = event.data
        const muzzle = typeof plantTypeId === 'string' ? stage.content.presentation.plants[plantTypeId]?.muzzle : undefined
        const hitbox = typeof typeId === 'string' ? stage.content.definitions.projectiles[typeId]?.hitbox : undefined
        if (!muzzle || !hitbox || typeof x !== 'number' || typeof y !== 'number' || typeof row !== 'number') return
        const mirrored = event.data.team === 'zombies'
        stage.particle(muzzle.effect, x + mirrorX(muzzle.x, 2 * hitbox.x + hitbox.width, mirrored), y + muzzle.y,
            renderOrder('lawnMower', row, 1), undefined, mirrored)
    }

    /** Plant::Fire for the Fume-shroom plays the fume, and DoRowAreaDamage a splat for the zombies it hits. */
    static readonly areaAttack: StageEvent = (stage, event) => {
        SoundSystem.playSounds(stage.content.presentation.plants[String(event.data.typeId)]?.fireSounds)
        if (Number(event.data.hits) > 0) void SoundSystem.playFoley(SoundEffect.Splat)
    }

    /** Plant::UpdatePotato adds PARTICLE_POTATO_MINE_RISE at the mine's own draw order, so it draws after it, with the dirt's sound. */
    static readonly rose: StageEvent = (stage, event, world) => {
        void SoundSystem.playFoley(SoundEffect.DirtRise)
        const plant = world.plants.find(candidate => candidate.entityId === event.data.entityId)
        if (plant) stage.particle('pvz:potatominerise', plant.x + 40, plant.y + 40, stage.plantOrder(plant))
    }

    /** Plant::DoSpecial: the explosion of the plant's presentation, where it went off, with its sounds. The plant is gone by then. */
    static readonly exploded: StageEvent = (stage, event) => {
        stage.shake(3, -4, 'explosion')
        const presentation = typeof event.data.typeId === 'string' ? stage.content.presentation.plants[event.data.typeId] : undefined
        SoundSystem.playSounds(presentation?.explosionSounds)
        const { x, y, row } = event.data, explosion = presentation?.explosion
        if (!explosion || typeof x !== 'number' || typeof y !== 'number' || typeof row !== 'number') return
        // The server mirrors the blast's center for a plant facing left; the effect's own offset mirrors with it.
        stage.particle(explosion.effect, x + (event.data.team === 'zombies' ? -explosion.x : explosion.x), y, renderOrder(explosion.layer, row))
    }

    /** A sun-shroom grows (FOLEY_PLANTGROW). */
    static readonly grew: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.PlantGrow) }

    /** Plant::UpdateProductionPlant throws its sun (FOLEY_SPAWN_SUN). */
    static readonly produced: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.Throw, 10) }

    /** Chilled by a hostile snow pea, as a zombie's first chill sounds (FOLEY_FROZEN). */
    static readonly chilled: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.Frozen) }

    /** Crushed by a mower, as a zombie is (FOLEY_SPLAT). */
    static readonly mowered: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.Splat) }

    /**
     * Plant::UpdateBowling: a rolling nut hits a zombie. Zombie::TakeShieldDamage rings a screen door; UpdateBowling a
     * helm without a shield. The board shakes with it.
     */
    static readonly bowled: StageEvent = (stage, event) => {
        stage.shake(1, -2, 'heavy')
        void SoundSystem.playFoley(SoundEffect.BowlingImpact, -3)
        const zombie = stage.content.presentation.zombies[String(event.data.typeId)]
        if (event.data.shield) SoundSystem.playSounds(zombie?.shield?.bowlingImpactSounds)
        else if (event.data.helm) SoundSystem.playSounds(zombie?.helm?.bowlingImpactSounds)
    }
}
