import { prepareReanims } from '@/client/reanim/ReanimAssets'
import { modResources } from '@/client/content/ModResources'
import { Color, Node, Sprite, SpriteFrame, Vec3 } from 'cc'
import { boardToLayer, type Content, type EntityView, type LevelStage, plantShadow, type StageEvent } from '@/client/level/LevelStage'
import { zombieDefinition } from './definitions'
import { renderOrder } from '@/shared/content/renderOrder'
import { mirrorX, ZOMBIE_WIDTH } from '@/shared/content/teams'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { entityTint } from '@/client/view/tints'
import { uiNode } from '@/client/view/uiNode'
import type { ClientAnimationClip } from '@/client/content/ClientAnimationRegistry'
import { jsonRoundTrip, type JsonObject, type ZombieSnapshot, type WorldSnapshot } from '@/shared/protocol/index'
import { type LevelEntitySnapshot, parseSavedPlayback } from '@/client/level/LevelPresentationSnapshot'
import { exact } from '@/shared/validate'
import { attachmentTrack, type ZombiePresentationDefinition } from '@/shared/content/presentation'
import { type AnimationDefinition, damageIndex, ZOMBIE_BODY_LAYER, ZOMBIE_CLIPS, ZOMBIE_FLAG_LAYER, type ZombieDefinition } from '@/shared/content/gameplay'
import { animateCurve, ASSET_FPS, passedMark } from '@/shared/content/animation'
import { zombieClip } from '@/shared/content/zombieAnimation'
import { EntityAttachments } from '@/client/view/EntityAttachments'
import { layerPlayback, LayerPlayers, type LayerShown, ownFrames, shownLayer } from '@/client/view/layerPlayback'
import type { ZombieFlash } from '@/client/level/EntityFlashes'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { MIRRORED_SHIFT, zombiePartVisibility } from './zombieParts'
import { IceTrapView } from '@/client/view/IceTrapView'

/** Sprites a zombie swaps in as it takes damage, by ID: dented helms and shields, the bare arm, the enraged head. */
export type ZombieViewSprites = Readonly<Record<string, SpriteFrame>>

/** How a view draws its zombie, where that is not the board's way. */
export interface ZombieDraw {
    /** Where the body goes in its node, in place of where each of its clips has it (a cached picture draws from the Reanim's origin). */
    position?: { x: number, y: number }
    /** `false`: without its shadow. */
    shadow?: boolean
}

/**
 * A zombie as a view shows it: on the board the server's snapshot of it; off it (offBoard.ts) the same of a zombie that
 * is no entity, whole and at rest, playing what whoever shows it has it play. Off the board it stands (`standing`:
 * Zombie::LoadReanim not on the board), which no zombie on it does.
 */
export type ShownZombie = Omit<ZombieSnapshot, 'entityId' | 'state'> & { state: ZombieSnapshot['state'] | 'standing' }

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
 * turning with `turn`. Either way `pose` shows it. A Mod's view extends it as a plant's extends PlantView.
 */
export class ZombieView implements EntityView<ZombieSnapshot> {
    /**
     * Its shadow, a node beside its own (of the board's layer, on it): on the ground under it, drawn with the ground.
     * None when it is drawn without (ZombieDraw.shadow).
     */
    shadowNode?: Node
    /** Its attachment list: flags, marks and other effects that belong to it, which go on with it into the house. */
    readonly attachments = new EntityAttachments()
    /** Its animation (ZombieDefinition.animation): what its layers play, kept by the server on the board. */
    protected readonly animation: AnimationDefinition
    /** The layers' players are in it, with what goes on the body: a view moves the zombie's picture by it. */
    protected readonly root: Node
    /** Its layers: the body, one player for all its clips, which it changes between in place; over it what it carries. */
    private readonly layers: LayerPlayers
    /** The clip its body is on. */
    private bodyClip: string | null = null
    private parts = ''
    private mowerDriver: ReanimPlayer | null = null
    private holdingFlag = false
    private latestZombie: ShownZombie | null = null
    /** Its hit flash (Zombie::mJustGotShotCounter) in the frame being drawn. */
    protected flash = NO_FLASH
    /** Its body is coming up out of a grave (syncRise). */
    private rising = false
    /** Where its body's clip was at the last snapshot, for the marks of its steps it has come to since. */
    private stepped?: { clip: string, time: number }
    /** The ice it stands in while frozen (Zombie::DrawIceTrap), around its layers; on the board only. */
    private ice?: IceTrapView

    private readonly node: Node
    protected readonly presentation: ZombiePresentationDefinition
    /** Its type, whose clips it draws. */
    readonly typeId: string
    /** Its gameplay definition: the helm and shield for their full health, and whether it vaults. */
    private readonly gameplay: Pick<ZombieDefinition, 'helm' | 'shield' | 'vault'>
    private readonly draw: ZombieDraw

    constructor(protected readonly context: ZombieViewContext) {
        const { content, zombie } = context, definition = content.definitions.zombies[zombie.typeId]
        this.node = context.node
        this.typeId = zombie.typeId
        this.presentation = zombieDefinition(content.presentation, zombie.typeId)
        this.gameplay = definition
        this.animation = definition.animation
        this.draw = context.draw ?? {}
        this.root = uiNode({ name: 'Layers', parent: this.node }).node
        this.layers = new LayerPlayers(this.root, Object.keys(this.animation.layers))
        for (const layer of Object.keys(this.animation.layers)) if (layer !== ZOMBIE_BODY_LAYER) this.attachments.add(this.layers.player(layer).node)
    }

    /** The sprites it swaps in as it takes damage; none off the board, where it is shown whole. */
    private sprites: ZombieViewSprites = {}

    /** The body layer's player: what it carries is on its parts. */
    protected get body(): ReanimPlayer { return this.layers.player(ZOMBIE_BODY_LAYER) }

    /** The body's player, once it shows a clip. */
    private get player(): ReanimPlayer | null {
        const player = this.body
        return player.loadedId ? player : null
    }

    /** Every zombie's swapped sprites and dropped parts, ready before play. */
    static async preload(content: Content): Promise<void> {
        const ids = new Set(Object.values(content.presentation.zombies).flatMap(zombie => [...swapSprites(zombie),
            ...Object.values(zombie.drops).flatMap(drop => drop?.image ? [drop.image] : [])]))
        await Promise.all([...ids].map(id => modResources.sprite(id)))
    }

    async initialize(): Promise<void> {
        const { content, stage, node, zombie } = this.context
        // Zombie::DrawShadow under it, unless it is drawn without.
        const shadow = this.draw.shadow === false ? undefined : await plantShadow(content, stage)
        if (stage) {
            this.sprites = Object.fromEntries(await Promise.all(swapSprites(this.presentation).map(async id => [id, await modResources.sprite(id)] as const)))
            const look = content.presentation.iceTrap
            this.ice = await IceTrapView.create(this.root, this.root.children[0], look, this.presentation.iceTrap ?? look.zombie)
        }
        // Off the board its shadow goes beside its node, under what else is there.
        if (shadow) this.shadowNode = uiNode({
            name: 'ZombieShadow', parent: stage?.layer ?? node.parent!, anchor: { x: 0, y: 1 }, active: false,
            sprite: { frame: shadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        if (!stage) this.shadowNode?.setSiblingIndex(0)
        await prepareReanims(this.playable())
        if (!stage) this.stand(zombie)
    }

    /**
     * The zombie on the board for a frame, by the server's snapshot: where it stands, facing its side's way, rising from
     * a grave, its shadow, and what the board does to any zombie (its hit flash, a chilled one blue, a burned one black,
     * a mowed one on the mower's driver). `onBoard` shows the zombie itself.
     */
    sync(zombie: ZombieSnapshot, world: WorldSnapshot): void {
        const at = boardToLayer(zombie.x, zombie.y)
        this.node.setPosition(at.x, at.y)
        this.latestZombie = zombie
        this.flash = this.context.stage?.flashes.zombie(zombie.entityId, world.gameplayTick) ?? NO_FLASH
        this.syncFacing(zombie)
        // Its ice turns with it, across its width as what falls off it does.
        this.ice?.sync(!!zombie.frozen, this.mirrored ? ZOMBIE_WIDTH : undefined)
        // Zombie::PlayDeathAnim removes the surprise mark (AttachmentReanimTypeDie).
        if (zombie.state === 'dying' || zombie.state === 'mowered') {
            for (const armor of [this.presentation.helm, this.presentation.shield]) {
                if (armor?.dropReanim) this.attachments.remove(armor.dropReanim.reanimId)
            }
        }
        this.holdingFlag = zombie.animations[ZOMBIE_FLAG_LAYER] !== undefined
        uiNode({ node: this.node, opacity: zombie.alpha })
        this.placeShadow()
        // Zombie::HasShadow hides it while falling, burned, mowed or vaulting.
        if (this.shadowNode) this.shadowNode.active = zombie.state !== 'dying' && zombie.state !== 'mowered' && zombie.state !== 'burned' &&
            zombie.state !== 'vaulting' && !zombie.riseTicks
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
            stage.particle(steps.effect, Math.trunc(zombie.x) + mirrorX(mark.x, ZOMBIE_WIDTH, mirrored), Math.trunc(zombie.y) + mark.y,
                stage.zombieOrder(zombie.row) - 1, undefined, mirrored)
        }
    }

    /** The zombie itself on the board, by the server's snapshot: its layers and what it has on. A view adds what its zombie does here. */
    protected onBoard(zombie: ZombieSnapshot, _world: WorldSnapshot): void {
        this.pose(zombie)
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
        this.holdingFlag = zombie.animations[ZOMBIE_FLAG_LAYER] !== undefined
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
        if (!state) return undefined
        const { death, superLongDeath } = ZOMBIE_CLIPS
        return shownLayer(state, zombie.animations, {
            picture: name => this.clip(name),
            played: name => zombieClip(this.animation, name === superLongDeath && !this.clips()[superLongDeath] ? death : name),
            duration: reanimId => ReanimPlayer.duration(reanimId) ?? 0,
        })
    }

    /** How a player shows what the zombie's body plays (the mower's driver takes the body's place). */
    private playback(zombie: ShownZombie, player: ReanimPlayer): ReturnType<typeof layerPlayback> {
        return layerPlayback(this.shown(ZOMBIE_BODY_LAYER, zombie)!, player.durationSeconds)
    }

    private placeShadow(): void {
        const { x, y, backwardsX } = this.presentation.shadow
        // Zombie::DrawShadow's place differs for a zombie walking right.
        this.shadowNode?.setPosition(this.node.position.x + (this.mirrored ? backwardsX ?? x : x), this.node.position.y + y)
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
        // Still below by what it has to rise, inside the clip (GraveZombiePresentation), which is the zombie's: in the
        // body's own coordinates, turned round with a body facing right.
        const sunk = this.sunk(zombie.riseTicks), { clip } = this.graveRise
        this.place(player.node, at.x, at.y - sunk)
        const top = sunk + clip.y, bottom = clip.bottom - Math.min(clip.settleTicks, zombie.riseTicks), { x, y } = player.node.position
        player.setClip({ x: this.mirrored ? x - clip.x - clip.width : clip.x - x, y: top + y, width: clip.width, height: Math.max(0, bottom - top) })
    }

    private get graveRise() { return this.context.content.presentation.graves.zombie }

    /** How far below the body still is: Zombie::UpdateZombieRiseFromGrave's altitude, from -depth up to none. */
    private sunk(riseTicks: number): number {
        const { depth, riseTicks: ticks } = this.graveRise
        return -animateCurve(ticks, 0, riseTicks, -depth, 0)
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

    /** Zombie::DropHelm or DropShield: plays the armor's `dropReanim` on the zombie. */
    armorDropped(slot: 'helm' | 'shield'): void {
        const drop = this.presentation[slot]?.dropReanim
        if (!drop) return
        // Zombie::AddAttachedReanim: follows the zombie and plays the whole clip once.
        const node = uiNode({ name: 'HelmDrop', parent: this.root, position: { x: drop.offset[0], y: -drop.offset[1] } }).node
        this.attachments.add(node, drop.reanimId)
        const player = node.addComponent(ReanimPlayer)
        const dispose = () => { if (node.isValid) node.destroy() }
        void player.load(drop.reanimId).then(() => {
            if (node.isValid) player.play({ loop: false, rate: 1, onFinish: dispose })
            else dispose()
        }, error => {
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
        for (const node of [this.node, this.shadowNode]) {
            if (!node) continue
            if (node.parent !== parent) node.setParent(parent)
            node.active = true
        }
        const player = this.player
        if (!player) return
        // The walk goes on from where the server left it, by the server's rule (walkZombie): the clip comes round by
        // its length while its frames, and the ground under them, are spread over its length less one.
        const { rate, timeSeconds } = this.playback(zombie, player), cycle = player.durationSeconds, last = player.lastFrameTimeSeconds
        const start = timeSeconds + approachTicks / 100 * rate, time = start + ticks / 100 * rate
        const ground = this.presentation.parts.ground
        const groundAt = (seconds: number) => player.sampleTrack(ground, seconds % cycle / cycle * last)?.x ?? 0
        const distance = ((Math.floor(time / cycle) - Math.floor(start / cycle)) * (groundAt(cycle - 1e-9) - groundAt(0)) + groundAt(time) - groundAt(start)) * cycle / last
        this.node.setPosition(zombie.x - 400 - distance, 300 - y)
        this.placeShadow()
        player.seek(time % cycle)
    }

    destroy(): void {
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
        this.parts = ''
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
        // Mowed before its body showed (put down on a running mower), or as it landed from its vault, with no walking
        // snapshot between: its walk stands in for the driver to take.
        if (!this.player || this.gameplay.vault && !zombie.hasPole && this.bodyClip === ZOMBIE_CLIPS.jump) {
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
        this.place(driver.node, animation.x, animation.y)
        driver.change(animation.reanimId)
        this.bodyClip = ZOMBIE_CLIPS.mowered
        this.player.attachToTrack(driver, attachmentTrack(animation))
        driver.play({ ...this.playback(zombie, driver), hideOnFinish: false })
        driver.pause()
    }

    /**
     * Shows the zombie's animation, each layer at its time. A body that comes to another clip changes to it where it is,
     * blending from the pose it had, so that what is on the zombie (a splat, a dropped helm) stays over it; what it
     * carries goes on the part of the body its clip names (a flag in its hand, drawn between the hand and the arm on the pole).
     * `board`: with what the board colors a zombie by; off it, whoever shows the picture colors it whole. This is all
     * there is to a zombie off the board.
     */
    protected pose(zombie: ShownZombie, board = true): void {
        const changed = this.bodyClip !== body(zombie).clip
        // Landing and WalkIntoHouse both use StartWalkAnim(0), without blending the held pole into the walk.
        const landing = (this.bodyClip === ZOMBIE_CLIPS.jump || this.gameplay.vault && this.bodyClip === ZOMBIE_CLIPS.run && zombie.hasPole === false)
            && (zombie.state === 'walking' || zombie.state === 'eating')
        this.layers.show(layer => this.shown(layer, zombie), {
            blend: (layer, _clip, first) => layer === ZOMBIE_BODY_LAYER && !first && !landing && zombie.state !== 'mowered' ? 0.2 : 0,
            place: (layer, player, clip) => {
                const at = layer === ZOMBIE_BODY_LAYER ? this.draw.position ?? clip : clip
                if (player.node.parent === this.root) this.place(player.node, at.x, at.y)
            },
        })
        if (changed) {
            this.bodyClip = body(zombie).clip
            this.parts = ''
        }
        this.applyParts(zombie)
        if (board && changed) {
            this.applyHitFlash(zombie)
            this.applyColor(zombie, true)
        }
        this.syncRise(zombie)
    }

    private applyParts(zombie: ShownZombie): void {
        const helmStage = armorStage(zombie.helmHealth, this.gameplay.helm), shieldStage = armorStage(zombie.shieldHealth, this.gameplay.shield)
        // Zombie::ShowDoorArms: an eating zombie lowers the shield arms; a dropped shield takes them away for good.
        const holdingShield = shieldStage >= 0 && zombie.state !== 'eating'
        const signature = `${zombie.hasHead ? 1 : 0}|${zombie.hasTongue ? 1 : 0}|${zombie.hasArm ? 1 : 0}|${this.holdingFlag ? 1 : 0}|${helmStage}|${shieldStage}|${holdingShield ? 1 : 0}`
        if (!this.player || signature === this.parts) return
        this.parts = signature
        const presentation = this.presentation, parts = presentation.parts
        const state = { hasHead: zombie.hasHead, hasTongue: zombie.hasTongue, hasArm: zombie.hasArm, holdingFlag: this.holdingFlag, helmStage, shieldStage, holdingShield }
        for (const [tracks, visible] of zombiePartVisibility(presentation, state)) this.player.setTracksVisible(tracks, visible)
        this.player.setTrackSpriteOverride(parts.upperArm, zombie.hasArm ? null
            : this.sprites[presentation.damagedArmSprite])
        const enraged = presentation.enragedHead
        if (enraged) this.player.setTrackSpriteOverride(enraged.track, zombie.enraged && body(zombie).clip !== ZOMBIE_CLIPS.gasp ? this.sprites[enraged.sprite] : null)
        // Zombie::TakeHelmDamage and TakeShieldDamage swap in the dented sprite below 2/3 and 1/3 health.
        for (const [armor, stage] of [[presentation.helm, helmStage], [presentation.shield, shieldStage]] as const) {
            if (!armor || stage < 0 || !parts.helms.includes(armor.track)) continue
            this.player.setTrackSpriteOverride(armor.track, stage === 0 ? null : this.sprites[armor.damagedSprites[stage - 1]])
        }
    }

    private color: 'normal' | 'chilled' | 'mindControlled' | 'mindControlledChilled' | 'burned' = 'normal'
    /** Zombie::IsWalkingBackwards: a zombie on the plants' side faces right. */
    private mirrored = false

    /**
     * Zombie::UpdateReanim: a zombie walking right draws its body mirrored (`m00 = -scale`) and 90 further right (see
     * MIRRORED_SHIFT). Every body animation node is placed through here.
     */
    private place(node: Node, x: number, y: number): void {
        node.setPosition(x + (this.mirrored ? MIRRORED_SHIFT : 0), y)
        node.setScale(this.mirrored ? -1 : 1, 1, 1)
    }

    /** A zombie that changes sides turns its body nodes around. */
    private syncFacing(zombie: ShownZombie): void {
        const mirrored = zombie.team === 'plants'
        if (mirrored === this.mirrored) return
        const moved = mirrored ? MIRRORED_SHIFT : -MIRRORED_SHIFT
        this.mirrored = mirrored
        for (const node of [this.player?.node, this.root.getChildByName('MoweredDriver')]) {
            if (!node?.isValid) continue
            node.setPosition(node.position.x + moved, node.position.y)
            node.setScale(mirrored ? -1 : 1, 1, 1)
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

    /** Zombie::DrawReanim's hit highlight (mJustGotShotCounter), over its chill; the shield's own (mShieldJustGotShotCounter). */
    private applyHitFlash(zombie: ShownZombie): void {
        const shield = zombie.shieldHealth > 0 ? this.presentation.shield : undefined
        // TakeShieldDamage flashes only the shield, unless the hit also reached the body (the Fume-shroom); one that
        // came past the shield (a lobbed projectile) flashes only the body.
        const { through, past } = this.flash
        const bodyFlash = shield && !through && !past ? 0 : this.flash.flash
        const flash = past ? 0 : this.flash.flash
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

    /** The presentation's clip of a name: an enraged zombie's own walk and eating in place of the plain ones. */
    protected clip(name: string): ClientAnimationClip {
        const enraged = this.latestZombie?.enraged, clips = this.clips(), { walk, walk2, eat, death, superLongDeath } = ZOMBIE_CLIPS
        // A zombie drawn without `superLongDeath` falls with its `death`.
        const clip = clips[enraged && (name === walk || name === walk2) ? 'enragedWalk'
            : enraged && name === eat ? 'enragedEat' : name] ?? (name === superLongDeath ? clips[death] : undefined)
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
        void SoundSystem.playFoley(nut || !plant && zombie?.mindControlled ? SoundEffect.ChompSoft : SoundEffect.Chomp)
        if (!nut || !zombie) return
        const tint = presentation!.visual.tint
        // At (37, 40) from the zombie. A zombie facing right mirrors it across its width, and its debris flies the other way.
        const mirrored = zombie.team === 'plants'
        stage.particle(presentation!.chewParticle!, zombie.x + mirrorX(37, ZOMBIE_WIDTH, mirrored), zombie.y + 40,
            renderOrder('projectile', zombie.row), tint ? new Color(...tint) : undefined, mirrored)
    }

    /** Zombie::RiseFromGrave: PARTICLE_ZOMBIE_RISE on the row's particle layer, with the grave's rumble. */
    static readonly rose: StageEvent = (stage, event, world) => {
        SoundSystem.playSounds(stage.graveRise.sounds)
        const zombie = world.zombies.find(candidate => candidate.entityId === event.data.entityId)
        if (zombie) stage.particle(stage.graveRise.particle, zombie.x + 60, zombie.y + 110, renderOrder('particle', zombie.row))
    }

    /** Zombie::EatPlant and EatZombie gulp the last bite. */
    static readonly ate: StageEvent = () => { void SoundSystem.play(SoundEffect.Gulp) }

    /** Zombie::ApplyChill plays FOLEY_FROZEN on the first chill. */
    static readonly chilled: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.Frozen) }

    /** Zombie::UpdateZombiePolevaulter: the vault, and the step of its landing. */
    static readonly vaulted: StageEvent = (_stage, event) => {
        void SoundSystem.playFoley(event.data.sound === 'polevault' ? SoundEffect.PoleVault : SoundEffect.Grassstep)
    }

    /** Zombie::UpdateZombieNewspaper: one that lost its paper roars when it says so. */
    static readonly enraged: StageEvent = (stage, event) => {
        if (event.data.roar === true) SoundSystem.playSounds(stage.content.presentation.zombies[String(event.data.typeId)]?.enrageSounds)
    }

    /** Zombie::UpdateZombieGroan. */
    static readonly groaned: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.Groan) }

    /** Zombie::PlayDeathAnim: it falls. */
    static readonly fell: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.ZombieFalling1, 10) }

    /** Zombie::MowDown: squashed by a mower (FOLEY_SPLAT). */
    static readonly mowered: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.Splat) }

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
            SoundSystem.playSounds(armor.dropSounds)
        }
        const at = view.dropPosition(stage.layer, armor.track, armor.offset)
        // One above the zombie; one facing right sheds its armor the way it faces.
        stage.spawnParticle(stage.zombieOrder(zombie.row) + 1, { id: armor.effect, mirrored: zombie.team === 'plants', ...at })
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
        // One above the zombie.
        stage.spawnParticle(stage.zombieOrder(zombie.row) + 1, {
            id: event.data.mowered === true ? drop.moweredEffect ?? drop.effect : drop.effect,
            ...view.dropPosition(stage.layer, drop.track, drop.offset),
            // The pole vaulter's own head and a bare hand are swapped in.
            spriteOverride: drop.image,
            // Zombie::OverrideParticleColor keeps a mind-controlled zombie's parts purple, a chilled one's blue.
            tint: tint && new Color(tint.r, tint.g, tint.b, 255),
            extraAdditive: !!tint,
            mirrored,
        })
        SoundSystem.playSounds(drop.sounds)
    }

    /**
     * Zombie::ApplyBurn leaves a charred zombie that crumbles at its own pace, in the zombie's place among what is
     * drawn. One that walked right crumbles flipped and 60 further right. The zombie is gone by then.
     */
    static readonly charred: StageEvent = (stage, event) => {
        const { x, y, row, rate, entityId } = event.data
        if (typeof x !== 'number' || typeof y !== 'number' || typeof row !== 'number' || typeof rate !== 'number' || typeof entityId !== 'number') return
        const mirrored = event.data.team === 'plants'
        ZombieView.remains(stage, 'CharredZombie', 'pvz:zombie_charred', x + (mirrored ? CHARRED_MIRRORED_SHIFT : 0), y, stage.zombieOrder(row), entityId, rate, mirrored)
    }

    /** Zombie::MowDown for a zombie that is not flattened: REANIM_PUFF two above it and the mower's cloud one above, with the splat. */
    static readonly puffed: StageEvent = (stage, event) => {
        const { x, y, row, zombieId } = event.data
        if (typeof x !== 'number' || typeof y !== 'number' || typeof row !== 'number' || typeof zombieId !== 'number') return
        void SoundSystem.playFoley(SoundEffect.Splat)
        const order = stage.zombieOrder(row)
        stage.particle('pvz:mowercloud', x + 110, y, order + 1)
        ZombieView.remains(stage, 'MowerPuff', 'pvz:puff', x - 73, y - 56, order + 2, zombieId, 1, false)
    }

    /** An animation played once where a zombie was, at a draw order among what is drawn with that zombie. */
    private static remains(stage: Parameters<StageEvent>[0], name: string, reanim: string, x: number, y: number, order: number, entityId: number,
        rate: number, mirrored: boolean): void {
        const node = uiNode({ name, parent: stage.layer, position: boardToLayer(x, y), anchor: { x: 0, y: 1 } }).node
        if (mirrored) node.setScale(-1, 1, 1)
        stage.addScenery(node, order, entityId)
        const end = () => { if (node.isValid) node.destroy() }
        const player = node.addComponent(ReanimPlayer)
        void player.load(reanim).then(() => {
            if (node.isValid) player.play({ loop: false, rate, timeSeconds: 0, onFinish: end })
        }).catch(error => {
            end()
            console.error(`[Level] Failed to play ${reanim}`, error)
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
