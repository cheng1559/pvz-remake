import { Color, Sprite } from 'cc'
import { randomAnimationRate } from '@/client/content/ClientAnimationRegistry'
import { attachmentTrack } from '@/shared/content/presentation'
import { ReanimPlayer, ReanimRepository } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import type { PlantView, PlantViewContext, PlantViewSnapshot } from './PlantView'
import type { ClientAnimationTarget } from '@/client/content/ClientAnimationRegistry'
import { plantDefinition } from './definitions'

/**
 * A plant whose head shoots on its stem: the body, the head attached to it, which idles and shoots (two clips it
 * changes between in place), and the blink over its face.
 */
export class ShooterView implements PlantView {
    private blinkAtTick: number

    private constructor(
        private readonly context: PlantViewContext,
        private readonly animationSource: ClientAnimationTarget,
        private readonly body: ReanimPlayer,
        private readonly head: ReanimPlayer,
        private readonly blink: ReanimPlayer,
        private idleRate: number,
        tick: number,
    ) { this.blinkAtTick = tick + this.context.animations.nextPlantBlinkTicks() }

    static async create(context: PlantViewContext): Promise<ShooterView> {
        const { node, content, animations: registry, assets, plant, tick } = context
        const presentation = plantDefinition(registry.definitions, plant.typeId)
        const animationSource = registry.sourceOf(plant.typeId)
        const animations = registry.resolve(animationSource)
        uiNode({
            name: 'PlantShadow', parent: node, position: { ...presentation.shadow, z: -1 }, anchor: { x: 0, y: 1 },
            sprite: { frame: assets.shadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
        })
        const body = uiNode({ name: 'Body', parent: node, position: animations.body }).node.addComponent(ReanimPlayer)
        const head = uiNode({ name: 'Head', parent: node }).node.addComponent(ReanimPlayer)
        const blink = uiNode({ name: 'Blink', parent: node, position: animations.blink }).node.addComponent(ReanimPlayer)
        await Promise.all([
            body.load(animations.body.reanimId, content.registry, content.loader),
            blink.load(animations.blink.reanimId, content.registry, content.loader),
            new ReanimRepository(content.registry, content.loader).prepare([animations.idleHead.reanimId, animations.shootHead.reanimId]),
        ])
        const view = new ShooterView(context, animationSource, body, head, blink, randomAnimationRate(registry.rates.shooterIdle) / 12, tick)
        if (!node.isValid) return view
        body.play({ loop: true, rate: view.idleRate * animations.body.rateScale })
        view.idle(0)
        blink.attachToTrack(head, attachmentTrack(animations.blink))
        blink.hide()
        return view
    }

    private get clips() { return this.context.animations.resolve(this.animationSource) }

    private get shooting(): boolean { return this.head.loadedId === this.clips.shootHead.reanimId && this.head.snapshot().playing }

    /** The head changes to a clip where it is, on the stem that clip names, blending from the pose it had. */
    private show(clip: 'idleHead' | 'shootHead', blend: number): void {
        const animation = this.clips[clip]
        this.head.change(animation.reanimId, this.context.content.registry, blend)
        this.head.node.setPosition(animation.x, animation.y)
        this.head.attachToTrack(this.body, attachmentTrack(animation))
    }

    private idle(blend: number): void {
        this.show('idleHead', blend)
        this.head.play({ loop: true, rate: this.idleRate * this.clips.idleHead.rateScale, timeSeconds: this.body.snapshot().timeSeconds })
    }

    fire(): void {
        this.blink.hide()
        // StartBlend records the visible pose before SetFramesForLayer resets playback: a repeated shot blends from the last.
        this.show('shootHead', 0.2)
        this.head.play({
            loop: false, rate: 35 / 12 * this.clips.shootHead.rateScale, timeSeconds: 0, hideOnFinish: false,
            onFinish: () => this.idle(0.2),
        })
    }

    sync(_plant: PlantSnapshot, world: WorldSnapshot, _particle: unknown, upgradeTarget: boolean, eatenFlashCounter: number): void {
        const tick = world.gameplayTick
        const grayness = Math.min(255, eatenFlashCounter * 3)
        const color = new Color(grayness, grayness, grayness, 255)
        // The head attaches to the stem and the blink to the head, so the body's colors reach them all.
        this.body.setColorOverride(upgradeTarget ? upgradeFlashColor(tick) : Color.WHITE)
        this.body.setExtraAdditiveDraw(eatenFlashCounter > 0, color)
        if (tick >= this.blinkAtTick) {
            this.blinkAtTick = tick + this.context.animations.nextPlantBlinkTicks()
            if (!this.shooting) this.blink.play({ loop: false, rate: 15 / 12 * this.clips.blink.rateScale, timeSeconds: 0 })
        }
        if (!this.head.snapshot().playing) this.idle(0)
    }

    snapshot(entityId: number): PlantViewSnapshot {
        return { kind: 'plant', entityId, idleRate: this.idleRate, blinkAtTick: this.blinkAtTick,
            animations: { body: this.body.snapshot(), head: this.head.snapshot(), blink: this.blink.snapshot() } }
    }

    restore(snapshot: PlantViewSnapshot): void {
        const { body, head, blink } = snapshot.animations
        if (!head || !blink || snapshot.idleRate === undefined || snapshot.blinkAtTick === undefined) {
            throw new Error(`Missing shooter animation state for plant ${snapshot.entityId}`)
        }
        this.idleRate = snapshot.idleRate
        this.body.restore(body)
        if (head.id !== this.head.loadedId) this.head.change(head.id, this.context.content.registry)
        this.head.restore(head)
        this.blink.restore(blink)
        this.blinkAtTick = snapshot.blinkAtTick
        if (head.attachmentTrackId) this.head.reattachAfterRestore(this.body)
        if (blink.attachmentTrackId) this.blink.reattachAfterRestore(this.head)
        if (this.shooting) this.head.setOnFinish(() => this.idle(0.2))
    }
}

function upgradeFlashColor(tick: number): Color {
    const age = tick % 90
    const gray = Math.min(255, Math.trunc(200 * Math.abs(45 - age) / 45) + 55)
    return new Color(gray, gray, gray, 255)
}
