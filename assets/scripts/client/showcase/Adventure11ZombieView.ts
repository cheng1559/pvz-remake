import { Color, Node, Sprite, SpriteFrame, Vec3 } from 'cc'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import type { ClientContentLoader } from '@/client/content/ClientContentLoader'
import type { ContentRegistry } from '@/client/content/ContentRegistry'
import type { ClientAnimationClip, ClientAnimationRegistry, ZombieAnimationDefinition } from '@/client/content/ClientAnimationRegistry'
import type { ZombieSnapshot } from '@/shared/protocol/index'
import type { Adventure11EntitySnapshotV2 } from './Adventure11PresentationSnapshotV2'

const SLOTS: Record<ZombieSnapshot['animation'], keyof ZombieAnimationDefinition> = {
    anim_walk: 'walk',
    anim_walk2: 'walk2',
    anim_eat: 'eat',
    anim_death: 'death',
    anim_death2: 'death2',
    mowered: 'mowered',
}

export class Adventure11ZombieView {
    readonly shadowNode: Node
    private player: ReanimPlayer | null = null
    private animation: ZombieSnapshot['animation'] | null = null
    private pendingAnimation: ZombieSnapshot['animation'] | null = null
    private loadVersion = 0
    private parts = ''
    private mowerDriver: ReanimPlayer | null = null
    private mowerPending = false

    constructor(
        private readonly node: Node,
        private readonly registry: ContentRegistry,
        private readonly loader: ClientContentLoader,
        private readonly animations: ClientAnimationRegistry,
        shadowParent: Node,
        shadow: SpriteFrame,
        private readonly damagedArm: SpriteFrame,
    ) {
        this.shadowNode = uiNode({
            name: 'ZombieShadow', parent: shadowParent, anchor: { x: 0, y: 1 },
            sprite: { frame: shadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
    }

    sync(zombie: ZombieSnapshot): void {
        this.shadowNode.setPosition(this.node.position.x + 23, this.node.position.y - 92)
        this.shadowNode.active = zombie.state !== 'dying' && zombie.state !== 'mowered'
        this.applyHitFlash(zombie.hitFlashCounter)
        if (zombie.state === 'mowered') {
            this.syncMowered(zombie)
            return
        }
        if (this.animation !== zombie.animation) {
            if (this.pendingAnimation !== zombie.animation) void this.load(zombie)
        }
        else {
            if (this.pendingAnimation) {
                this.pendingAnimation = null
                this.loadVersion++
            }
            this.applyParts(zombie)
            this.applyHitFlash(zombie.hitFlashCounter)
            this.player?.seek(zombie.animationTime / 12 * this.definition(zombie.animation).rateScale)
        }
    }

    getTrackWorldPosition(trackId: string): Vec3 | null {
        return this.player?.getTrackWorldPosition(trackId) ?? null
    }

    destroy(): void {
        if (this.shadowNode.isValid) this.shadowNode.destroy()
    }

    snapshot(entityId: number): Extract<Adventure11EntitySnapshotV2, { kind: 'zombie' }> {
        return {
            kind: 'zombie',
            entityId,
            body: this.player?.snapshot() ?? null,
            mowerDriver: this.mowerDriver?.snapshot() ?? null,
        }
    }

    async restore(snapshot: Extract<Adventure11EntitySnapshotV2, { kind: 'zombie' }>): Promise<void> {
        this.loadVersion++
        this.pendingAnimation = null
        this.player = await this.restorePlayer(this.player, 'ZombieAnimation', snapshot.body)
        this.mowerDriver = await this.restorePlayer(this.mowerDriver, 'MoweredDriver', snapshot.mowerDriver)
        if (snapshot.body?.attachmentTrackId && this.player && this.mowerDriver) {
            this.player.reattachAfterRestore(this.mowerDriver)
        }
        this.animation = snapshot.mowerDriver
            ? 'mowered'
            : snapshot.body
                ? (Object.entries(SLOTS).find(([, slot]) => this.definition(slot).reanimId === snapshot.body!.id)?.[0] as ZombieSnapshot['animation'] | undefined) ?? null
                : null
        this.parts = ''
    }

    private async restorePlayer(
        current: ReanimPlayer | null,
        name: string,
        snapshot: Extract<Adventure11EntitySnapshotV2, { kind: 'zombie' }>['body'],
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
        this.player?.pause()
        const animation = this.definition('mowered')
        if (this.mowerDriver) {
            this.mowerDriver.seek(zombie.animationTime / 12 * animation.rateScale)
            if (this.player) this.player.seek(this.player.snapshot().timeSeconds)
            return
        }
        if (this.mowerPending || !this.player) return
        this.mowerPending = true
        const driver = uiNode({ name: 'MoweredDriver', parent: this.node }).node.addComponent(ReanimPlayer)
        driver.node.setPosition(animation.x, animation.y)
        void driver.load(animation.reanimId, this.registry, this.loader).then(() => {
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
            console.error('[Phase4] Failed to load mowered zombie animation', error)
        }).finally(() => {
            this.mowerPending = false
        })
    }

    private async load(zombie: ZombieSnapshot): Promise<void> {
        const version = ++this.loadVersion
        this.pendingAnimation = zombie.animation
        const animation = this.definition(zombie.animation)
        const animationNode = uiNode({
            name: 'ZombieAnimationPending', parent: this.node, position: { x: animation.x, y: animation.y },
            anchor: { x: 0, y: 1 },
        }).node
        const player = animationNode.addComponent(ReanimPlayer)
        try {
            await player.load(animation.reanimId, this.registry, this.loader)
            if (!animationNode.isValid) return
            if (version !== this.loadVersion) {
                animationNode.destroy()
                return
            }
            const previousPlayer = this.player
            animationNode.name = 'ZombieAnimation'
            this.animation = zombie.animation
            this.pendingAnimation = null
            this.parts = ''
            this.player = player
            player.play({
                loop: zombie.state !== 'dying',
                rate: zombie.animationSpeed * animation.rateScale,
                timeSeconds: zombie.animationTime / 12 * animation.rateScale,
                hideOnFinish: false,
            })
            this.applyParts(zombie)
            this.applyHitFlash(zombie.hitFlashCounter)
            if (previousPlayer?.node.isValid) {
                player.blendFrom(previousPlayer, 0.2)
                previousPlayer.node.destroy()
            }
        } catch (error) {
            if (animationNode.isValid) animationNode.destroy()
            console.error('[Phase4] Failed to load zombie animation', error)
        }
    }

    private applyParts(zombie: ZombieSnapshot): void {
        const signature = `${zombie.hasHead ? 1 : 0}|${zombie.hasArm ? 1 : 0}`
        if (!this.player || signature === this.parts) return
        this.parts = signature
        this.player.setTrackPrefixVisible('anim_head', zombie.hasHead)
        this.player.setTrackPrefixVisible('anim_hair', zombie.hasHead)
        this.player.setTrackPrefixVisible('anim_tongue', zombie.hasHead)
        this.player.setTrackPrefixVisible('Zombie_outerarm_lower', zombie.hasArm)
        this.player.setTrackPrefixVisible('Zombie_outerarm_hand', zombie.hasArm)
        this.player.setTrackSpriteOverride('Zombie_outerarm_upper', zombie.hasArm ? null : this.damagedArm)
    }

    private applyHitFlash(counter: number): void {
        const grayness = Math.min(255, counter * 10)
        this.player?.setExtraAdditiveDraw(
            counter > 0,
            new Color(grayness, grayness, grayness, 255),
        )
    }

    private definition(animation: ZombieSnapshot['animation'] | keyof ZombieAnimationDefinition): ClientAnimationClip {
        const slot = animation in SLOTS ? SLOTS[animation as ZombieSnapshot['animation']] : animation as keyof ZombieAnimationDefinition
        return this.animations.resolve('pvz:normal')[slot]
    }

    private definitionFromReanim(reanimId: string): ClientAnimationClip | undefined {
        return Object.values(this.animations.resolve('pvz:normal')).find(value => value.reanimId === reanimId)
    }
}
