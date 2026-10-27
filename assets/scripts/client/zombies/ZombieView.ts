import { Color, Node, Sprite, SpriteFrame, Vec3 } from 'cc'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import type { ClientContentLoader } from '@/client/content/ClientContentLoader'
import type { ContentRegistry } from '@/client/content/ContentRegistry'
import type { ClientAnimationClip, ClientAnimationRegistry, ClientAnimationTarget, PoleVaulterAnimationDefinition, FlagZombieAnimationDefinition } from '@/client/content/ClientAnimationRegistry'
import type { ZombieSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import type { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { LevelEntitySnapshot } from '@/client/level/LevelPresentationSnapshot'
import type { ZombiePresentationDefinition } from '@/shared/content/presentation'

type AnimationSlot = keyof (PoleVaulterAnimationDefinition & FlagZombieAnimationDefinition)
const SLOTS: Record<ZombieSnapshot['animation'], AnimationSlot> = {
    anim_walk: 'walk',
    anim_walk2: 'walk2',
    anim_run: 'run',
    anim_jump: 'jump',
    anim_eat: 'eat',
    anim_death: 'death',
    anim_death2: 'death2',
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
    sync(zombie: ZombieSnapshot, world: WorldSnapshot): void
    snapshot(entityId: number): ZombieViewSnapshot
    restore(snapshot: ZombieViewSnapshot): void | Promise<void>
    getTrackWorldPosition(trackId: string): Vec3 | null
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

    constructor(
        private readonly node: Node,
        private readonly registry: ContentRegistry,
        private readonly loader: ClientContentLoader,
        private readonly animations: ClientAnimationRegistry,
        shadowParent: Node,
        shadow: SpriteFrame,
        private readonly sprites: ZombieViewSprites,
        private readonly presentation: ZombiePresentationDefinition,
        private readonly helm?: { type: 'cone' | 'bucket', health: number },
        /** How far a vault lands ahead of the jump's last frame. */
        private readonly landingOffset = 0,
    ) {
        this.shadowNode = uiNode({
            name: 'ZombieShadow', parent: shadowParent, anchor: { x: 0, y: 1 },
            active: false,
            sprite: { frame: shadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
    }

    sync(zombie: ZombieSnapshot): void {
        this.latestZombie = zombie
        this.holdingFlag = this.presentation.flag === true && zombie.hasHead && zombie.state !== 'dying' && zombie.state !== 'mowered'
        uiNode({ node: this.node, opacity: zombie.alpha ?? 255 })
        this.shadowNode.setPosition(this.node.position.x + this.shadowX, this.node.position.y - 92)
        // Zombie::HasShadow hides it while falling, burned, mowed or vaulting.
        this.shadowNode.active = zombie.state !== 'dying' && zombie.state !== 'mowered' && zombie.state !== 'burned' &&
            zombie.state !== 'vaulting'
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
    }

    getTrackWorldPosition(trackId: string): Vec3 | null {
        return (trackId === 'Zombie_flag' ? this.flag : this.player)?.getTrackWorldPosition(trackId) ?? null
    }

    syncGameOverWalk(zombie: ZombieSnapshot, ticks: number, y: number, approachTicks = 0): void {
        const player = this.player
        if (!player) return
        const duration = player.lastFrameTimeSeconds
        const rate = this.definition(zombie.animation).rateScale
        const start = zombie.animationTime / 12 * rate + approachTicks / 100 * zombie.animationSpeed * rate
        const time = start + ticks / 100 * zombie.animationSpeed * rate
        const cycleDistance = (player.sampleTrack('_ground', duration)?.x ?? 0) - (player.sampleTrack('_ground', 0)?.x ?? 0)
        const distance = (Math.floor(time / duration) - Math.floor(start / duration)) * cycleDistance
            + (player.sampleTrack('_ground', time % duration)?.x ?? 0) - (player.sampleTrack('_ground', start % duration)?.x ?? 0)
        this.node.setPosition(zombie.x - 400 - distance, 300 - y)
        this.shadowNode.setPosition(this.node.position.x + this.shadowX, this.node.position.y - 92)
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
            this.attachFlag(this.flag, this.player, snapshot.flag?.attachmentTrackId ?? 'Zombie_flaghand')
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
            const node = uiNode({
                name, parent: this.node,
                position: definition ? { x: definition.x, y: definition.y } : undefined,
                anchor: { x: 0, y: 1 },
            }).node
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
        driver.node.setPosition(animation.x, animation.y)
        void driver.load(animation.reanimId, this.registry, this.loader).then(() => {
            zombie = this.latestZombie ?? zombie
            if (!driver.node.isValid || zombie.state !== 'mowered') return
            this.mowerDriver = driver
            this.animation = 'mowered'
            this.player?.attachToTrack(driver, animation.attachmentTrackId ?? 'locator')
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
        player.node.setPosition(jump.x + this.landingOffset, jump.y)
    }

    private async load(zombie: ZombieSnapshot): Promise<void> {
        const version = ++this.loadVersion
        // Landing and WalkIntoHouse both use StartWalkAnim(0), without blending the held pole into the walk.
        const landing = (this.animation === 'anim_jump' || this.presentation.vault && this.animation === 'anim_run' && zombie.hasPole === false)
            && (zombie.state === 'walking' || zombie.state === 'eating')
        this.pendingAnimation = zombie.animation
        const animation = this.definition(zombie.animation)
        const animationNode = uiNode({
            name: 'ZombieAnimationPending', parent: this.node, position: { x: animation.x, y: animation.y },
            anchor: { x: 0, y: 1 }, active: false,
        }).node
        const player = animationNode.addComponent(ReanimPlayer)
        try {
            await player.load(animation.reanimId, this.registry, this.loader)
            if (!animationNode.isValid) return
            let flag: ReanimPlayer | null = null
            if (this.holdingFlag) {
                const animation = this.definition('flag')
                flag = uiNode({ name: 'Flag', parent: animationNode, position: animation }).node.addComponent(ReanimPlayer)
                await flag.load(animation.reanimId, this.registry, this.loader)
                if (!animationNode.isValid) return
                this.attachFlag(flag, player, animation.attachmentTrackId ?? 'Zombie_flaghand')
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
            if (latest.state === 'mowered') this.syncMowered(latest)
        } catch (error) {
            if (animationNode.isValid) animationNode.destroy()
            // A zombie eaten or blown up while loading is not an error.
            if (this.node.isValid) console.error('[Level] Failed to load zombie animation', error)
        }
    }

    private attachFlag(flag: ReanimPlayer, body: ReanimPlayer, trackId: string): void {
        flag.node.setParent(body.node)
        flag.node.setPosition(0, 0)
        flag.attachToTrack(body, trackId)
        const arm = body.getTrackNode('Zombie_innerarm_screendoor')
        if (arm) flag.node.setSiblingIndex(arm.getSiblingIndex() + 1)
    }

    private applyParts(zombie: ZombieSnapshot): void {
        const helmStage = this.helmStage(zombie)
        const signature = `${zombie.hasHead ? 1 : 0}|${zombie.hasTongue ? 1 : 0}|${zombie.hasArm ? 1 : 0}|${this.holdingFlag ? 1 : 0}|${helmStage}`
        if (!this.player || signature === this.parts) return
        this.parts = signature
        if (this.presentation.flag) {
            this.player.setTrackPrefixVisible('anim_innerarm', !this.holdingFlag)
            this.player.setTrackPrefixVisible('Zombie_flaghand', this.holdingFlag)
            this.player.setTrackPrefixVisible('Zombie_innerarm_screendoor', this.holdingFlag)
            if (!this.holdingFlag) this.flag?.hide()
        }
        const presentation = this.presentation
        const arm = presentation.arm
        this.player.setTrackPrefixVisible('anim_head', zombie.hasHead)
        // Zombie::ZombieInitialize hides the hair under a helm until DropHelm shows it again.
        this.player.setTrackPrefixVisible('anim_hair', zombie.hasHead && helmStage < 0)
        this.player.setTrackPrefixVisible('anim_tongue', zombie.hasHead && zombie.hasTongue)
        // Zombie::DropPole: losing the head also drops the pole and the hand that holds it.
        for (const track of presentation.heldTracks ?? []) {
            this.player.setTrackPrefixVisible(track, zombie.hasHead)
        }
        this.player.setTrackPrefixVisible(arm.lower, zombie.hasArm)
        this.player.setTrackPrefixVisible(arm.hand, zombie.hasArm)
        this.player.setTrackSpriteOverride(arm.upper, zombie.hasArm ? null
            : this.sprites[presentation.damagedArm])
        const helm = presentation.helm
        for (const track of presentation.helmTracks) {
            const worn = helm?.track === track && helmStage >= 0
            this.player.setTrackPrefixVisible(track, worn)
            // Zombie::TakeHelmDamage swaps in the dented helm below 2/3 and 1/3 health.
            if (worn) this.player.setTrackSpriteOverride(track, helmStage === 0 ? null : this.sprites.helms[helm.damagedSprites[helmStage - 1]])
        }
    }

    /** -1 without a helm, otherwise its damage index. */
    private helmStage(zombie: ZombieSnapshot): number {
        const health = zombie.helmHealth ?? 0
        if (!this.helm || health <= 0) return -1
        return health < this.helm.health / 3 ? 2 : health < this.helm.health * 2 / 3 ? 1 : 0
    }

    private color: 'normal' | 'chilled' | 'burned' = 'normal'

    /** Zombie::DrawShadow: the pole vaulter's shadow sits 5px further left. */
    private get shadowX(): number {
        return this.presentation.shadowX
    }

    /** Zombie::DrawReanim tints chilled zombies blue and burned ones black. */
    private applyColor(zombie: ZombieSnapshot, force = false): void {
        const color = zombie.state === 'burned' ? 'burned' : zombie.chilled ? 'chilled' : 'normal'
        if (!this.player || color === this.color && !force) return
        this.color = color
        const value = color === 'burned' ? new Color(0, 0, 0) : color === 'chilled' ? new Color(75, 75, 255) : Color.WHITE
        this.player.setColorOverride(value)
        this.flag?.setColorOverride(value)
    }

    private applyHitFlash(zombie: ZombieSnapshot): void {
        const cold = zombie.chilled === true && zombie.state !== 'burned'
        const grayness = Math.min(255, zombie.hitFlashCounter * 10)
        // DrawReanim adds the cold tint and then adds the hit highlight on top of it.
        const color = new Color(Math.min(255, grayness + (cold ? 75 : 0)),
            Math.min(255, grayness + (cold ? 75 : 0)), cold ? 255 : grayness, 255)
        const enabled = cold || zombie.hitFlashCounter > 0
        this.flag?.setExtraAdditiveDraw(enabled, color)
        this.player?.setExtraAdditiveDraw(enabled, color)
    }

    private definition(animation: ZombieSnapshot['animation'] | AnimationSlot): ClientAnimationClip {
        const slot = animation in SLOTS ? SLOTS[animation as ZombieSnapshot['animation']] : animation as AnimationSlot
        const clip = this.clips()[slot]
        if (!clip) throw new Error(`${this.target} has no ${slot} animation`)
        return clip
    }

    private clips(): Partial<Record<AnimationSlot, ClientAnimationClip>> {
        return this.animations.resolve(this.target) as Partial<Record<AnimationSlot, ClientAnimationClip>>
    }

    private definitionFromReanim(reanimId: string): ClientAnimationClip | undefined {
        return Object.values(this.clips()).find(value => value?.reanimId === reanimId)
    }

    /** Mod zombies without their own animations use the plain body. */
    private get target(): ClientAnimationTarget {
        return this.presentation.animationTarget
    }
}
