import { Color, Sprite } from 'cc'
import { randomAnimationRate } from '@/client/content/ClientAnimationRegistry'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import type { PlantView, PlantViewContext, PlantViewSnapshot } from './PlantView'
import type { ClientAnimationTarget } from '@/client/content/ClientAnimationRegistry'
import { plantDefinition } from './definitions'

export class ShooterView implements PlantView {
    private blinkAtTick: number

    private constructor(
        private readonly context: PlantViewContext,
        private readonly animationTarget: ClientAnimationTarget,
        private readonly body: ReanimPlayer,
        private readonly idleHead: ReanimPlayer,
        private readonly shootHead: ReanimPlayer,
        private readonly blink: ReanimPlayer,
        private idleRate: number,
        tick: number,
    ) { this.blinkAtTick = tick + this.context.animations.nextPlantBlinkTicks() }

    static async create(context: PlantViewContext): Promise<ShooterView> {
        const { node, content, animations: registry, assets, plant, tick } = context
        const presentation = plantDefinition(registry.definitions, plant.typeId)
        const animationTarget = presentation.animationTarget!
        const animations = registry.resolve(animationTarget)
        uiNode({
            name: 'PlantShadow', parent: node, position: { ...presentation.shadow, z: -1 }, anchor: { x: 0, y: 1 },
            sprite: { frame: assets.shadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
        })
        const body = uiNode({ name: 'Body', parent: node, position: animations.body }).node.addComponent(ReanimPlayer)
        const idleHead = uiNode({ name: 'IdleHead', parent: node, position: animations.idleHead }).node.addComponent(ReanimPlayer)
        const shootHead = uiNode({ name: 'ShootHead', parent: node, position: animations.shootHead }).node.addComponent(ReanimPlayer)
        const blink = uiNode({ name: 'Blink', parent: node, position: animations.blink }).node.addComponent(ReanimPlayer)
        await Promise.all([
            body.load(animations.body.reanimId, content.registry, content.loader),
            idleHead.load(animations.idleHead.reanimId, content.registry, content.loader),
            shootHead.load(animations.shootHead.reanimId, content.registry, content.loader),
            blink.load(animations.blink.reanimId, content.registry, content.loader),
        ])
        if (!node.isValid) return new ShooterView(context, animationTarget, body, idleHead, shootHead, blink, 1, tick)
        idleHead.attachToTrack(body, animations.idleHead.attachmentTrackId ?? 'anim_stem')
        shootHead.attachToTrack(body, animations.shootHead.attachmentTrackId ?? 'anim_stem')
        blink.attachToTrack(idleHead, animations.blink.attachmentTrackId ?? 'anim_face')
        const idleRate = randomAnimationRate(registry.rates.shooterIdle) / 12
        body.play({ loop: true, rate: idleRate * animations.body.rateScale })
        idleHead.play({ loop: true, rate: idleRate * animations.idleHead.rateScale })
        shootHead.hide()
        blink.hide()
        return new ShooterView(context, animationTarget, body, idleHead, shootHead, blink, idleRate, tick)
    }

    fire(): void {
        this.blink.hide()
        // StartBlend records the visible pose before SetFramesForLayer resets playback.
        this.shootHead.blendFrom(this.shootHead.snapshot().visible ? this.shootHead : this.idleHead, 0.2)
        this.shootHead.play({
            loop: false, rate: 35 / 12 * this.context.animations.resolve(this.animationTarget).shootHead.rateScale,
            timeSeconds: 0, hideOnFinish: false,
            onFinish: () => this.finishShoot(),
        })
        this.idleHead.hide()
    }

    private finishShoot(): void {
        this.idleHead.blendFrom(this.shootHead, 0.2)
        this.idleHead.play({
            loop: true, rate: this.idleRate * this.context.animations.resolve(this.animationTarget).idleHead.rateScale,
            timeSeconds: this.body.snapshot().timeSeconds,
        })
        this.shootHead.hide()
    }

    sync(plant: PlantSnapshot, world: WorldSnapshot, _particle: unknown, upgradeTarget: boolean): void {
        const eatenFlashCounter = plant.eatenFlashCounter, tick = world.gameplayTick
        const grayness = Math.min(255, eatenFlashCounter * 3)
        const color = new Color(grayness, grayness, grayness, 255)
        for (const player of [this.body, this.idleHead, this.shootHead, this.blink]) {
            player.setColorOverride(upgradeTarget ? upgradeFlashColor(tick) : Color.WHITE)
            player.setExtraAdditiveDraw(eatenFlashCounter > 0, color)
        }
        if (tick >= this.blinkAtTick) {
            this.blinkAtTick = tick + this.context.animations.nextPlantBlinkTicks()
            if (!this.shootHead.snapshot().playing) this.blink.play({
                loop: false, rate: 15 / 12 * this.context.animations.resolve(this.animationTarget).blink.rateScale, timeSeconds: 0,
            })
        }
        if (this.shootHead.snapshot().playing || this.idleHead.snapshot().playing) return
        this.idleHead.play({
            loop: true, rate: this.idleRate * this.context.animations.resolve(this.animationTarget).idleHead.rateScale,
            timeSeconds: this.body.snapshot().timeSeconds,
        })
    }

    snapshot(entityId: number): PlantViewSnapshot {
        return { kind: 'plant', entityId, idleRate: this.idleRate, blinkAtTick: this.blinkAtTick,
            animations: { body: this.body.snapshot(), idleHead: this.idleHead.snapshot(),
                shootHead: this.shootHead.snapshot(), blink: this.blink.snapshot() } }
    }

    restore(snapshot: PlantViewSnapshot): void {
        const { body, idleHead, shootHead, blink } = snapshot.animations
        if (!idleHead || !shootHead || !blink || snapshot.idleRate === undefined || snapshot.blinkAtTick === undefined) {
            throw new Error(`Missing shooter animation state for plant ${snapshot.entityId}`)
        }
        this.idleRate = snapshot.idleRate
        this.body.restore(body)
        this.idleHead.restore(idleHead)
        this.shootHead.restore(shootHead)
        this.blink.restore(blink)
        this.blinkAtTick = snapshot.blinkAtTick
        if (idleHead.attachmentTrackId) this.idleHead.reattachAfterRestore(this.body)
        if (shootHead.attachmentTrackId) this.shootHead.reattachAfterRestore(this.body)
        if (blink.attachmentTrackId) this.blink.reattachAfterRestore(this.idleHead)
        if (shootHead.playing) this.shootHead.setOnFinish(() => this.finishShoot())
    }
}

function upgradeFlashColor(tick: number): Color {
    const age = tick % 90
    const gray = Math.min(255, Math.trunc(200 * Math.abs(45 - age) / 45) + 55)
    return new Color(gray, gray, gray, 255)
}
