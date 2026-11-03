import { Color, Mask, Node, Sprite, SpriteFrame, Vec3 } from 'cc'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import type { ClientContentLoader } from '@/client/content/ClientContentLoader'
import type { ContentRegistry } from '@/client/content/ContentRegistry'
import type { ClientAnimationClip, ClientAnimationRegistry, ClientAnimationTarget, PoleVaulterAnimationDefinition, FlagZombieAnimationDefinition } from '@/client/content/ClientAnimationRegistry'
import type { ZombieSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import type { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { LevelEntitySnapshot } from '@/client/level/LevelPresentationSnapshot'
import { attachmentTrack, type ZombiePresentationDefinition } from '@/shared/content/presentation'
import type { ZombieDefinition } from '@/shared/content/gameplay'
import { EntityAttachments } from '@/client/view/EntityAttachments'
import type { ZombieFlash } from '@/client/level/EntityFlashes'
import { MIND_CONTROLLED_RGB, MIRRORED_SHIFT, zombiePartVisibility } from './zombieParts'

type AnimationSlot = keyof (PoleVaulterAnimationDefinition & FlagZombieAnimationDefinition)
const SLOTS: Record<ZombieSnapshot['animation'], AnimationSlot> = {
    anim_walk: 'walk',
    anim_walk2: 'walk2',
    anim_run: 'run',
    anim_jump: 'jump',
    anim_eat: 'eat',
    anim_gasp: 'gasp',
    anim_death: 'death',
    anim_death2: 'death2',
    anim_superlongdeath: 'superLongDeath',
    mowered: 'mowered',
}

/** Sprites a zombie swaps in as it takes damage. */
export interface ZombieViewSprites {
    damagedArm: SpriteFrame
    poleVaulterDamagedArm: SpriteFrame
    helms: Record<string, SpriteFrame>
}

export interface ZombieViewContext {
    node: Node
    /** The zombie's attachment list: register flags, marks and other attached effects here. */
    attachments: EntityAttachments
    shadowParent: Node
    content: Awaited<ReturnType<typeof loadIntegratedGameContent>>
    animations: ClientAnimationRegistry
    assets: { shadow: SpriteFrame, sprites: ZombieViewSprites }
    zombie: ZombieSnapshot
    tick: number
}

export type ZombieViewSnapshot = Extract<LevelEntitySnapshot, { kind: 'zombie' }>
export interface ZombieViewInstance {
    readonly shadowNode: Node
    /** `flash`: the hit flash (Zombie::mJustGotShotCounter), from the client's EntityFlashes. */
    sync(zombie: ZombieSnapshot, world: WorldSnapshot, flash: ZombieFlash): void
    snapshot(entityId: number): ZombieViewSnapshot
    restore(snapshot: ZombieViewSnapshot): void | Promise<void>
    getTrackWorldPosition(trackId: string): Vec3 | null
    /** The helm or shield broke from a hit that leaves the body, so its drop effects play. */
    armorDropped?(slot: 'helm' | 'shield'): void
    syncGameOverWalk(zombie: ZombieSnapshot, ticks: number, y: number, approachTicks?: number): void
    destroy(): void
}

export class ZombieView implements ZombieViewInstance {
    readonly shadowNode: Node
    private player: ReanimPlayer | null = null
    private animation: ZombieSnapshot['animation'] | null = null
    private pendingAnimation: ZombieSnapshot['animation'] | null = null
    private loadVersion = 0
    private parts = ''
    private mowerDriver: ReanimPlayer | null = null
    private mowerPending = false
    private flag: ReanimPlayer | null = null
    private holdingFlag = false
    private latestZombie: ZombieSnapshot | null = null
    private flash: ZombieFlash = { flash: 0, through: false }
    private riseClip?: Node

    constructor(
        private readonly node: Node,
        private readonly registry: ContentRegistry,
        private readonly loader: ClientContentLoader,
        private readonly animations: ClientAnimationRegistry,
        shadowParent: Node,
        shadow: SpriteFrame,
        private readonly sprites: ZombieViewSprites,
        private readonly presentation: ZombiePresentationDefinition,
        /** Whose clips it plays: its own, or another's (a Mod zombie on the plain body). */
        private readonly target: ClientAnimationTarget,
        /** The gameplay helm and shield, for their full health. */
        private readonly armor: Pick<ZombieDefinition, 'helm' | 'shield'> = {},
        /** How far a vault lands ahead of the jump's last frame. */
        private readonly landingOffset = 0,
        private readonly attachments = new EntityAttachments(),
    ) {
        this.shadowNode = uiNode({
            name: 'ZombieShadow', parent: shadowParent, anchor: { x: 0, y: 1 },
            active: false,
            sprite: { frame: shadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
    }

    sync(zombie: ZombieSnapshot, _world: WorldSnapshot, flash: ZombieFlash): void {
        this.latestZombie = zombie
        this.flash = flash
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
        this.holdingFlag = this.presentation.flag === true && zombie.hasHead && zombie.state !== 'dying' && zombie.state !== 'mowered'
        uiNode({ node: this.node, opacity: zombie.alpha ?? 255 })
        this.shadowNode.setPosition(this.node.position.x + this.shadowX, this.node.position.y - (this.presentation.shadowY ?? 92))
        // Zombie::HasShadow hides it while falling, burned, mowed or vaulting.
        this.shadowNode.active = zombie.state !== 'dying' && zombie.state !== 'mowered' && zombie.state !== 'burned' &&
            zombie.state !== 'vaulting' && !zombie.riseTicks
        this.applyHitFlash(zombie)
        this.applyColor(zombie)
        if (zombie.state === 'mowered') {
            this.syncMowered(zombie)
            return
        }
        if (this.animation !== zombie.animation) {
            // The server moved the zombie to its landing spot; hold the last jump frame there until the walk loads.
            if (this.animation === 'anim_jump' && this.player && (zombie.state === 'walking' || zombie.state === 'eating')) {
                this.holdLandingPose()
            }
            if (this.pendingAnimation !== zombie.animation) void this.load(zombie)
        }
        else {
            if (this.pendingAnimation) {
                this.pendingAnimation = null
                this.loadVersion++
            }
            this.applyParts(zombie)
            this.player?.seek(zombie.animationTime / 12 * this.definition(zombie.animation).rateScale)
        }
        this.syncRise(zombie)
    }

    private syncRise(zombie: ZombieSnapshot): void {
        // Only the grave-rise clip owns this offset; a pending landing keeps its jump-origin compensation.
        if (!this.player || !this.riseClip) return
        const clip = this.definition(zombie.animation)
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
        return (this.flag?.trackIds.includes(trackId) ? this.flag : this.player)?.getTrackWorldPosition(trackId) ?? null
    }

    syncGameOverWalk(zombie: ZombieSnapshot, ticks: number, y: number, approachTicks = 0): void {
        const player = this.player
        if (!player) return
        const duration = player.lastFrameTimeSeconds
        const rate = this.definition(zombie.animation).rateScale
        const start = zombie.animationTime / 12 * rate + approachTicks / 100 * zombie.animationSpeed * rate
        const time = start + ticks / 100 * zombie.animationSpeed * rate
        const ground = this.presentation.parts.ground
        const cycleDistance = (player.sampleTrack(ground, duration)?.x ?? 0) - (player.sampleTrack(ground, 0)?.x ?? 0)
        const distance = (Math.floor(time / duration) - Math.floor(start / duration)) * cycleDistance
            + (player.sampleTrack(ground, time % duration)?.x ?? 0) - (player.sampleTrack(ground, start % duration)?.x ?? 0)
        this.node.setPosition(zombie.x - 400 - distance, 300 - y)
        this.shadowNode.setPosition(this.node.position.x + this.shadowX, this.node.position.y - (this.presentation.shadowY ?? 92))
        player.seek(time % duration)
    }

    destroy(): void {
        if (this.shadowNode.isValid) this.shadowNode.destroy()
    }

    snapshot(entityId: number): Extract<LevelEntitySnapshot, { kind: 'zombie' }> {
        return {
            kind: 'zombie',
            entityId,
            body: this.player?.snapshot() ?? null,
            mowerDriver: this.mowerDriver?.snapshot() ?? null,
            ...(this.flag ? { flag: this.flag.snapshot() } : {}),
        }
    }

    async restore(snapshot: Extract<LevelEntitySnapshot, { kind: 'zombie' }>): Promise<void> {
        this.loadVersion++
        this.pendingAnimation = null
        this.player = await this.restorePlayer(this.player, 'ZombieAnimation', snapshot.body)
        this.mowerDriver = await this.restorePlayer(this.mowerDriver, 'MoweredDriver', snapshot.mowerDriver)
        this.flag = await this.restorePlayer(this.flag, 'Flag', snapshot.flag ?? null)
        if (this.flag && this.player) {
            this.attachFlag(this.flag, this.player, snapshot.flag?.attachmentTrackId ?? attachmentTrack(this.definition('flag')))
        }
        if (snapshot.body?.attachmentTrackId && this.player && this.mowerDriver) {
            this.player.reattachAfterRestore(this.mowerDriver)
        }
        this.animation = snapshot.mowerDriver
            ? 'mowered'
            : snapshot.body
                ? (Object.entries(SLOTS).find(([, slot]) => this.clips()[slot]?.reanimId === snapshot.body!.id)?.[0] as ZombieSnapshot['animation'] | undefined) ?? null
                : null
        this.parts = ''
    }

    private async restorePlayer(
        current: ReanimPlayer | null,
        name: string,
        snapshot: Extract<LevelEntitySnapshot, { kind: 'zombie' }>['body'],
    ): Promise<ReanimPlayer | null> {
        if (!snapshot) {
            if (current?.node.isValid) current.node.destroy()
            return null
        }
        let player = current
        if (!player || !player.node.isValid || player.snapshot().id !== snapshot.id) {
            if (player?.node.isValid) player.node.destroy()
            const definition = this.definitionFromReanim(snapshot.id)
            const node = uiNode({ name, parent: this.node, anchor: { x: 0, y: 1 } }).node
            if (definition) this.place(node, definition.x, definition.y)
            player = node.addComponent(ReanimPlayer)
            await player.load(snapshot.id, this.registry, this.loader)
        }
        player.restore(snapshot)
        return player
    }

    private syncMowered(zombie: ZombieSnapshot): void {
        // Landing and mowing can happen in one tick, with no walking snapshot between them.
        if (this.presentation.vault && !zombie.hasPole &&
            (!this.player || this.animation === 'anim_jump' || this.pendingAnimation === 'anim_jump')) {
            if (this.animation === 'anim_jump') this.holdLandingPose()
            if (this.pendingAnimation !== 'anim_walk') void this.load({ ...zombie, animation: 'anim_walk', animationTime: 0 })
            return
        }
        // A pending walk/eat load must not replace the body once it is attached to the mower driver.
        if (this.pendingAnimation && this.player) {
            this.pendingAnimation = null
            this.loadVersion++
        }
        this.flag?.hide()
        this.applyParts(zombie)
        this.player?.pause()
        const animation = this.definition('mowered')
        if (this.mowerDriver) {
            this.mowerDriver.seek(zombie.animationTime / 12 * animation.rateScale)
            if (this.player) this.player.seek(this.player.snapshot().timeSeconds)
            this.flag?.seek(this.flag.snapshot().timeSeconds)
            return
        }
        if (this.mowerPending || !this.player) return
        this.mowerPending = true
        const driver = uiNode({ name: 'MoweredDriver', parent: this.node }).node.addComponent(ReanimPlayer)
        this.place(driver.node, animation.x, animation.y)
        void driver.load(animation.reanimId, this.registry, this.loader).then(() => {
            zombie = this.latestZombie ?? zombie
            if (!driver.node.isValid || zombie.state !== 'mowered') return
            this.mowerDriver = driver
            this.animation = 'mowered'
            this.player?.attachToTrack(driver, attachmentTrack(animation))
            driver.play({
                loop: false, rate: zombie.animationSpeed * animation.rateScale,
                timeSeconds: zombie.animationTime / 12 * animation.rateScale, hideOnFinish: false,
            })
            driver.pause()
        }).catch(error => {
            if (driver.node.isValid) driver.node.destroy()
            console.error('[Level] Failed to load mowered zombie animation', error)
        }).finally(() => {
            this.mowerPending = false
        })
    }

    private holdLandingPose(): void {
        const jump = this.definition('anim_jump')
        const player = this.player!
        player.pause()
        player.seek(player.lastFrameTimeSeconds)
        // The vault lands `landingOffset` ahead, the way the zombie faces; the held last frame stays where the jump ended.
        this.place(player.node, jump.x + (this.mirrored ? -1 : 1) * this.landingOffset, jump.y)
    }

    private async load(zombie: ZombieSnapshot): Promise<void> {
        const version = ++this.loadVersion
        // Landing and WalkIntoHouse both use StartWalkAnim(0), without blending the held pole into the walk.
        const landing = (this.animation === 'anim_jump' || this.presentation.vault && this.animation === 'anim_run' && zombie.hasPole === false)
            && (zombie.state === 'walking' || zombie.state === 'eating')
        this.pendingAnimation = zombie.animation
        const animation = this.definition(zombie.animation)
        const animationNode = uiNode({
            name: 'ZombieAnimationPending', parent: this.node, anchor: { x: 0, y: 1 }, active: false,
        }).node
        this.place(animationNode, animation.x, animation.y)
        const player = animationNode.addComponent(ReanimPlayer)
        try {
            await player.load(animation.reanimId, this.registry, this.loader)
            if (!animationNode.isValid) return
            let flag: ReanimPlayer | null = null
            if (this.holdingFlag) {
                const animation = this.definition('flag')
                flag = uiNode({ name: 'Flag', parent: animationNode, position: animation }).node.addComponent(ReanimPlayer)
                this.attachments.add(flag.node)
                await flag.load(animation.reanimId, this.registry, this.loader)
                if (!animationNode.isValid) return
                this.attachFlag(flag, player, attachmentTrack(animation))
                flag.play({ loop: true, rate: 15 / 12 * animation.rateScale })
            }
            if (version !== this.loadVersion) {
                animationNode.destroy()
                return
            }
            const latest = this.latestZombie ?? zombie
            // Freeze the requested body pose; the mower's animation/time belong to its driver.
            zombie = latest.state === 'mowered'
                ? { ...latest, animation: zombie.animation, animationTime: zombie.animationTime }
                : latest
            const previousPlayer = this.player
            if (this.flag?.node.isValid && this.flag.node.parent !== previousPlayer?.node) this.flag.node.destroy()
            animationNode.name = 'ZombieAnimation'
            this.animation = zombie.animation
            this.pendingAnimation = null
            this.parts = ''
            this.player = player
            this.flag = flag
            player.play({
                loop: zombie.state !== 'dying' && zombie.state !== 'vaulting',
                rate: zombie.animationSpeed * animation.rateScale,
                timeSeconds: zombie.animationTime / 12 * animation.rateScale,
                hideOnFinish: false,
            })
            this.applyParts(zombie)
            this.applyHitFlash(zombie)
            this.applyColor(zombie, true)
            if (previousPlayer?.node.isValid) {
                if (!landing && latest.state !== 'mowered') player.blendFrom(previousPlayer, 0.2)
                previousPlayer.node.active = false
                previousPlayer.node.destroy()
            }
            animationNode.active = true
            this.syncRise(zombie)
            if (latest.state === 'mowered') this.syncMowered(latest)
        } catch (error) {
            if (animationNode.isValid) animationNode.destroy()
            // A zombie eaten or blown up while loading is not an error.
            if (this.node.isValid) console.error('[Level] Failed to load zombie animation', error)
        }
    }

    private attachFlag(flag: ReanimPlayer, body: ReanimPlayer, trackId: string): void {
        // The flag is drawn between its hand track and the arm gripping the pole.
        body.drawAfterTrack(flag.node, trackId)
        flag.node.setPosition(0, 0)
        flag.attachToTrack(body, trackId)
    }

    private applyParts(zombie: ZombieSnapshot): void {
        const helmStage = armorStage(zombie.helmHealth, this.armor.helm), shieldStage = armorStage(zombie.shieldHealth, this.armor.shield)
        // Zombie::ShowDoorArms: an eating zombie lowers the shield arms; a dropped shield takes them away for good.
        const holdingShield = shieldStage >= 0 && zombie.state !== 'eating'
        const signature = `${zombie.hasHead ? 1 : 0}|${zombie.hasTongue ? 1 : 0}|${zombie.hasArm ? 1 : 0}|${this.holdingFlag ? 1 : 0}|${helmStage}|${shieldStage}|${holdingShield ? 1 : 0}`
        if (!this.player || signature === this.parts) return
        this.parts = signature
        const presentation = this.presentation, parts = presentation.parts
        const state = { hasHead: zombie.hasHead, hasTongue: zombie.hasTongue, hasArm: zombie.hasArm, holdingFlag: this.holdingFlag, helmStage, shieldStage, holdingShield }
        for (const [tracks, visible] of zombiePartVisibility(presentation, state)) this.player.setTracksVisible(tracks, visible)
        if (parts.flagArm && !this.holdingFlag) this.flag?.hide()
        this.player.setTrackSpriteOverride(parts.upperArm, zombie.hasArm ? null
            : presentation.damagedArmSprite ? this.sprites.helms[presentation.damagedArmSprite] : this.sprites[presentation.damagedArm])
        const enraged = presentation.enragedHead
        if (enraged) this.player.setTrackSpriteOverride(enraged.track, zombie.enraged && zombie.animation !== 'anim_gasp' ? this.sprites.helms[enraged.sprite] : null)
        // Zombie::TakeHelmDamage and TakeShieldDamage swap in the dented sprite below 2/3 and 1/3 health.
        for (const [armor, stage] of [[presentation.helm, helmStage], [presentation.shield, shieldStage]] as const) {
            if (!armor || stage < 0 || !parts.helms.includes(armor.track)) continue
            this.player.setTrackSpriteOverride(armor.track, stage === 0 ? null : this.sprites.helms[armor.damagedSprites[stage - 1]])
        }
    }

    private color: 'normal' | 'chilled' | 'burned' | 'mindControlled' = 'normal'
    /** Zombie::IsWalkingBackwards: a zombie on the plants' side faces right. */
    private mirrored = false

    /** Zombie::DrawShadow offset in the original board coordinates, which differs for a zombie walking right. */
    private get shadowX(): number {
        return this.mirrored ? this.presentation.shadowXBackwards ?? this.presentation.shadowX : this.presentation.shadowX
    }

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

    /**
     * Zombie::DrawReanim tints chilled zombies blue, burned ones black and mind-controlled ones ZOMBIE_MINDCONTROLLED_COLOR
     * (with the same color added, in applyHitFlash).
     */
    private applyColor(zombie: ZombieSnapshot, force = false): void {
        const color = zombie.state === 'burned' ? 'burned' : zombie.mindControlled ? 'mindControlled' : zombie.chilled ? 'chilled' : 'normal'
        if (!this.player || color === this.color && !force) return
        this.color = color
        const value = color === 'burned' ? new Color(0, 0, 0) : color === 'mindControlled' ? mindControlledColor()
            : color === 'chilled' ? new Color(75, 75, 255) : Color.WHITE
        // The flag is attached to the hand track, so it takes the body's colors.
        this.player.setColorOverride(value)
    }

    private applyHitFlash(zombie: ZombieSnapshot): void {
        const cold = zombie.chilled === true && zombie.state !== 'burned'
        const shield = (zombie.shieldHealth ?? 0) > 0 ? this.presentation.shield : undefined
        // TakeShieldDamage flashes only the shield, unless the hit also reached the body (the Fume-shroom).
        const { flash, through } = this.flash
        const bodyFlash = shield && !through ? 0 : flash
        const grayness = Math.min(255, bodyFlash * 10)
        // DrawReanim adds the cold tint and then adds the hit highlight on top of it.
        const color = new Color(Math.min(255, grayness + (cold ? 75 : 0)),
            Math.min(255, grayness + (cold ? 75 : 0)), cold ? 255 : grayness, 255)
        const mindControlled = zombie.mindControlled === true && zombie.state !== 'burned'
        const enabled = cold || bodyFlash > 0 || mindControlled
        this.player?.setExtraAdditiveDraw(enabled, mindControlled ? mindControlledColor() : color)
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

    private definition(animation: ZombieSnapshot['animation'] | AnimationSlot): ClientAnimationClip {
        const slot = animation in SLOTS ? SLOTS[animation as ZombieSnapshot['animation']] : animation as AnimationSlot
        const enraged = this.latestZombie?.enraged
        const clips = this.clips()
        // A zombie drawn without `superLongDeath` (anim_superlongdeath) falls with its `death`.
        const clip = clips[enraged && (slot === 'walk' || slot === 'walk2') ? 'enragedWalk'
            : enraged && slot === 'eat' ? 'enragedEat' : slot] ?? (slot === 'superLongDeath' ? clips.death : undefined)
        if (!clip) throw new Error(`${this.target} has no ${slot} animation`)
        return clip
    }

    private clips(): Partial<Record<AnimationSlot, ClientAnimationClip>> {
        return this.animations.resolve(this.target) as Partial<Record<AnimationSlot, ClientAnimationClip>>
    }

    private definitionFromReanim(reanimId: string): ClientAnimationClip | undefined {
        return Object.values(this.clips()).find(value => value?.reanimId === reanimId)
    }

}

const mindControlledColor = (): Color => new Color(...MIND_CONTROLLED_RGB, 255)

/** -1 without the armor or once it is gone, otherwise its damage index (0 whole, 1 below 2/3, 2 below 1/3). */
function armorStage(health: number | undefined, armor: { readonly health: number } | undefined): number {
    if (!armor || !health || health <= 0) return -1
    return health < armor.health / 3 ? 2 : health < armor.health * 2 / 3 ? 1 : 0
}
