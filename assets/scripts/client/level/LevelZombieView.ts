import { Color, Node, Sprite, SpriteFrame, Vec3 } from 'cc'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import type { ClientContentLoader } from '@/client/content/ClientContentLoader'
import type { ContentRegistry } from '@/client/content/ContentRegistry'
import type { ClientAnimationClip, ClientAnimationRegistry, ZombieAnimationDefinition } from '@/client/content/ClientAnimationRegistry'
import type { ZombieSnapshot } from '@/shared/protocol/index'
import type { LevelEntitySnapshot } from './LevelPresentationSnapshot'

const SLOTS: Record<ZombieSnapshot['animation'], keyof ZombieAnimationDefinition> = {
    anim_walk: 'walk',
    anim_walk2: 'walk2',
    anim_eat: 'eat',
    anim_death: 'death',
    anim_death2: 'death2',
    mowered: 'mowered',
}

export class LevelZombieView {
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

    constructor(
        private readonly node: Node,
        private readonly registry: ContentRegistry,
        private readonly loader: ClientContentLoader,
        private readonly animations: ClientAnimationRegistry,
        shadowParent: Node,
        shadow: SpriteFrame,
        private readonly damagedArm: SpriteFrame,
        private readonly typeId = 'pvz:normal',
    ) {
        this.shadowNode = uiNode({
            name: 'ZombieShadow', parent: shadowParent, anchor: { x: 0, y: 1 },
            sprite: { frame: shadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
    }

    sync(zombie: ZombieSnapshot): void {
        this.holdingFlag = this.typeId === 'pvz:flag' && zombie.hasHead && zombie.state !== 'dying' && zombie.state !== 'mowered'
        uiNode({ node: this.node, opacity: zombie.alpha ?? 255 })
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
        return (trackId === 'Zombie_flag' ? this.flag : this.player)?.getTrackWorldPosition(trackId) ?? null
    }

    syncGameOverWalk(zombie: ZombieSnapshot, ticks: number, y: number): void {
        const player = this.player
        if (!player) return
        const duration = player.lastFrameTimeSeconds
        const rate = this.definition(zombie.animation).rateScale
        const start = zombie.animationTime / 12 * rate
        const time = start + ticks / 100 * zombie.animationSpeed * rate
        const cycleDistance = (player.sampleTrack('_ground', duration)?.x ?? 0) - (player.sampleTrack('_ground', 0)?.x ?? 0)
        const distance = (Math.floor(time / duration) - Math.floor(start / duration)) * cycleDistance
            + (player.sampleTrack('_ground', time % duration)?.x ?? 0) - (player.sampleTrack('_ground', start % duration)?.x ?? 0)
        this.node.setPosition(zombie.x - 400 - distance, 300 - y)
        this.shadowNode.setPosition(this.node.position.x + 23, this.node.position.y - 92)
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
                ? (Object.entries(SLOTS).find(([, slot]) => this.definition(slot).reanimId === snapshot.body!.id)?.[0] as ZombieSnapshot['animation'] | undefined) ?? null
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
            let flag: ReanimPlayer | null = null
            if (this.holdingFlag) {
                const animation = this.animations.resolve('pvz:flag').flag
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
            const previousPlayer = this.player
            if (this.flag?.node.isValid && this.flag.node.parent !== previousPlayer?.node) this.flag.node.destroy()
            animationNode.name = 'ZombieAnimation'
            this.animation = zombie.animation
            this.pendingAnimation = null
            this.parts = ''
            this.player = player
            this.flag = flag
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
            console.error('[Level] Failed to load zombie animation', error)
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
        const signature = `${zombie.hasHead ? 1 : 0}|${zombie.hasArm ? 1 : 0}|${this.holdingFlag ? 1 : 0}`
        if (!this.player || signature === this.parts) return
        this.parts = signature
        if (this.typeId === 'pvz:flag') {
            this.player.setTrackPrefixVisible('anim_innerarm', !this.holdingFlag)
            this.player.setTrackPrefixVisible('Zombie_flaghand', this.holdingFlag)
            this.player.setTrackPrefixVisible('Zombie_innerarm_screendoor', this.holdingFlag)
            if (!this.holdingFlag) this.flag?.hide()
        }
        this.player.setTrackPrefixVisible('anim_head', zombie.hasHead)
        this.player.setTrackPrefixVisible('anim_hair', zombie.hasHead)
        this.player.setTrackPrefixVisible('anim_tongue', zombie.hasHead)
        this.player.setTrackPrefixVisible('Zombie_outerarm_lower', zombie.hasArm)
        this.player.setTrackPrefixVisible('Zombie_outerarm_hand', zombie.hasArm)
        this.player.setTrackSpriteOverride('Zombie_outerarm_upper', zombie.hasArm ? null : this.damagedArm)
    }

    private applyHitFlash(counter: number): void {
        const grayness = Math.min(255, counter * 10)
        this.flag?.setExtraAdditiveDraw(counter > 0, new Color(grayness, grayness, grayness, 255))
        this.player?.setExtraAdditiveDraw(
            counter > 0,
            new Color(grayness, grayness, grayness, 255),
        )
    }

    private definition(animation: ZombieSnapshot['animation'] | keyof ZombieAnimationDefinition): ClientAnimationClip {
        const slot = animation in SLOTS ? SLOTS[animation as ZombieSnapshot['animation']] : animation as keyof ZombieAnimationDefinition
        return this.animations.resolve(this.typeId === 'pvz:flag' ? 'pvz:flag' : 'pvz:normal')[slot]
    }

    private definitionFromReanim(reanimId: string): ClientAnimationClip | undefined {
        return Object.values(this.animations.resolve(this.typeId === 'pvz:flag' ? 'pvz:flag' : 'pvz:normal')).find(value => value.reanimId === reanimId)
    }
}
