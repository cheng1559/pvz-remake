import { Color, type Node, Sprite, type SpriteFrame } from 'cc'
import type { ClientAnimationClip, ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import type { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { LevelEntitySnapshot } from '@/client/level/LevelPresentationSnapshot'
import { ReanimPlayer, ReanimRepository } from '@/client/reanim/ReanimPlayer'
import type { EntityAttachments } from '@/client/view/EntityAttachments'
import { uiNode } from '@/client/view/uiNode'
import { PLANT_BLINK_LAYER, type PlantAnimationDefinition } from '@/shared/content/gameplay'
import type { ReanimKeyframe } from '@/shared/content/reanim'
import { plantFacingX, plantTeam } from '@/shared/content/teams'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { plantDefinition } from './definitions'

export type PlantViewSnapshot = Extract<LevelEntitySnapshot, { kind: 'plant' }>
/**
 * Requests a particle in board coordinates, matching Board::AddPvzpParticle. `mirrored`: the effect turned round, for a
 * plant facing left (the zombies' side).
 */
export type PlantParticle = (effect: string, x: number, y: number, tint?: Color, mirrored?: boolean) => void
/**
 * A plant as a view shows it: what its layers play. On the board it is the server's whole snapshot; off it (the
 * almanac, a packet's picture) there is nothing else to it.
 */
export type ShownPlant = Partial<PlantSnapshot> & Pick<PlantSnapshot, 'typeId'>
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
    /** The plant's attachment list for effects that belong to it, such as Mod-added marks. */
    attachments: EntityAttachments
    content: Awaited<ReturnType<typeof loadIntegratedGameContent>>
    animations: ClientAnimationRegistry
    /** `wallnutCracked`: a chewed nut's faces, which only the board needs. */
    assets: { shadow: SpriteFrame; wallnutCracked?: [SpriteFrame, SpriteFrame] }
    plant: ShownPlant
    tick: number
    draw?: PlantDraw
}

/** Reanimation::StartBlend(20): a layer that changes its clip blends from the pose it had, unless the clip says how long. */
const BLEND_SECONDS = 0.2

interface Layer { player: ReanimPlayer, key?: string, time: number, shown: boolean }
interface FireParticle { id: string; x: number; y: number; delayTicks: number }

/** What a layer shows: a clip of the presentation, and how far into it in the server's frames. */
export interface LayerShown {
    /** Names what is shown: a layer shown something else starts it from the beginning. */
    key: string
    clip: ClientAnimationClip
    time: number
    /** Frames a second. */
    rate: number
    /** It plays once, over this many frames whatever its own length; a loop when omitted, coming round by its own length. */
    frames?: number
    hidden?: boolean
}

/**
 * A plant, drawn by its animation (PlantDefinition.animation): a player for each of its layers, showing the clip the
 * layer is on at its time into it. The pictures are the presentation's clip of the same name, which may be as long as
 * it likes: a loop goes at the given rate and comes round by its own length, and a clip played once is stretched over
 * the time it is given.
 *
 * On the board the server keeps the animation and `sync` follows its snapshots, with what else the board does to a
 * plant; off the board whoever shows the plant keeps it (shared/content/plantAnimation) and calls `show`.
 */
export class PlantView {
    protected readonly animation: PlantAnimationDefinition
    /** The layers' players are in it, over the shadow: a view moves the plant's picture by it. */
    protected root!: Node
    private readonly layers = new Map<string, Layer>()
    /**
     * Reanimation::AttachToAnotherReanimation fixes the pose a part is attached from at its first attachment
     * (mFrameBasePose): by the layer and the part.
     */
    private readonly bases = new Map<string, ReanimKeyframe>()
    /** Tick the current shot started, for a particle that follows it; null until the next sync reports it. */
    private shotTick?: number | null

    constructor(protected readonly context: PlantViewContext) {
        const animation = context.content.definitions.plants[context.plant.typeId].animation
        if (!animation) throw new Error(`Plant has no animation for its view: ${context.plant.typeId}`)
        this.animation = animation
    }

    async initialize(): Promise<void> {
        const { node, content, assets, plant, draw } = this.context
        // Plant::DrawShadow skips a few plants, such as the grave buster: those have no shadow in their presentation.
        const shadow = draw?.shadow === false ? undefined : this.presentation.shadow
        if (shadow) {
            const scale = shadow.scale ?? 1, size = assets.shadow.originalSize
            uiNode({
                name: 'PlantShadow', parent: node, anchor: { x: 0, y: 1 },
                position: { x: shadow.x + size.width * (1 - scale) / 2, y: shadow.y - size.height * (1 - scale) / 2, z: -1 },
                sprite: { frame: assets.shadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
            }).node.setScale(scale, scale, 1)
        }
        // Every clip is in memory from here on, so a layer changes to one at once.
        await new ReanimRepository(content.registry, content.loader).prepare(this.playable())
        if (!node.isValid) return
        this.root = uiNode({ name: 'Layers', parent: node }).node
        for (const layer of [...Object.keys(this.animation.layers), ...(this.animation.blink ? [PLANT_BLINK_LAYER] : [])]) {
            this.layers.set(layer, { player: uiNode({ name: layer, parent: this.root }).node.addComponent(ReanimPlayer), time: 0, shown: false })
        }
        this.show(plant)
    }

    protected get presentation() { return plantDefinition(this.context.animations.definitions, this.context.plant.typeId) }

    /** The first layer's player: the others are on its parts. */
    protected get body(): ReanimPlayer { return this.layers.values().next().value!.player }

    /** The players of the layers it shows, for whoever shows a picture of the plant (a packet stills and colors them). */
    get players(): ReanimPlayer[] { return [...this.layers.values()].filter(layer => layer.shown).map(layer => layer.player) }

    private get clips(): Record<string, ClientAnimationClip | undefined> {
        const { animations, plant } = this.context
        return animations.resolve(animations.sourceOf(plant.typeId)) as Record<string, ClientAnimationClip | undefined>
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
        const { offBoard, packet } = this.presentation
        return [...new Set([...Object.keys(this.animation.clips), ...Object.values(offBoard ?? {}), ...Object.values(packet?.clips ?? {})])]
            .map(name => this.clip(name).reanimId)
    }

    /** How long one of its Reanim is, in the frames of its own pace (12 a second): what a Mod times a clip of its own by. */
    protected ownFrames(reanimId: string): number {
        const seconds = ReanimPlayer.duration(reanimId, this.context.content.registry)
        if (seconds === undefined) throw new Error(`Plant Reanim is not loaded: ${reanimId}`)
        return seconds * 12
    }

    /**
     * What a layer shows: the clip the plant has it on; nothing for a layer it has nothing on. A Mod shows another clip
     * in its place here, loaded by `playable`.
     */
    protected shown(layer: string, plant: ShownPlant): LayerShown | undefined {
        const state = plant.animations?.[layer]
        if (!state) return undefined
        // A clip the presentation has in place of the animation's off the board is a loop of its own length.
        const { frames, next, once, hold } = this.animation.clips[state.clip] ?? {}
        return { key: state.clip, clip: this.clip(state.clip), time: state.time, rate: state.rate, hidden: state.hidden,
            ...(next !== undefined || once || hold ? { frames } : {}) }
    }

    /**
     * Each layer on what it shows and at its time; a layer with nothing to show, or hidden, is not drawn. This is all
     * there is to a plant off the board.
     */
    show(plant: ShownPlant): void {
        // The layers under the one being shown, with the tracks each draws.
        const below: [string, ReanimPlayer, readonly string[]][] = [], { registry } = this.context.content, { draw } = this.context
        const scale = draw?.scale ?? this.presentation.scale
        // Tracks a clip of the plant draws alone (the potato mine's light) are left to it by the others.
        const alone = Object.keys(this.animation.clips).flatMap(name => this.clips[name]?.onlyTracks ?? [])
        const blinking = plant.animations?.[PLANT_BLINK_LAYER] !== undefined
        for (const [name, layer] of this.layers) {
            const shown = this.shown(name, plant), { player } = layer
            if (!shown) {
                if (layer.shown) player.hide()
                layer.key = undefined
                layer.shown = false
                continue
            }
            const { clip } = shown, loop = shown.frames === undefined
            // A clip started over (a second shot) blends from where the first had got to, as a clip changed to does.
            const started = layer.key !== shown.key || !loop && shown.time < layer.time
            if (started) {
                player.change(clip.reanimId, registry, layer.key === undefined ? 0 : clip.blend ?? BLEND_SECONDS)
                // It goes on the part it names, of the nearest layer under it that has the part (the head on the stem,
                // the blink on the face), in that layer's space; or at its own place in the plant.
                const track = clip.attachmentTrackId, parent = track ? [...below].reverse().find(([, , drawn]) => drawn.includes(track)) : undefined
                const attached = !below.length || !!parent, [x, y] = parent ? [parent[1].node.position.x, parent[1].node.position.y] : [0, 0]
                const own = draw?.position ? parent ? { x: 0, y: 0 } : draw.position : clip
                player.node.setPosition(x + own.x, y + own.y)
                player.node.setScale(attached ? scale : 1, attached ? scale : 1, 1)
                if (track && parent) {
                    const key = `${parent[0]}/${track}`, base = this.bases.get(key) ?? this.basePose(clip, track)
                    player.attachToTrack(parent[1], track, base)
                    if (!base && player.attachmentBasePose) this.bases.set(key, player.attachmentBasePose)
                }
                if (clip.onlyTracks) player.setTracksVisible(player.trackIds.filter(id => !clip.onlyTracks!.includes(id)), false)
                else player.setTracksVisible(alone, false)
            }
            // Plant::DoBlink hides the eyes under the blink.
            if (name !== PLANT_BLINK_LAYER && !clip.onlyTracks) player.setTracksVisible(this.presentation.parts?.eyes ?? [], !blinking)
            // Seconds of the clip's own pictures to a frame of the animation's.
            const length = loop ? clip.rateScale / 12 : player.durationSeconds / shown.frames!
            const seconds = (loop ? shown.time : Math.min(shown.time, shown.frames!)) * length
            // It plays on between two times it is shown, and is set right by each.
            if (shown.hidden) { if (layer.shown) player.hide() }
            else if (started || !layer.shown) player.play({ loop, rate: shown.rate * length, timeSeconds: seconds, hideOnFinish: false })
            else player.seek(seconds)
            layer.key = shown.key
            layer.time = shown.time
            layer.shown = !shown.hidden
            below.push([name, player, clip.onlyTracks ?? player.trackIds])
        }
    }

    /** The pose a clip says its part is attached from (the first frame of the part in another of the plant's clips), when it does. */
    private basePose(clip: ClientAnimationClip, track: string): ReanimKeyframe | undefined {
        if (!clip.attachmentBase) return undefined
        const pose = ReanimPlayer.firstPose(this.clip(clip.attachmentBase).reanimId, track, this.context.content.registry)
        if (!pose) throw new Error(`${clip.reanimId} is attached from a part ${clip.attachmentBase} does not have: ${track}`)
        return pose
    }

    /** A particle the presentation has follow a shot (the Fume-shroom's cloud, partway into it). */
    fire(): void {
        if (this.presentation.viewConfig?.fireParticle) this.shotTick = null
    }

    /**
     * The plant on the board, by the server's snapshot. `flash`: the bite or production glow
     * (Plant::mEatenFlashCountdown), from the client's EntityFlashes.
     */
    sync(plant: PlantSnapshot, world: WorldSnapshot, particle: PlantParticle, upgradeTarget: boolean, flash: number): void {
        this.show(plant)
        const cue = this.presentation.viewConfig?.fireParticle as unknown as FireParticle | undefined
        if (cue && this.shotTick !== undefined) {
            this.shotTick ??= world.gameplayTick
            if (world.gameplayTick - this.shotTick >= cue.delayTicks) {
                // A plant facing left puffs from its mirrored mouth, the cloud blowing left.
                const team = plantTeam(plant)
                particle(cue.id, plant.x + plantFacingX(cue.x, team), plant.y + cue.y, undefined, team === 'zombies')
                this.shotTick = undefined
            }
        }
        const body = this.body
        if (!body.loadedId) return
        const gray = Math.min(255, flash * 3)
        // The layers over the first are on its parts, so its colors reach them all.
        body.setColorOverride(upgradeTarget ? upgradeFlashColor(world.gameplayTick) : this.tint ?? Color.WHITE)
        body.setExtraAdditiveDraw(flash > 0, new Color(gray, gray, gray, 255))
    }

    /** The color the presentation draws the plant in (the explode-o-nut's red). */
    protected get tint(): Color | undefined {
        const tint = this.presentation.visual.tint
        return tint ? new Color(...tint) : undefined
    }

    /** Nothing of its own to keep: the server's snapshot has what it shows. */
    snapshot(entityId: number): PlantViewSnapshot { return { kind: 'plant', entityId, animations: {} } }

    restore(_snapshot: PlantViewSnapshot): void | Promise<void> {}

    /** What the view made outside its node goes with it. */
    destroy?(): void
}

function upgradeFlashColor(tick: number): Color {
    const age = tick % 90
    const gray = Math.min(255, Math.trunc(200 * Math.abs(45 - age) / 45) + 55)
    return new Color(gray, gray, gray, 255)
}
