import { Color, Mask, Node, Sprite, SpriteFrame, Vec3 } from 'cc'
import { boardToLayer, type Content, type EntityView, type LevelStage, plantShadow, type StageEvent } from '@/client/level/LevelStage'
import { zombieDefinition } from './definitions'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { renderOrder } from '@/shared/content/renderOrder'
import { mirrorX, ZOMBIE_WIDTH } from '@/shared/content/teams'
import { ReanimPlayer, ReanimRepository } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import type { ClientAnimationClip } from '@/client/content/ClientAnimationRegistry'
import type { ZombieSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import type { LevelEntitySnapshot } from '@/client/level/LevelPresentationSnapshot'
import { attachmentTrack, type ZombiePresentationDefinition } from '@/shared/content/presentation'
import { ZOMBIE_BODY_LAYER, ZOMBIE_CLIPS, ZOMBIE_FLAG_LAYER, type ZombieDefinition } from '@/shared/content/gameplay'
import { ASSET_FPS } from '@/shared/content/animation'
import { zombieClip } from '@/shared/content/zombieAnimation'
import { EntityAttachments } from '@/client/view/EntityAttachments'
import { layerPlayback, LayerPlayers, type LayerShown, shownLayer } from '@/client/view/layerPlayback'
import type { ZombieFlash } from '@/client/level/EntityFlashes'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { MIRRORED_SHIFT, zombiePartVisibility } from './zombieParts'

/** Sprites a zombie swaps in as it takes damage. */
export interface ZombieViewSprites {
    damagedArm: SpriteFrame
    poleVaulterDamagedArm: SpriteFrame
    helms: Record<string, SpriteFrame>
}

/** How a view draws its zombie, where that is not the board's way. */
export interface ZombieDraw {
    /** Where the body goes in its node, in place of where each of its clips has it (a cached picture draws from the Reanim's origin). */
    position?: { x: number, y: number }
    /** `false`: without its shadow. */
    shadow?: boolean
}

export interface ZombieViewContext {
    node: Node
    content: Content
    zombie: ZombieSnapshot
    /** The board it is on; none off the board. */
    stage?: LevelStage
    draw?: ZombieDraw
}

export type ZombieViewSnapshot = Extract<LevelEntitySnapshot, { kind: 'zombie' }>

/** Off the board a zombie is whole: it swaps in none of the sprites of a damaged one. */
const WHOLE = { helms: {} } as unknown as ZombieViewSprites
const NO_FLASH: ZombieFlash = { flash: 0, through: false, past: false }

/**
 * A zombie, drawn by its animation (ZombieDefinition.animation): one player for its body, showing the clip its layer
 * is on at its time into it, as a plant's view shows its layers. The pictures are the presentation's clip of the same
 * name. On the board the server keeps the animation and `sync` follows its snapshots; off the board whoever shows the
 * zombie gives it what to play and calls `show`.
 */
export class ZombieView implements EntityView<ZombieSnapshot> {
    /** Its shadow, a node beside its own (of the board's layer, on it): on the ground under it, drawn with the ground. */
    shadowNode!: Node
    /** Its attachment list: flags, marks and other effects that belong to it, which go on with it into the house. */
    readonly attachments = new EntityAttachments()
    /** Its layers: the body, one player for all its clips, which it changes between in place; over it what it carries. */
    private readonly layers: LayerPlayers
    /** The clip its body is on. */
    private animation: string | null = null
    private parts = ''
    private mowerDriver: ReanimPlayer | null = null
    private holdingFlag = false
    private latestZombie: ZombieSnapshot | null = null
    private flash = NO_FLASH
    private riseClip?: Node

    private readonly node: Node
    private readonly presentation: ZombiePresentationDefinition
    /** Its type, whose clips it draws. */
    readonly typeId: string
    /** Its gameplay definition: what its body plays, and the helm and shield for their full health. */
    private readonly gameplay: Pick<ZombieDefinition, 'helm' | 'shield' | 'animation'>
    private readonly draw: ZombieDraw

    constructor(protected readonly context: ZombieViewContext) {
        const { content, zombie } = context
        this.node = context.node
        this.typeId = zombie.typeId
        this.presentation = zombieDefinition(content.presentation, zombie.typeId)
        this.gameplay = content.definitions.zombies[zombie.typeId]
        this.draw = context.draw ?? {}
        this.layers = new LayerPlayers(this.node, Object.keys(this.gameplay.animation.layers), content.registry)
        for (const layer of Object.keys(this.gameplay.animation.layers)) if (layer !== ZOMBIE_BODY_LAYER) this.attachments.add(this.layers.player(layer).node)
    }

    private get registry() { return this.context.content.registry }
    private get loader() { return this.context.content.loader }
    private get sprites(): ZombieViewSprites { return this.context.stage?.assets.zombieSprites ?? WHOLE }

    /** The body's player, once it shows a clip. */
    private get player(): ReanimPlayer | null {
        const player = this.layers.player(ZOMBIE_BODY_LAYER)
        return player.loadedId ? player : null
    }

    /** Its shadow beside it, and every clip of this zombie in memory, so that it changes between them at once. */
    async initialize(): Promise<void> {
        const { content, stage, node } = this.context
        const shadow = await plantShadow(content, stage)
        this.shadowNode = uiNode({
            name: 'ZombieShadow', parent: stage?.layer ?? node.parent!, anchor: { x: 0, y: 1 }, active: false,
            sprite: { frame: shadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        await new ReanimRepository(this.registry, this.loader).prepare(
            Object.values(this.clips()).flatMap(clip => typeof clip?.reanimId === 'string' ? [clip.reanimId] : []))
    }

    /** The zombie on the board, by the server's snapshot, with its hit flash (Zombie::mJustGotShotCounter). */
    sync(zombie: ZombieSnapshot, world: WorldSnapshot): void {
        const at = boardToLayer(zombie.x, zombie.y)
        this.node.setPosition(at.x, at.y)
        this.latestZombie = zombie
        this.flash = this.context.stage?.flashes.zombie(zombie.entityId, world.gameplayTick) ?? NO_FLASH
        this.syncFacing(zombie)
        if (zombie.riseTicks && !this.riseClip) {
            this.riseClip = uiNode({ name: 'GraveRiseClip', parent: this.node, position: { x: -50, y: 110 },
                size: { width: 250, height: 220 }, anchor: { x: 0, y: 1 }, mask: Mask.Type.GRAPHICS_RECT }).node
            // The mask stays above the ground; the body rises from below it.
            this.riseClip.setPosition(-50, 110)
        }
        if (this.riseClip) {
            this.riseClip.active = !!zombie.riseTicks
            if (!zombie.riseTicks && this.player?.node.parent === this.riseClip) this.player.node.setParent(this.node)
        }
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
        this.shadowNode.active = zombie.state !== 'dying' && zombie.state !== 'mowered' && zombie.state !== 'burned' &&
            zombie.state !== 'vaulting' && !zombie.riseTicks
        this.applyHitFlash(zombie)
        this.applyColor(zombie)
        if (zombie.state === 'mowered') {
            this.syncMowered(zombie)
            return
        }
        this.showLayers(zombie)
    }

    /** The zombie off the board (the almanac, a packet's picture, the street before a level): whole, on what its body is given to play. */
    show(zombie: ZombieSnapshot): void {
        this.latestZombie = zombie
        this.syncFacing(zombie)
        this.holdingFlag = zombie.animations[ZOMBIE_FLAG_LAYER] !== undefined
        this.placeShadow()
        this.shadowNode.active = this.draw.shadow !== false
        // The board draws a shield in its own colors, apart from the body's (applyHitFlash); a picture's shield takes the
        // picture's color with the rest, as a packet's gray.
        this.showLayers(zombie, false)
    }

    /**
     * What a layer of the zombie shows of what it plays (shownLayer). A zombie drawn without the super long death falls
     * with its plain one, at that one's length.
     */
    private shown(layer: string, zombie: ZombieSnapshot): LayerShown | undefined {
        const state = zombie.animations[layer]
        if (!state) return undefined
        const { death, superLongDeath } = ZOMBIE_CLIPS
        return shownLayer(state, zombie.animations, {
            picture: name => this.definition(name),
            played: name => zombieClip(this.gameplay.animation, name === superLongDeath && !this.clips()[superLongDeath] ? death : name),
            duration: reanimId => ReanimPlayer.duration(reanimId, this.registry) ?? 0,
        })
    }

    /** How a player shows what the zombie's body plays (the mower's driver takes the body's place). */
    private playback(zombie: ZombieSnapshot, player: ReanimPlayer): ReturnType<typeof layerPlayback> {
        return layerPlayback(this.shown(ZOMBIE_BODY_LAYER, zombie)!, player.durationSeconds)
    }

    private placeShadow(): void {
        const { x, y, backwardsX } = this.presentation.shadow
        // Zombie::DrawShadow's place differs for a zombie walking right.
        this.shadowNode.setPosition(this.node.position.x + (this.mirrored ? backwardsX ?? x : x), this.node.position.y + y)
    }

    get players(): ReanimPlayer[] { return this.layers.shown.filter(player => player.node.isValid) }

    private syncRise(zombie: ZombieSnapshot): void {
        // Only the grave-rise clip owns this offset; a pending landing keeps its jump-origin compensation.
        if (!this.player || !this.riseClip) return
        const clip = this.definition(body(zombie).clip)
        if (zombie.riseTicks) {
            this.player.node.setParent(this.riseClip)
            this.place(this.player.node, clip.x + 50, clip.y - 110 - Math.min(200, zombie.riseTicks * 4))
        } else if (this.player.node.parent === this.node) this.place(this.player.node, clip.x, clip.y)
    }

    /** Zombie::DropHelm or DropShield: plays the armor's `dropReanim` on the zombie. */
    armorDropped(slot: 'helm' | 'shield'): void {
        const drop = this.presentation[slot]?.dropReanim
        if (!drop) return
        // Zombie::AddAttachedReanim: follows the zombie and plays the whole clip once.
        const node = uiNode({ name: 'HelmDrop', parent: this.node, position: { x: drop.offset[0], y: -drop.offset[1] } }).node
        this.attachments.add(node, drop.reanimId)
        const player = node.addComponent(ReanimPlayer)
        const dispose = () => { if (node.isValid) node.destroy() }
        void player.load(drop.reanimId, this.registry, this.loader).then(() => {
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

    syncGameOverWalk(zombie: ZombieSnapshot, ticks: number, y: number, approachTicks = 0): void {
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

    /** Where its body and the mower's driver are in their blends, and its flash. */
    snapshot(entityId: number): ZombieViewSnapshot {
        const flash = this.context.stage?.flashes.snapshot(entityId)
        return {
            kind: 'zombie',
            entityId,
            body: this.player?.snapshot() ?? null,
            mowerDriver: this.mowerDriver?.snapshot() ?? null,
            ...(flash ? { flash } : {}),
        }
    }

    async restore(snapshot: ZombieViewSnapshot): Promise<void> {
        this.context.stage?.flashes.restore(snapshot.entityId, snapshot.flash)
        // What it carries is shown again from the server's snapshot; the body keeps where it was in its blend.
        if (snapshot.body) await this.restorePlayer(this.layers.player(ZOMBIE_BODY_LAYER), 'ZombieAnimation', snapshot.body)
        this.mowerDriver = await this.restorePlayer(this.mowerDriver, 'MoweredDriver', snapshot.mowerDriver)
        if (snapshot.body?.attachmentTrackId && this.player && this.mowerDriver) {
            this.player.reattachAfterRestore(this.mowerDriver)
        }
        this.animation = snapshot.mowerDriver
            ? ZOMBIE_CLIPS.mowered
            : snapshot.body
                ? Object.entries(this.clips()).find(([, clip]) => clip?.reanimId === snapshot.body!.id)?.[0] ?? null
                : null
        this.parts = ''
    }

    private async restorePlayer(
        current: ReanimPlayer | null,
        name: string,
        snapshot: ZombieViewSnapshot['body'],
    ): Promise<ReanimPlayer | null> {
        if (!snapshot) {
            if (current?.node.isValid) current.node.destroy()
            return null
        }
        await new ReanimRepository(this.registry, this.loader).prepare([snapshot.id])
        const player = current?.node.isValid ? current
            : uiNode({ name, parent: this.node, anchor: { x: 0, y: 1 } }).node.addComponent(ReanimPlayer)
        if (player.loadedId !== snapshot.id) {
            player.change(snapshot.id, this.registry)
            const definition = this.definitionFromReanim(snapshot.id)
            if (definition) this.place(player.node, definition.x, definition.y)
        }
        player.restore(snapshot)
        return player
    }

    private syncMowered(zombie: ZombieSnapshot): void {
        // Mowed before its body showed (put down on a running mower), or as it landed from its vault, with no walking
        // snapshot between: its walk stands in for the driver to take.
        if (!this.player || this.presentation.vault && !zombie.hasPole && this.animation === ZOMBIE_CLIPS.jump) {
            this.showLayers({ ...zombie, animations: { [ZOMBIE_BODY_LAYER]: { clip: ZOMBIE_CLIPS.walk, time: 0, rate: ASSET_FPS } } })
        }
        this.applyParts(zombie)
        this.player?.pause()
        const animation = this.definition(ZOMBIE_CLIPS.mowered)
        if (this.mowerDriver) {
            this.mowerDriver.seek(this.playback(zombie, this.mowerDriver).timeSeconds)
            if (this.player) this.player.seek(this.player.snapshot().timeSeconds)
            return
        }
        if (!this.player) return
        const driver = this.mowerDriver = uiNode({ name: 'MoweredDriver', parent: this.node }).node.addComponent(ReanimPlayer)
        this.place(driver.node, animation.x, animation.y)
        driver.change(animation.reanimId, this.registry)
        this.animation = ZOMBIE_CLIPS.mowered
        this.player.attachToTrack(driver, attachmentTrack(animation))
        driver.play({ ...this.playback(zombie, driver), hideOnFinish: false })
        driver.pause()
    }

    /**
     * Shows the zombie's animation, each layer at its time. A body that comes to another clip changes to it where it is,
     * blending from the pose it had, so that what is on the zombie (a splat, a dropped helm) stays over it; what it
     * carries goes on the part of the body its clip names (a flag in its hand, drawn between the hand and the arm on the pole).
     * `board`: with what the board colors a zombie by; off it, whoever shows the picture colors it whole.
     */
    private showLayers(zombie: ZombieSnapshot, board = true): void {
        const changed = this.animation !== body(zombie).clip
        // Landing and WalkIntoHouse both use StartWalkAnim(0), without blending the held pole into the walk.
        const landing = (this.animation === ZOMBIE_CLIPS.jump || this.presentation.vault && this.animation === ZOMBIE_CLIPS.run && zombie.hasPole === false)
            && (zombie.state === 'walking' || zombie.state === 'eating')
        this.layers.show(layer => this.shown(layer, zombie), {
            blend: (layer, _clip, first) => layer === ZOMBIE_BODY_LAYER && !first && !landing && zombie.state !== 'mowered' ? 0.2 : 0,
            place: (layer, player, clip) => {
                const at = layer === ZOMBIE_BODY_LAYER ? this.draw.position ?? clip : clip
                if (player.node.parent === this.node) this.place(player.node, at.x, at.y)
            },
        })
        if (changed) {
            this.animation = body(zombie).clip
            this.parts = ''
        }
        this.applyParts(zombie)
        if (board && changed) {
            this.applyHitFlash(zombie)
            this.applyColor(zombie, true)
        }
        this.syncRise(zombie)
    }

    private applyParts(zombie: ZombieSnapshot): void {
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
            : presentation.damagedArmSprite ? this.sprites.helms[presentation.damagedArmSprite] : this.sprites[presentation.damagedArm])
        const enraged = presentation.enragedHead
        if (enraged) this.player.setTrackSpriteOverride(enraged.track, zombie.enraged && body(zombie).clip !== ZOMBIE_CLIPS.gasp ? this.sprites.helms[enraged.sprite] : null)
        // Zombie::TakeHelmDamage and TakeShieldDamage swap in the dented sprite below 2/3 and 1/3 health.
        for (const [armor, stage] of [[presentation.helm, helmStage], [presentation.shield, shieldStage]] as const) {
            if (!armor || stage < 0 || !parts.helms.includes(armor.track)) continue
            this.player.setTrackSpriteOverride(armor.track, stage === 0 ? null : this.sprites.helms[armor.damagedSprites[stage - 1]])
        }
    }

    private color: 'normal' | 'chilled' | 'burned' = 'normal'
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
    private syncFacing(zombie: ZombieSnapshot): void {
        const mirrored = zombie.team === 'plants'
        if (mirrored === this.mirrored) return
        const moved = mirrored ? MIRRORED_SHIFT : -MIRRORED_SHIFT
        this.mirrored = mirrored
        for (const node of [this.player?.node, this.node.getChildByName('MoweredDriver')]) {
            if (!node?.isValid) continue
            node.setPosition(node.position.x + moved, node.position.y)
            node.setScale(mirrored ? -1 : 1, 1, 1)
        }
    }

    /** Zombie::DrawReanim tints chilled zombies blue and burned ones black. */
    private applyColor(zombie: ZombieSnapshot, force = false): void {
        const color = zombie.state === 'burned' ? 'burned' : zombie.chilled ? 'chilled' : 'normal'
        if (!this.player || color === this.color && !force) return
        this.color = color
        const value = color === 'burned' ? new Color(0, 0, 0) : color === 'chilled' ? new Color(75, 75, 255) : Color.WHITE
        // What it carries is attached to the body's tracks, so it takes the body's colors.
        this.player.setColorOverride(value)
    }

    private applyHitFlash(zombie: ZombieSnapshot): void {
        const cold = zombie.chilled === true && zombie.state !== 'burned'
        const shield = zombie.shieldHealth > 0 ? this.presentation.shield : undefined
        // TakeShieldDamage flashes only the shield, unless the hit also reached the body (the Fume-shroom); one that
        // came past the shield (a lobbed projectile) flashes only the body.
        const { through, past } = this.flash
        const bodyFlash = shield && !through && !past ? 0 : this.flash.flash
        const flash = past ? 0 : this.flash.flash
        const grayness = Math.min(255, bodyFlash * 10)
        // DrawReanim adds the cold tint and then adds the hit highlight on top of it.
        const color = new Color(Math.min(255, grayness + (cold ? 75 : 0)),
            Math.min(255, grayness + (cold ? 75 : 0)), cold ? 255 : grayness, 255)
        this.player?.setExtraAdditiveDraw(cold || bodyFlash > 0, color)
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
    private definition(name: string): ClientAnimationClip {
        const enraged = this.latestZombie?.enraged, clips = this.clips(), { walk, walk2, eat, death, superLongDeath } = ZOMBIE_CLIPS
        // A zombie drawn without `superLongDeath` falls with its `death`.
        const clip = clips[enraged && (name === walk || name === walk2) ? 'enragedWalk'
            : enraged && name === eat ? 'enragedEat' : name] ?? (name === superLongDeath ? clips[death] : undefined)
        if (!clip) throw new Error(`${this.typeId} has no ${name} animation`)
        return clip
    }

    private clips(): Record<string, ClientAnimationClip | undefined> {
        return this.context.content.animations.resolve(this.typeId) as Record<string, ClientAnimationClip | undefined>
    }

    private definitionFromReanim(reanimId: string): ClientAnimationClip | undefined {
        return Object.values(this.clips()).find(value => value?.reanimId === reanimId)
    }

    /**
     * Zombie::AnimateChewSound and AnimateChewEffect: wall-nuts crumble softly, on the row's projectile layer. A zombie
     * chewing another (Zombie::EatZombie) chews as on any plant.
     */
    static readonly chewed: StageEvent = (stage, event, world) => {
        const plant = world.plants.find(candidate => candidate.entityId === event.data.plantId)
        const zombie = world.zombies.find(candidate => candidate.entityId === event.data.zombieId)
        const presentation = plant ? stage.content.presentation.plants[plant.typeId] : undefined
        const nut = presentation?.chewParticle !== undefined
        void SoundSystem.playFoley(nut ? SoundEffect.ChompSoft : SoundEffect.Chomp)
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
        const zombie = world.zombies.find(candidate => candidate.entityId === entityId)
        const node = stage.node(entityId), view = stage.zombie(entityId)
        // Zombie::DropHelm takes the track where it is this tick, as the parts do: one rising from a grave is higher now.
        if (zombie) view?.sync(zombie, world)
        const typeId = zombie?.typeId ?? view?.typeId
        const armor = typeId ? stage.content.presentation.zombies[typeId]?.[slot] : undefined
        if (!node || !armor) return
        if (event.data.bypassed !== true) {
            view?.armorDropped(slot)
            SoundSystem.playSounds(armor.dropSounds)
        }
        const track = view?.getTrackWorldPosition(armor.track)
        const local = track ? uiNode({ node: stage.layer }).transform.convertToNodeSpaceAR(track) : null
        // A zombie facing right sheds its armor the way it faces.
        const mirrored = zombie?.team === 'plants'
        ParticlePlayer.spawn({
            parent: stage.layer, id: armor.effect,
            x: local?.x ?? node.position.x + mirrorX(armor.offset[0], ZOMBIE_WIDTH, mirrored), y: local?.y ?? node.position.y + armor.offset[1],
            // One above the zombie.
            renderOrder: stage.zombieOrder(zombie?.row ?? 0) + 1,
            mirrored,
        })
    }

    /** Zombie::DropHead, DropArm and DropFlag: the part flies off from where it is on the body, with its sounds. */
    static readonly partDropped: StageEvent = (stage, event, world) => {
        const { entityId, part } = event.data
        if (typeof entityId !== 'number' || (part !== 'head' && part !== 'arm' && part !== 'flag')) return
        const zombie = world.zombies.find(candidate => candidate.entityId === entityId)
        const node = stage.node(entityId), view = stage.zombie(entityId)
        if (zombie) view?.sync(zombie, world)
        const drop = node && stage.content.presentation.zombies[view?.typeId ?? 'pvz:normal']?.drops[part]
        if (!node || !drop) return
        const track = view?.getTrackWorldPosition(drop.track)
        const local = track ? uiNode({ node: stage.layer }).transform.convertToNodeSpaceAR(track) : null
        // A zombie facing right: its part flies off the way it faces, as its body is drawn. (The original keeps the
        // part's flight for a mind-controlled zombie.)
        const mirrored = zombie?.team === 'plants', chilled = zombie?.chilled === true
        ParticlePlayer.spawn({
            parent: stage.layer,
            id: event.data.mowered === true ? drop.moweredEffect ?? drop.effect : drop.effect,
            x: local?.x ?? node.position.x + mirrorX(drop.offset[0], ZOMBIE_WIDTH, mirrored),
            y: local?.y ?? node.position.y + drop.offset[1],
            // One above the zombie.
            renderOrder: stage.zombieOrder(zombie?.row ?? (typeof event.data.row === 'number' ? event.data.row : 0)) + 1,
            // The pole vaulter's own head and a bare hand are swapped in.
            spriteOverride: drop.image,
            // Zombie::OverrideParticleColor keeps a chilled zombie's parts blue.
            tint: chilled ? new Color(75, 75, 255, 255) : undefined,
            extraAdditive: chilled,
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
        void player.load(reanim, stage.content.registry, stage.content.loader).then(() => {
            if (node.isValid) player.play({ loop: false, rate, timeSeconds: 0, onFinish: end })
        }).catch(error => {
            end()
            console.error(`[Level] Failed to play ${reanim}`, error)
        })
    }
}

/** Zombie::ApplyBurn's shift for a charred zombie walking right, drawn mirrored. */
const CHARRED_MIRRORED_SHIFT = 60

/** What a zombie's body plays. */
const body = (zombie: ZombieSnapshot) => zombie.animations[ZOMBIE_BODY_LAYER]

/** -1 without the armor or once it is gone, otherwise its damage index (0 whole, 1 below 2/3, 2 below 1/3). */
function armorStage(health: number, armor: { readonly health: number } | undefined): number {
    if (!armor || health <= 0) return -1
    return health < armor.health / 3 ? 2 : health < armor.health * 2 / 3 ? 1 : 0
}
