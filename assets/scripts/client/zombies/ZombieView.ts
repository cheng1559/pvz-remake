import { prepareReanims } from '@/client/reanim/ReanimAssets'
import { modResources } from '@/client/content/ModResources'
import { Color, Node, Sprite, SpriteFrame, Vec3 } from 'cc'
import type { BoardShadow } from '@/client/level/BoardShadows'
import { boardToLayer, type Content, type EntityView, type LevelStage, plantShadow, type StageEvent } from '@/client/level/LevelStage'
import { zombieDefinition } from './definitions'
import { renderOrder } from '@/shared/content/renderOrder'
import { mirrorX, ZOMBIE_WIDTH, zombieTeam } from '@/shared/content/teams'
import { risen, zombieRectAt, zombieRise } from '@/shared/content/hitRects'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { clipNamed, prepareClips, showClip } from '@/client/reanim/clips'
import { entityTint } from '@/client/view/tints'
import { uiNode } from '@/client/view/uiNode'
import type { ClientAnimationClip } from '@/client/content/ClientAnimationRegistry'
import { type GraveSnapshot, jsonRoundTrip, type JsonObject, type ZombieSnapshot, type WorldSnapshot } from '@/shared/protocol/index'
import { graveAt } from '@/shared/content/graves'
import { type LevelEntitySnapshot, parseSavedPlayback } from '@/client/level/LevelPresentationSnapshot'
import { exact } from '@/shared/validate'
import { attachmentTrack, type GraveZombiePresentation, type ZombiePresentationDefinition } from '@/shared/content/presentation'
import { type AnimationDefinition, damageIndex, type Rect, ZOMBIE_BODY_LAYER, ZOMBIE_CLIPS, type ZombieDefinition, type ZombieRise } from '@/shared/content/gameplay'
import { ASSET_FPS, passedMark } from '@/shared/content/animation'
import { zombieClip } from '@/shared/content/zombieAnimation'
import { EntityAttachments } from '@/client/view/EntityAttachments'
import { type LayerClips, layerPlayback, LayerPlayers, type LayerShown, ownFrames, shownLayer } from '@/client/view/layerPlayback'
import type { ZombieFlash } from '@/client/level/EntityFlashes'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { MIRRORED_SHIFT, riseDirt, ZOMBIE_PIVOT, zombiePartVisibility } from './zombieParts'
import { IceTrapView } from '@/client/view/IceTrapView'

/** Sprites a zombie swaps in as it takes damage, by ID: dented helms and shields, the bare arm, the enraged head. */
export type ZombieViewSprites = Readonly<Record<string, SpriteFrame>>

/** How a view draws its zombie, where that is not the board's way. */
export interface ZombieDraw {
    /** Where the body goes in its node, in place of where each of its clips has it (a cached picture draws from the Reanim's origin). */
    position?: { x: number, y: number }
    /**
     * At its Reanim's own size, not the zombie's (ZombieDefinition.scale): a cached picture is a Reanimation of its own,
     * not the zombie (ReanimatorCache::MakeCachedZombieFrame leaves out mScaleZombie), in a packet and in hand.
     */
    ownSize?: true
    /** `false`: without its shadow. */
    shadow?: boolean
}

/**
 * A zombie as a view shows it: on the board the server's snapshot of it; off it (offBoard.ts) the same of a zombie that
 * is no entity, whole and at rest, playing what whoever shows it has it play. Off the board it stands (`standing`:
 * Zombie::LoadReanim not on the board), which no zombie on it does.
 */
export type ShownZombie = Omit<ZombieSnapshot, 'entityId' | 'slot' | 'state'> & { state: ZombieSnapshot['state'] | 'standing' }

export interface ZombieViewContext {
    node: Node
    content: Content
    zombie: ShownZombie
    /** The board it is on; none off the board, where it stands as `zombie` has it from the start. */
    stage?: LevelStage
    draw?: ZombieDraw
}


/** Off the board a zombie is whole: it swaps in none of the sprites of a damaged one. */
const NO_FLASH: ZombieFlash = { flash: 0, through: false, past: false }

/**
 * A zombie, drawn by its animation (ZombieDefinition.animation): one player for its body, showing the clip its layer
 * is on at its time into it, as a plant's view shows its layers. The pictures are the presentation's clip of the same
 * name. On the board the server keeps the animation and `sync` follows its snapshots, with what else the board does to
 * a zombie; off the board whoever shows the zombie gives it what to play (ZombieViewContext.zombie), and it stands so,
 * turning with `turn`. Either way `pose` shows it. What only some zombies do is their own views' (DancerView,
 * PoleVaulterView, NewspaperView, chosen by the presentation's `view`), and a Mod's view extends it as a plant's
 * extends PlantView.
 */
export class ZombieView implements EntityView<ZombieSnapshot> {
    /**
     * Its shadow off the board, a node beside its own, under what else is there; a winner's too, as it walks on into
     * the house. None when it is drawn without (ZombieDraw.shadow), nor on the board, where its shadow is `shadow`.
     */
    shadowNode?: Node
    /** Its shadow on the board: on the ground under it, drawn with the ground and with its row's others (BoardShadows). */
    shadow?: BoardShadow
    /** Its shadow's picture. */
    private shadowFrame?: SpriteFrame
    /** Its attachment list: flags, marks and other effects that belong to it, which go on with it into the house. */
    readonly attachments = new EntityAttachments()
    /** Its animation (ZombieDefinition.animation): what its layers play, kept by the server on the board. */
    protected readonly animation: AnimationDefinition
    /** The layers' players are in it, with what goes on the body: a view moves the zombie's picture by it. */
    protected readonly root: Node
    /** Its layers: the body, one player for all its clips, which it changes between in place; over it what it carries. */
    private readonly layers: LayerPlayers
    /** The clip its body is on. */
    protected bodyClip: string | null = null
    /** What applyParts last showed, as a number of its own; none before the first and after a change of body. */
    private parts = -1
    private mowerDriver: ReanimPlayer | null = null
    /** The zombie as it was last shown. */
    protected latestZombie: ShownZombie | null = null
    /** Its hit flash (Zombie::mJustGotShotCounter) in the frame being drawn. */
    protected flash = NO_FLASH
    /** Its body is coming up out of a grave (syncRise). */
    private rising = false
    /** How far the game over has gone at its last syncGameOverWalk, in ticks: its blend goes on by what has gone since. */
    private gameOverTicks = 0
    /** Where its walk into the house had it on the board at the last syncGameOverWalk, which the server no longer moves. */
    private walkPlace?: { x: number, y: number }
    /** The zombies have won: a winner takes its walk into the house at once (bodyBlend). */
    protected won = false
    /** Where its body's clip was at the last snapshot, for the marks of its steps it has come to since. */
    private stepped?: { clip: string, time: number }
    /** The ice it stands in while frozen (Zombie::DrawIceTrap), around its layers; on the board only. */
    private ice?: IceTrapView
    /** Its shadow's picture's size, which it is scaled about the middle of (placeShadow). */
    private shadowSize = { width: 0, height: 0 }

    private readonly node: Node
    protected readonly presentation: ZombiePresentationDefinition
    /** Its type, whose clips it draws. */
    readonly typeId: string
    /** Its gameplay definition: the helm and shield for their full health. */
    private readonly gameplay: Pick<ZombieDefinition, 'helm' | 'shield'>
    /** Zombie::mScaleZombie: the size its body is drawn at (ZombieDefinition.scale). */
    protected readonly scale: number
    private readonly draw: ZombieDraw

    constructor(protected readonly context: ZombieViewContext) {
        const { content, zombie } = context, definition = content.definitions.zombies[zombie.typeId]
        this.node = context.node
        this.typeId = zombie.typeId
        this.presentation = zombieDefinition(content.presentation, zombie.typeId)
        this.gameplay = definition
        this.scale = context.draw?.ownSize ? 1 : definition.scale ?? 1
        this.animation = definition.animation
        this.draw = context.draw ?? {}
        this.root = uiNode({ name: 'Layers', parent: this.node }).node
        this.layers = new LayerPlayers(this.root, Object.keys(this.animation.layers))
        for (const layer of Object.keys(this.animation.layers)) if (layer !== ZOMBIE_BODY_LAYER) this.attachments.add(this.layers.player(layer).node)
    }

    /** The sprites it swaps in as it takes damage; none off the board, where it is shown whole. */
    protected sprites: ZombieViewSprites = {}

    /** The body layer's player: what it carries is on its parts. */
    protected get body(): ReanimPlayer { return this.layers.player(ZOMBIE_BODY_LAYER) }

    /** The body's player, once it shows a clip. */
    private get player(): ReanimPlayer | null {
        const player = this.body
        return player.loadedId ? player : null
    }

    /** Every zombie's swapped sprites and dropped parts, ready before play: once, for its views of every kind. */
    static async preload(content: Content): Promise<void> {
        if (this !== ZombieView) return
        const ids = new Set(Object.values(content.presentation.zombies).flatMap(zombie => [...swapSprites(zombie),
            ...Object.values(zombie.drops).flatMap(drop => drop?.image ? [drop.image] : [])]))
        await Promise.all([...ids].map(id => modResources.sprite(id)))
    }

    async initialize(): Promise<void> {
        const { content, stage, zombie } = this.context
        // Zombie::DrawShadow under it, unless it is drawn without.
        const shadow = this.draw.shadow === false ? undefined : await plantShadow(content, stage)
        if (stage) {
            this.sprites = Object.fromEntries(await Promise.all(swapSprites(this.presentation).map(async id => [id, await modResources.sprite(id)] as const)))
            const look = content.presentation.iceTrap
            this.ice = await IceTrapView.create(this.root, this.root.children[0], look, this.presentation.iceTrap ?? look.zombie)
        }
        if (shadow) this.shadowSize = { width: shadow.originalSize.width, height: shadow.originalSize.height }
        this.shadowFrame = shadow
        if (shadow && stage) {
            // On the board it is one of the board's shadows; a zombie of another size has its shadow so (placeShadow).
            this.shadow = stage.shadows.add(shadow)
            this.shadow.scale = this.presentation.shadow.scale ?? 1
        } else if (shadow) {
            // Off the board its shadow goes beside its node, under what else is there.
            this.shadowNode = this.shadowBeside(shadow, this.node.parent!)
            this.shadowNode.setSiblingIndex(0)
        }
        await prepareReanims(this.playable())
        if (!stage) this.stand(zombie)
    }

    /**
     * The zombie on the board for a frame, by the server's snapshot: where it stands, facing its side's way, rising from
     * a grave, its shadow, and what the board does to any zombie (its hit flash, a chilled one blue, a burned one black,
     * a mowed one on the mower's driver). `onBoard` shows the zombie itself.
     */
    sync(zombie: ZombieSnapshot, world: WorldSnapshot): void {
        this.won = world.result === 'lost'
        // A zombie that stands where it stood (eating, frozen) is left there: placing it anew has the engine work its
        // world position and its children's out again.
        const at = boardToLayer(zombie.x, zombie.y), position = this.node.position
        if (position.x !== at.x || position.y !== at.y) this.node.setPosition(at.x, at.y)
        this.latestZombie = zombie
        this.flash = this.context.stage?.flashes.zombie(zombie.entityId, world.gameplayTick) ?? NO_FLASH
        this.syncFacing(zombie)
        // Its ice turns with it, across its width as what falls off it does.
        this.ice?.sync(!!zombie.frozen, this.mirrored ? ZOMBIE_WIDTH : undefined)
        // Zombie::PlayDeathAnim removes the surprise mark (AttachmentReanimTypeDie).
        if (zombie.state === 'dying' || zombie.state === 'mowered') {
            for (const armor of [this.presentation.helm, this.presentation.shield]) {
                if (armor?.clips) this.attachments.remove(armor.clips.drop.reanimId)
            }
        }
        if (zombie.alpha !== this.shownAlpha) uiNode({ node: this.node, opacity: this.shownAlpha = zombie.alpha })
        this.placeShadow()
        // Zombie::HasShadow hides it while falling, vaulting or coming up. A mowed one keeps it where it stood as its
        // body is drawn into the mower. A burned one (headless, standing black) has none, as charred remains have
        // none; the original's HasShadow keeps it.
        const shadowed = zombie.state !== 'dying' && zombie.state !== 'burned' &&
            zombie.state !== 'airborne' && !zombie.riseTicks
        if (this.shadow) {
            this.shadow.row = zombie.row
            this.shadow.visible = shadowed
        } else if (this.shadowNode) this.shadowNode.active = shadowed
        this.applyHitFlash(zombie)
        this.applyColor(zombie)
        if (zombie.state === 'mowered') {
            this.syncMowered(zombie)
            return
        }
        this.step(zombie)
        this.onBoard(zombie, world)
    }

    /**
     * Zombie::UpdateZombieWalking: as its body's walk comes to each of its `steps` marks between two snapshots, the
     * effect under its feet (ZombiePresentationDefinition.steps), mirrored with a zombie walking right.
     */
    private step(zombie: ZombieSnapshot): void {
        const steps = this.presentation.steps
        if (!steps) return
        const body = zombie.animations[ZOMBIE_BODY_LAYER], last = this.stepped
        this.stepped = body && { clip: body.clip, time: body.time }
        const clip = body && this.animation.clips[body.clip], stage = this.context.stage
        // Zombie::UpdateZombieWalking, which a zombie rising from a grave does not run yet.
        if (!stage || !clip?.ground || zombie.state !== 'walking' || zombie.riseTicks || last?.clip !== body.clip) return
        const mirrored = zombie.team === 'plants'
        for (const mark of steps.marks) {
            if (!passedMark(clip, last.time, body.time, mark.at)) continue
            stage.particle(steps.effect, zombie.x + mirrorX(mark.x, ZOMBIE_WIDTH, mirrored), zombie.y + mark.y,
                stage.zombieOrder(zombie.row, zombie.typeId) - 1, undefined, mirrored)
        }
    }

    /** The zombie itself on the board, by the server's snapshot: its layers and what it has on. A view adds what its zombie does here. */
    protected onBoard(zombie: ZombieSnapshot, _world: WorldSnapshot): void {
        this.pose(zombie)
    }

    /**
     * A field of what only its kind shows (ZombieSnapshot.own, its server class's snapshotOwn), read by `read` (a check of
     * shared/validate); none where its kind shows none, or off the board.
     */
    protected own<T>(zombie: ShownZombie, field: string, read: (value: unknown, name: string) => T): T | undefined {
        const value = zombie.own?.[field]
        return value === undefined ? undefined : read(value, `${zombie.typeId}.own.${field}`)
    }

    /**
     * A particle effect of the zombie's in board coordinates, at `order` (`renderOrder`), over everything on the board
     * (RENDER_LAYER_TOP) without one. `mirrored`: the effect turned round, for a zombie facing right.
     */
    protected particle(effect: string, x: number, y: number, order = renderOrder('top'), tint?: Color, mirrored?: boolean): void {
        this.context.stage?.particle(effect, x, y, order, tint, mirrored)
    }

    /**
     * Off the board (the almanac, a packet's picture, the street before a level), it turns to face right, as one on the
     * plants' side does (`mirrored`), or left again (Zombie::IsWalkingBackwards).
     */
    turn(mirrored: boolean): void {
        if (this.context.stage) throw new Error(`A zombie on the board faces its side's way: ${this.typeId}`)
        const zombie = { ...this.latestZombie ?? this.context.zombie }
        if (mirrored) zombie.team = 'plants'
        else delete zombie.team
        this.stand(zombie)
    }

    /** The zombie off the board: whole, on what its body is given to play. */
    private stand(zombie: ShownZombie): void {
        this.latestZombie = zombie
        this.syncFacing(zombie)
        this.placeShadow()
        if (this.shadowNode) this.shadowNode.active = true
        // The board draws a shield in its own colors, apart from the body's (applyHitFlash); a picture's shield takes the
        // picture's color with the rest, as a packet's gray.
        this.pose(zombie, false)
    }

    /**
     * What a layer of the zombie shows of what it plays (shownLayer). A zombie drawn without the super long death falls
     * with its plain one, at that one's length. A Mod shows another clip in its place here, loaded by `playable`.
     */
    protected shown(layer: string, zombie: ShownZombie): LayerShown | undefined {
        const state = zombie.animations[layer]
        return state && shownLayer(state, zombie.animations, this.layerClips)
    }

    /** The zombie's clips, for what a layer shows (shownLayer): made once, as it is asked for every layer every frame. */
    /** The layers the board last posed it on (pose): a snapshot's, new each tick. */
    private posedAnimations: ShownZombie['animations'] | undefined
    /** The zombie being posed, and what its layers ask of it as they are shown (pose). */
    private posing!: ShownZombie
    private asked?: { shown: Parameters<LayerPlayers['show']>[0], options: Parameters<LayerPlayers['show']>[1] }

    private readonly layerClips: LayerClips = {
        picture: name => this.clip(name),
        played: name => zombieClip(this.animation, name === ZOMBIE_CLIPS.superLongDeath && !this.clips()[ZOMBIE_CLIPS.superLongDeath] ? ZOMBIE_CLIPS.death : name),
        frames: reanimId => ReanimPlayer.frames(reanimId) ?? 0,
    }

    /** How a player shows what the zombie's body plays (the mower's driver takes the body's place). */
    private playback(zombie: ShownZombie, player: ReanimPlayer): ReturnType<typeof layerPlayback> {
        return layerPlayback(this.shown(ZOMBIE_BODY_LAYER, zombie)!, player)
    }

    private placeShadow(): void {
        const board = this.shadow, node = this.shadowNode
        if (!board && !node) return
        const { x, y, backwardsX, scale = 1 } = this.presentation.shadow, { width, height } = this.shadowSize
        // Zombie::DrawShadow's place differs for a zombie walking right; one of a zombie of another size is so about its middle.
        const shadowX = this.node.position.x + (this.mirrored ? backwardsX ?? x : x) + width * (1 - scale) / 2
        const shadowY = this.node.position.y + y - height * (1 - scale) / 2
        if (board) {
            board.x = shadowX
            board.y = shadowY
        } else if (node!.position.x !== shadowX || node!.position.y !== shadowY) node!.setPosition(shadowX, shadowY)
    }

    /** A shadow that is a node of its own under `parent`, hidden until it is placed: off the board, and a winner's. */
    private shadowBeside(frame: SpriteFrame, parent: Node): Node {
        const node = uiNode({
            name: 'ZombieShadow', parent, anchor: { x: 0, y: 1 }, active: false,
            sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        const scale = this.presentation.shadow.scale
        if (scale !== undefined) node.setScale(scale, scale, 1)
        return node
    }

    get players(): ReanimPlayer[] { return this.layers.shown.filter(player => player.node.isValid) }

    private syncRise(zombie: ShownZombie): void {
        // Only a rise owns this offset; a pending landing keeps its jump-origin compensation.
        const player = this.player
        if (!player || !zombie.riseTicks && !this.rising) return
        const at = this.clip(body(zombie).clip)
        this.rising = !!zombie.riseTicks
        if (!zombie.riseTicks) {
            player.setClip(null)
            this.place(player.node, at.x, at.y)
            return
        }
        const { clip } = this.rise(zombie), { sunk, hidden } = risen(this.riseOf(zombie), zombie.riseTicks)
        this.place(player.node, at.x, at.y - sunk)
        const top = sunk + clip.y, bottom = sunk + clip.bottom - hidden, { x, y } = player.node.position
        // DrawReanim clips in board pixels. The mask is local to the scaled, possibly mirrored body.
        player.setClip({
            x: (this.turned ? x - clip.x - clip.width : clip.x - x) / this.scale,
            y: (top + y) / this.scale,
            width: clip.width / this.scale,
            height: Math.max(0, bottom - top) / this.scale,
        })
    }

    /** How it is drawn coming up while it rises (`riseTicks`): out of a grave, unless its view has it come up otherwise. */
    protected rise(_zombie: ShownZombie): GraveZombiePresentation {
        return this.context.content.presentation.graves.zombie
    }

    /** While it rises, whether it was called up into a troupe rather than out of a grave (Zombie.calledUp). */
    protected calledUp(_zombie: ShownZombie): boolean {
        return false
    }

    /** How it comes up while it rises (zombieRise), on the board it is on. */
    private riseOf(zombie: ShownZombie): ZombieRise {
        const { content, stage } = this.context
        return zombieRise(content.definitions.zombies[zombie.typeId], content.definitions.boards[stage!.level.board], this.calledUp(zombie))
    }

    /**
     * Its body and attack rects, the ones the server goes by (zombieRectAt: Zombie::GetZombieRect, GetZombieAttackRect),
     * on the board where `zombie` has it stand as the frame draws it, not in the server's whole pixels, or where its walk
     * into the house has it: what `/hitboxes` outlines.
     */
    hitRects(zombie: ZombieSnapshot): { body: Rect, attack: Rect } {
        const definition = this.context.content.definitions.zombies[zombie.typeId], team = zombieTeam(zombie)
        const rising = zombie.riseTicks ? { rise: this.riseOf(zombie), ticks: zombie.riseTicks } : undefined
        const { x, y } = this.walkPlace ?? zombie
        return {
            body: zombieRectAt(definition.body, team, x, y, rising),
            attack: zombieRectAt(this.attackRect(zombie), team, x, y, rising),
        }
    }

    /** Zombie::GetZombieAttackRect's rect (Zombie.attackRect): its `attack`, unless its view has its kind's. */
    protected attackRect(zombie: ZombieSnapshot): Rect {
        return this.context.content.definitions.zombies[zombie.typeId].attack
    }

    /**
     * Where something falls off from on the board's layer: its track's place as the body is drawn, or `offset` from
     * the zombie's top left (turned round with one facing right) when the body draws no such track.
     */
    private dropPosition(layer: Node, trackId: string, offset: readonly [number, number]): { x: number, y: number } {
        const track = this.getTrackWorldPosition(trackId)
        if (track) return uiNode({ node: layer }).transform.convertToNodeSpaceAR(track)
        const at = layer.inverseTransformPoint(new Vec3(), this.node.worldPosition)
        return { x: at.x + mirrorX(offset[0], ZOMBIE_WIDTH, this.mirrored), y: at.y + offset[1] }
    }

    /** Zombie::DropHelm or DropShield: plays the armor's drop clip on the zombie. */
    armorDropped(slot: 'helm' | 'shield'): void {
        const drop = this.presentation[slot]?.clips?.drop
        if (!drop) return
        // Zombie::AddAttachedReanim: follows the zombie and plays the whole clip once.
        const node = uiNode({ name: 'HelmDrop', parent: this.root }).node
        this.attachments.add(node, drop.reanimId)
        const player = node.addComponent(ReanimPlayer)
        const dispose = () => { if (node.isValid) node.destroy() }
        void prepareClips([drop]).then(() => {
            if (node.isValid) showClip(player, drop, { onFinish: dispose })
        }).catch(error => {
            dispose()
            if (this.node.isValid) console.error('[Level] Failed to load helm drop animation', error)
        })
    }

    getTrackWorldPosition(trackId: string): Vec3 | null {
        // The part is on the body, or on what it carries (the flag's own track).
        return [...this.layers.shown].reverse().find(player => player.trackIds.includes(trackId))?.getTrackWorldPosition(trackId) ?? null
    }

    /**
     * The winner of a lost level (LevelGameOverPresenter), shown in `parent` with its shadow, walks on into the house:
     * `ticks` into the walk after an approach of `approachTicks`, at `y`.
     */
    syncGameOverWalk(zombie: ZombieSnapshot, parent: Node, ticks: number, y: number, approachTicks = 0): void {
        if (this.node.parent !== parent) this.node.setParent(parent)
        this.node.active = true
        // It leaves the board's layer, and its shadow the board's shadows with it, for a node of its own beside it.
        if (this.shadow && this.shadowFrame) {
            this.shadow.remove()
            this.shadow = undefined
            this.shadowNode = this.shadowBeside(this.shadowFrame, parent)
        }
        const shadow = this.shadowNode
        if (shadow) {
            if (shadow.parent !== parent) shadow.setParent(parent)
            shadow.active = true
        }
        const player = this.player
        if (!player) return
        // The walk goes on from where the server left it, by the server's rule (walkZombie): the clip comes round by
        // its length while its frames, and the ground under them, are spread over its length less one; at its size.
        const { fps, timeSeconds } = this.playback(zombie, player), rate = fps / player.fps, cycle = player.durationSeconds, last = player.lastFrameTimeSeconds
        const start = timeSeconds + approachTicks / 100 * rate, time = start + ticks / 100 * rate
        const ground = this.presentation.parts.ground
        const groundAt = (seconds: number) => player.sampleTrack(ground, seconds % cycle / cycle * last)?.x ?? 0
        const distance = ((Math.floor(time / cycle) - Math.floor(start / cycle)) * (groundAt(cycle - 1e-9) - groundAt(0)) + groundAt(time) - groundAt(start)) * cycle / last
        this.walkPlace = { x: zombie.x - distance * this.scale, y }
        this.node.setPosition(this.walkPlace.x - 400, 300 - y)
        this.placeShadow()
        // Its player stands still with the lawn, so a blend it was in as the zombies won (one that had just stopped
        // eating) goes on by the game over's own ticks.
        const gone = approachTicks + ticks
        player.advanceBlend(Math.max(0, gone - this.gameOverTicks) / 100)
        this.gameOverTicks = gone
        player.seek(time % cycle)
    }

    destroy(): void {
        this.shadow?.remove()
        if (this.shadowNode?.isValid) this.shadowNode.destroy()
    }

    snapshot(entityId: number): LevelEntitySnapshot {
        return { kind: 'zombie', entityId, data: this.playbackSnapshot() }
    }

    restore(saved: LevelEntitySnapshot): Promise<void> {
        return this.restorePlayback(saved.data, `${saved.kind} ${saved.entityId} view data`)
    }

    /**
     * Where its body and the mower's driver are in their blends: what it keeps across a save, on the board (snapshot)
     * or off it (a street's zombie).
     */
    playbackSnapshot(): JsonObject {
        return jsonRoundTrip({ body: this.player?.snapshot() ?? null, mowerDriver: this.mowerDriver?.snapshot() ?? null }) as unknown as JsonObject
    }

    /** Its body and the mower's driver back where they were in their blends (playbackSnapshot); `name` is the data's, for its errors. */
    async restorePlayback(value: JsonObject, name: string): Promise<void> {
        const data = exact(value, ['body', 'mowerDriver'], name)
        const snapshot = { body: parseSavedPlayback(data.body), mowerDriver: parseSavedPlayback(data.mowerDriver) }
        // What it carries is shown again from the server's snapshot; the body keeps where it was in its blend.
        if (snapshot.body) await this.restorePlayer(this.layers.player(ZOMBIE_BODY_LAYER), 'ZombieAnimation', snapshot.body)
        this.mowerDriver = await this.restorePlayer(this.mowerDriver, 'MoweredDriver', snapshot.mowerDriver)
        if (snapshot.body?.attachmentTrackId && this.player && this.mowerDriver) {
            this.player.reattachAfterRestore(this.mowerDriver)
        }
        this.bodyClip = snapshot.mowerDriver
            ? ZOMBIE_CLIPS.mowered
            : snapshot.body
                ? Object.entries(this.clips()).find(([, clip]) => clip?.reanimId === snapshot.body!.id)?.[0] ?? null
                : null
        // What it has on goes back on the clip it came back to: off the board (a street's zombie) nothing shows it again.
        this.parts = -1
        this.posedAnimations = undefined
        if (this.latestZombie) this.applyParts(this.latestZombie)
    }

    private async restorePlayer(
        current: ReanimPlayer | null,
        name: string,
        snapshot: ReturnType<typeof parseSavedPlayback>,
    ): Promise<ReanimPlayer | null> {
        if (!snapshot) {
            if (current?.node.isValid) current.node.destroy()
            return null
        }
        await prepareReanims([snapshot.id])
        const player = current?.node.isValid ? current
            : uiNode({ name, parent: this.root, anchor: { x: 0, y: 1 } }).node.addComponent(ReanimPlayer)
        if (player.loadedId !== snapshot.id) {
            player.change(snapshot.id)
            const clip = this.clipFromReanim(snapshot.id)
            if (clip) this.place(player.node, clip.x, clip.y)
        }
        player.restore(snapshot)
        return player
    }

    private syncMowered(zombie: ZombieSnapshot): void {
        // Mowed before its body showed (put down on a running mower), or showing what its walk stands in for: its walk
        // for the driver to take.
        if (!this.player || this.mowedOnWalk(zombie)) {
            this.pose({ ...zombie, animations: { [ZOMBIE_BODY_LAYER]: { clip: ZOMBIE_CLIPS.walk, time: 0, rate: ASSET_FPS } } })
        }
        this.applyParts(zombie)
        // What it let go as it was mowed (Zombie::MowDown's DropFlag) is drawn no more; the body is posed no more.
        for (const layer of Object.keys(this.animation.layers)) if (layer !== ZOMBIE_BODY_LAYER && !zombie.animations[layer]) this.layers.hide(layer)
        this.player?.pause()
        const animation = this.clip(ZOMBIE_CLIPS.mowered)
        if (this.mowerDriver) {
            this.mowerDriver.seek(this.playback(zombie, this.mowerDriver).timeSeconds)
            if (this.player) this.player.seek(this.player.snapshot().timeSeconds)
            return
        }
        if (!this.player) return
        const driver = this.mowerDriver = uiNode({ name: 'MoweredDriver', parent: this.root }).node.addComponent(ReanimPlayer)
        showClip(driver, animation, {
            place: (player, clip) => this.place(player.node, clip.x ?? 0, clip.y ?? 0),
            playback: player => this.playback(zombie, player),
        })
        this.bodyClip = ZOMBIE_CLIPS.mowered
        this.player.attachToTrack(driver, attachmentTrack(animation))
        driver.pause()
    }

    /**
     * Mowed showing a clip its walk stands in for, with no walking snapshot between (a pole vaulter as it lands), so the
     * driver takes its walk.
     */
    protected mowedOnWalk(_zombie: ZombieSnapshot): boolean {
        return false
    }

    /**
     * How long its body blends into a clip it comes to from the one it is on (`bodyClip`): 0.2 s, or none for one
     * mowed, whose driver takes its body at once, nor for a winner taking its walk into the house (Zombie::WalkIntoHouse's
     * StartWalkAnim(0)). A view whose zombie changes clips at once has it so here.
     */
    protected bodyBlend(zombie: ShownZombie): number {
        return zombie.state === 'mowered' || this.won ? 0 : 0.2
    }

    /**
     * Shows the zombie's animation, each layer at its time. A body that comes to another clip changes to it where it is,
     * blending from the pose it had, so that what is on the zombie (a splat, a dropped helm) stays over it; what it
     * carries goes on the part of the body its clip names (a flag in its hand, drawn between the hand and the arm on the pole).
     * `board`: with what the board colors a zombie by; off it, whoever shows the picture colors it whole. This is all
     * there is to a zombie off the board.
     */
    protected pose(zombie: ShownZombie, board = true): void {
        // On the board, a frame of the tick the last one showed has the same layers and parts: they play on from there
        // until the next tick sets them right (LayerPlayers.show).
        if (board && zombie.animations === this.posedAnimations) return
        this.posedAnimations = board ? zombie.animations : undefined
        const changed = this.bodyClip !== body(zombie).clip
        // Every zombie is posed every tick: what its layers ask as they are shown is made once, of the zombie being posed.
        this.posing = zombie
        const asked = this.asked ??= {
            shown: layer => this.shown(layer, this.posing),
            options: {
                blend: (layer, clip, first) => first ? 0 : clip.blend ?? (layer === ZOMBIE_BODY_LAYER ? this.bodyBlend(this.posing) : 0),
                place: (layer, player, clip) => {
                    const at = layer === ZOMBIE_BODY_LAYER ? this.draw.position ?? clip : clip
                    if (player.node.parent === this.root) this.place(player.node, at.x ?? 0, at.y ?? 0)
                },
            },
        }
        asked.options.holdsStill = board
        this.layers.show(asked.shown, asked.options)
        if (changed) {
            this.bodyClip = body(zombie).clip
            this.parts = -1
        }
        this.applyParts(zombie)
        if (board && changed) {
            // A body changed to another Reanim has its tracks anew, without the shield's override.
            this.applyHitFlash(zombie, true)
            this.applyColor(zombie, true)
        }
        this.syncRise(zombie)
    }

    private applyParts(zombie: ShownZombie): void {
        const helmStage = armorStage(zombie.helmHealth, this.gameplay.helm), shieldStage = armorStage(zombie.shieldHealth, this.gameplay.shield)
        // Zombie::ShowDoorArms: an eating zombie lowers the shield arms; a dropped shield takes them away for good.
        const holdingShield = shieldStage >= 0 && zombie.state !== 'eating', own = this.ownParts(zombie)
        // Asked every frame: a number, where a string would be made anew each time. An armor's stage is -1 to 2.
        let signature = (zombie.hasHead ? 1 : 0) + (zombie.hasTongue ? 2 : 0) + (zombie.hasArm ? 4 : 0) + (holdingShield ? 8 : 0) +
            (helmStage + 1) * 16 + (shieldStage + 1) * 64
        for (const [, visible] of own) signature = signature * 2 + (visible ? 1 : 0)
        signature = signature * 32 + own.length
        if (!this.player || signature === this.parts) return
        this.parts = signature
        const presentation = this.presentation, parts = presentation.parts
        const state = { hasHead: zombie.hasHead, hasTongue: zombie.hasTongue, hasArm: zombie.hasArm, helmStage, shieldStage, holdingShield }
        // Its kind's own parts first: any zombie's that share a track with them have the last word.
        for (const [tracks, visible] of [...own, ...zombiePartVisibility(presentation, state)]) this.player.setTracksVisible(tracks, visible)
        this.player.setTrackSpriteOverride(parts.upperArm, zombie.hasArm ? null
            : this.sprites[presentation.damagedArmSprite])
        // Zombie::TakeHelmDamage and TakeShieldDamage swap in the dented sprite below 2/3 and 1/3 health.
        for (const [armor, stage] of [[presentation.helm, helmStage], [presentation.shield, shieldStage]] as const) {
            if (!armor || stage < 0 || !parts.helms.includes(armor.track)) continue
            this.player.setTrackSpriteOverride(armor.track, stage === 0 ? null : this.sprites[armor.damagedSprites[stage - 1]])
        }
        this.putOnParts(zombie, this.player)
    }

    /** The tracks only its kind shows or hides, shown or not: the flag zombie's arms, as it carries its flag or not. */
    protected ownParts(_zombie: ShownZombie): Array<[readonly string[], boolean]> {
        return []
    }

    /** What its view puts on its body beyond any zombie's parts, each time they change (applyParts). */
    protected putOnParts(_zombie: ShownZombie, _player: ReanimPlayer): void {}

    private color: 'normal' | 'chilled' | 'mindControlled' | 'mindControlledChilled' | 'burned' = 'normal'
    /** The opacity the board last gave it (sync). */
    private shownAlpha?: number
    /** What applyHitFlash last drew, and on which body. */
    private flashDrawn?: number
    private flashPlayer?: ReanimPlayer
    /** Zombie::IsWalkingBackwards: a zombie on the plants' side faces right. */
    private mirrored = false
    /** Its body is drawn turned round (syncFacing, turnedRound). */
    protected turned = false

    /**
     * Zombie::UpdateReanim: a zombie drawn turned round has its body mirrored (`m00 = -scale`) and further right
     * (turnedShift), at its size about ZOMBIE_PIVOT. Every body animation node is placed through here.
     */
    private place(node: Node, x: number, y: number): void {
        const scale = this.scale
        node.setPosition(x + (this.turned ? this.turnedShift : 0) + ZOMBIE_PIVOT.x * (1 - scale), y - ZOMBIE_PIVOT.y * (1 - scale))
        node.setScale(this.turned ? -scale : scale, scale, 1)
    }

    /** How much further right its body is drawn turned round: MIRRORED_SHIFT and its own offset (turnedOffsetX), at its size. */
    protected get turnedShift(): number {
        return (MIRRORED_SHIFT + (this.presentation.turnedOffsetX ?? 0)) * this.scale
    }

    /** Zombie::UpdateReanim's anOpposite: its body is drawn turned round, facing right on the plants' side. */
    protected turnedRound(zombie: ShownZombie): boolean {
        return zombie.team === 'plants'
    }

    /** A zombie that changes sides turns its body nodes around, as a dancer does to moonwalk in (turnedRound). */
    private syncFacing(zombie: ShownZombie): void {
        this.mirrored = zombie.team === 'plants'
        const turned = this.turnedRound(zombie)
        if (turned === this.turned) return
        const scale = this.scale, moved = turned ? this.turnedShift : -this.turnedShift
        this.turned = turned
        for (const node of [this.player?.node, this.root.getChildByName('MoweredDriver')]) {
            if (!node?.isValid) continue
            node.setPosition(node.position.x + moved, node.position.y)
            node.setScale(turned ? -scale : scale, scale, 1)
        }
    }

    /**
     * Zombie::DrawReanim draws a burned zombie black; otherwise a mind-controlled one purple, a chilled or frozen one
     * blue, and one both between the two (ReanimPlayer.setTint, entityTint).
     */
    private applyColor(zombie: ShownZombie, force = false): void {
        const cold = isCold(zombie)
        const color = zombie.state === 'burned' ? 'burned' : zombie.mindControlled ? cold ? 'mindControlledChilled' : 'mindControlled' : cold ? 'chilled' : 'normal'
        if (!this.player || color === this.color && !force) return
        this.color = color
        // What it carries is attached to the body's tracks, so it takes the body's colors.
        this.player.setColorOverride(color === 'burned' ? Color.BLACK : Color.WHITE)
        this.player.setTint(color === 'burned' ? undefined : entityTint(!!zombie.mindControlled, cold))
    }

    /**
     * Zombie::DrawReanim's hit highlight (mJustGotShotCounter), over its chill; the shield's own (mShieldJustGotShotCounter).
     * `force`: set it although it has not changed.
     */
    private applyHitFlash(zombie: ShownZombie, force = false): void {
        const shield = zombie.shieldHealth > 0 ? this.presentation.shield : undefined
        // TakeShieldDamage flashes only the shield, unless the hit also reached the body (the Fume-shroom); one that
        // came past the shield (a lobbed projectile) flashes only the body.
        const { through, past } = this.flash
        const bodyFlash = shield && !through && !past ? 0 : this.flash.flash
        const flash = past ? 0 : this.flash.flash
        // Most frames change nothing of it: the same flash on the same player is not set again.
        const drawn = ((bodyFlash * 1024 + flash) * 8) + (through ? 4 : 0) + (shield ? 2 : 0) + (zombie.state === 'burned' ? 1 : 0)
        if (!force && drawn === this.flashDrawn && this.player === this.flashPlayer) return
        this.flashDrawn = drawn
        this.flashPlayer = this.player
        const grayness = Math.min(255, bodyFlash * 10)
        this.player?.setExtraAdditiveDraw(bodyFlash > 0, new Color(grayness, grayness, grayness, 255))
        if (shield && this.player) {
            const burned = zombie.state === 'burned'
            const gray = Math.min(255, flash * 10)
            this.player.setTrackRenderOverride(shield.track, {
                color: burned ? Color.BLACK : flash > 0 ? new Color(gray, gray, gray) : Color.WHITE,
                extraAdditive: !burned && flash > 0,
                extraAdditiveColor: Color.WHITE,
                // Shield flash lasts 25 ticks; recoil lasts the first 12 and starts 3px to the right.
                offsetX: through ? 0 : Math.max(0, flash - 13) / 4,
            })
        }
    }

    /** The presentation's clip of a name, which a view may have its zombie show another in place of. */
    protected clip(name: string): ClientAnimationClip {
        const clips = this.clips(), { death, superLongDeath } = ZOMBIE_CLIPS
        // A zombie drawn without `superLongDeath` falls with its `death`.
        const clip = clips[name] ?? (name === superLongDeath ? clips[death] : undefined)
        if (!clip) throw new Error(`${this.typeId} has no ${name} animation`)
        return clip
    }

    private clips(): Record<string, ClientAnimationClip | undefined> {
        return this.context.content.animations.resolve(this.typeId)
    }

    /** The Reanim its clips show, loaded before the first, so its body changes to one at once; a Mod that shows others adds those. */
    protected playable(): string[] {
        return Object.values(this.clips()).flatMap(clip => typeof clip?.reanimId === 'string' ? [clip.reanimId] : [])
    }

    /** How long one of its Reanim is, in the frames of its own pace (12 a second): what a Mod times a clip of its own by. */
    protected ownFrames(reanimId: string): number {
        return ownFrames(reanimId)
    }

    private clipFromReanim(reanimId: string): ClientAnimationClip | undefined {
        return Object.values(this.clips()).find(value => value?.reanimId === reanimId)
    }

    /**
     * Zombie::AnimateChewSound and AnimateChewEffect: wall-nuts crumble softly, on the row's projectile layer. A zombie
     * chewing another (Zombie::EatZombie) chews as on any plant, softly if it is mind-controlled.
     */
    static readonly chewed: StageEvent = (stage, event, world) => {
        const plant = world.plants.find(candidate => candidate.entityId === event.data.plantId)
        const zombie = world.zombies.find(candidate => candidate.entityId === event.data.zombieId)
        const presentation = plant ? stage.content.presentation.plants[plant.typeId] : undefined
        const nut = presentation?.chewParticle !== undefined
        void SoundSystem.play(nut || !plant && zombie?.mindControlled ? SoundEffect.ChompSoft : SoundEffect.Chomp, { foley: true })
        if (!nut || !zombie) return
        const tint = presentation!.visual.tint
        // At (37, 40) from the zombie. A zombie facing right mirrors it across its width, and its debris flies the other way.
        const mirrored = zombie.team === 'plants'
        stage.particle(presentation!.chewParticle!, zombie.x + mirrorX(37, ZOMBIE_WIDTH, mirrored), zombie.y + 40,
            renderOrder('projectile', zombie.row), tint ? new Color(...tint) : undefined, mirrored)
    }

    /**
     * Zombie::RiseFromGrave: PARTICLE_ZOMBIE_RISE on the row's particle layer (riseDirt), through the dirt of the grave in
     * the event's cell, with the grave's rumble.
     */
    static readonly rose: StageEvent = (stage, event, world) => {
        void SoundSystem.playSounds(stage.graveRise.sounds)
        const zombie = world.zombies.find(candidate => candidate.entityId === event.data.entityId)
        if (!zombie) return
        const grave = graveAt(world.gridItems, zombie.row, Number(event.data.column)) as GraveSnapshot | undefined
        const dirt = riseDirt(zombie, stage.content.presentation.zombies[zombie.typeId].shadow, grave?.offsetX ?? 0)
        stage.particle(stage.graveRise.particle, dirt.x, dirt.y, renderOrder('particle', zombie.row), undefined, dirt.mirrored)
    }

    /** Zombie::EatPlant and EatZombie gulp the last bite. */
    static readonly ate: StageEvent = () => { void SoundSystem.play(SoundEffect.Gulp) }

    /** Zombie::ApplyChill plays FOLEY_FROZEN on the first chill. */
    static readonly chilled: StageEvent = () => { void SoundSystem.play(SoundEffect.Frozen, { foley: true }) }

    /** Zombie::UpdateZombieGroan. */
    static readonly groaned: StageEvent = () => { void SoundSystem.play(SoundEffect.Groan, { foley: true }) }

    /** Zombie::PlayDeathAnim: it falls. */
    static readonly fell: StageEvent = () => { void SoundSystem.play(SoundEffect.ZombieFalling1, { foley: true, pitchRange: 10 }) }

    /** Zombie::MowDown: squashed by a mower (FOLEY_SPLAT). */
    static readonly mowered: StageEvent = () => { void SoundSystem.play(SoundEffect.Splat, { foley: true }) }

    /** Zombie::DropHelm and DropShield: the armor falls as its effect, with its sound and reanim unless bypassed. */
    static readonly armorDropped: StageEvent = (stage, event, world) => {
        const entityId = event.data.entityId, slot = event.type === 'zombieHelmDropped' ? 'helm' : 'shield'
        if (typeof entityId !== 'number' || event.data.silent === true) return
        // Zombie::DropHelm takes the track where it is this tick, as the parts do: heard once the frame is drawn, the
        // view has the zombie there (one rising from a grave is higher now), or as it last was if it is gone.
        const view = stage.view(entityId, ZombieView), zombie = view?.latestZombie
        const armor = view && zombie && stage.content.presentation.zombies[view.typeId]?.[slot]
        if (!armor) return
        if (event.data.bypassed !== true) {
            view.armorDropped(slot)
            void SoundSystem.playSounds(armor.dropSounds)
        }
        const at = view.dropPosition(stage.layer, armor.track, armor.offset)
        // One above the zombie; one facing right sheds its armor the way it faces.
        stage.spawnParticle(stage.zombieOrder(zombie.row, zombie.typeId) + 1, { id: armor.effect, mirrored: zombie.team === 'plants', ...at })
    }

    /** Zombie::DropHead, DropArm and DropFlag: the part flies off from where it is on the body, with its sounds. */
    static readonly partDropped: StageEvent = (stage, event, world) => {
        const { entityId, typeId, part } = event.data
        if (typeof entityId !== 'number' || typeof typeId !== 'string' || (part !== 'head' && part !== 'arm' && part !== 'flag')) return
        // As the helm: by the view, which has the zombie as it last was once it is gone (a mowed one).
        const view = stage.view(entityId, ZombieView), zombie = view?.latestZombie
        const drop = zombie && stage.content.presentation.zombies[typeId]?.drops[part]
        if (!view || !zombie || !drop) return
        // A zombie facing right: its part flies off the way it faces, as its body is drawn. (The original keeps the
        // part's flight for a mind-controlled zombie.)
        const mirrored = zombie.team === 'plants', tint = entityTint(!!zombie.mindControlled, isCold(zombie))
        // One above the zombie, or one under it (the dancer's head).
        stage.spawnParticle(stage.zombieOrder(zombie.row, typeId) + (drop.behind ? -1 : 1), {
            id: event.data.mowered === true ? drop.moweredEffect ?? drop.effect : drop.effect,
            ...view.dropPosition(stage.layer, drop.track, drop.offset),
            // The pole vaulter's own head and a bare hand are swapped in.
            spriteOverride: drop.image,
            // Zombie::OverrideParticleColor keeps a mind-controlled zombie's parts purple, a chilled one's blue.
            tint: tint && new Color(tint.r, tint.g, tint.b, 255),
            extraAdditive: !!tint,
            // Zombie::OverrideParticleScale: at the zombie's size, and the drop's own (ZombieDrop.scale).
            ...(view.scale * (drop.scale ?? 1) === 1 ? {} : { scale: view.scale * (drop.scale ?? 1) }),
            mirrored,
        })
        void SoundSystem.playSounds(drop.sounds)
    }

    /**
     * Zombie::ApplyBurn leaves a charred zombie that crumbles at its own pace, in the zombie's place among what is
     * drawn. One that walked right crumbles flipped and 60 further right. The zombie is gone by then.
     */
    static readonly charred: StageEvent = (stage, event) => {
        const { x, y, row, rate, entityId, typeId } = event.data
        if (typeof x !== 'number' || typeof y !== 'number' || typeof row !== 'number' || typeof rate !== 'number' || typeof entityId !== 'number') return
        const mirrored = event.data.team === 'plants'
        const order = stage.zombieOrder(row, typeof typeId === 'string' ? typeId : undefined)
        ZombieView.remains(stage, 'CharredZombie', 'pvz:charred', x + (mirrored ? CHARRED_MIRRORED_SHIFT : 0), y, order, entityId, rate, mirrored)
    }

    /** Zombie::MowDown for a zombie that is not flattened: REANIM_PUFF two above it and the mower's cloud one above, with the splat. */
    static readonly puffed: StageEvent = (stage, event) => {
        const { x, y, row, zombieId, typeId } = event.data
        if (typeof x !== 'number' || typeof y !== 'number' || typeof row !== 'number' || typeof zombieId !== 'number') return
        void SoundSystem.play(SoundEffect.Splat, { foley: true })
        const order = stage.zombieOrder(row, typeof typeId === 'string' ? typeId : undefined)
        stage.particle('pvz:mowercloud', x + 110, y, order + 1)
        ZombieView.remains(stage, 'MowerPuff', 'pvz:puff', x, y, order + 2, zombieId, 1, false)
    }

    /**
     * The presentation's clip `id` played once where a zombie was (`x`, `y` on the board, the clip's own place from there),
     * at a draw order among what is drawn with that zombie, by the factor the server picked (`rateScale`).
     */
    private static remains(stage: Parameters<StageEvent>[0], name: string, id: string, x: number, y: number, order: number, entityId: number,
        rateScale: number, mirrored: boolean): void {
        const clip = clipNamed(stage.content.presentation.clips, id)
        const node = uiNode({ name, parent: stage.layer, position: boardToLayer(x, y), anchor: { x: 0, y: 1 } }).node
        if (mirrored) node.setScale(-1, 1, 1)
        stage.addScenery(node, order, entityId)
        const end = () => { if (node.isValid) node.destroy() }
        const player = uiNode({ name: 'Animation', parent: node }).node.addComponent(ReanimPlayer)
        void prepareClips([clip]).then(() => {
            if (node.isValid) showClip(player, clip, { rateScale, onFinish: end })
        }).catch(error => {
            end()
            console.error(`[Level] Failed to play ${clip.reanimId}`, error)
        })
    }
}

/** Zombie::DrawReanim and OverrideParticleColor: chilled or frozen (mChilledCounter, mIceTrapCounter), drawn blue. */
const isCold = (zombie: Pick<ShownZombie, 'chilled' | 'frozen'>): boolean => !!zombie.chilled || !!zombie.frozen

/** Zombie::ApplyBurn's shift for a charred zombie walking right, drawn mirrored. */
const CHARRED_MIRRORED_SHIFT = 60

/** What a zombie's body plays. */
const body = (zombie: ShownZombie) => zombie.animations[ZOMBIE_BODY_LAYER]

/** -1 without the armor or once it is gone, otherwise its damage index. */
function armorStage(health: number, armor: { readonly health: number } | undefined): number {
    return !armor || health <= 0 ? -1 : damageIndex(health, armor.health)
}

/** The sprites a zombie swaps in as it takes damage: its dented helm and shield, its bare arm, its enraged head. */
function swapSprites(zombie: ZombiePresentationDefinition): string[] {
    return [...zombie.helm?.damagedSprites ?? [], ...zombie.shield?.damagedSprites ?? [], zombie.damagedArmSprite,
        ...zombie.enragedHead ? [zombie.enragedHead.sprite] : []]
}
