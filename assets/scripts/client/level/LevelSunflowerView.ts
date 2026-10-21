import { Color, Node, Sprite, type SpriteFrame } from 'cc'
import type { SunflowerAnimationDefinition } from '@/client/content/ClientAnimationRegistry'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import type { LoadedContent } from './LevelView'
import type { LevelEntitySnapshot } from './LevelPresentationSnapshot'

export class LevelSunflowerView {
    private constructor(private readonly body: ReanimPlayer, private readonly blink: ReanimPlayer, private blinkAtTick: number, private readonly blinkRate: number) {}

    static async create(node: Node, content: LoadedContent, animation: SunflowerAnimationDefinition, shadow: SpriteFrame, tick: number) {
        uiNode({
            name: 'PlantShadow', parent: node, position: { x: -3, y: -51, z: -1 }, anchor: { x: 0, y: 1 },
            sprite: { frame: shadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
        })
        const body = uiNode({ name: 'Body', parent: node, position: animation.body }).node.addComponent(ReanimPlayer)
        const blink = uiNode({ name: 'Blink', parent: node, position: animation.blink }).node.addComponent(ReanimPlayer)
        await Promise.all([
            body.load(animation.body.reanimId, content.registry, content.loader),
            blink.load(animation.blink.reanimId, content.registry, content.loader),
        ])
        if (node.isValid) {
            body.play({ loop: true, rate: (15 + Math.random() * 5) / 12 * animation.body.rateScale })
            blink.attachToTrack(body, animation.blink.attachmentTrackId ?? 'anim_idle')
            blink.hide()
        }
        return new LevelSunflowerView(body, blink, tick + 400 + Math.floor(Math.random() * 400), 15 / 12 * animation.blink.rateScale)
    }

    sync(flash: number, tick: number): void {
        if (tick >= this.blinkAtTick) {
            this.blink.play({ loop: false, rate: this.blinkRate, timeSeconds: 0 })
            this.blinkAtTick = tick + 400 + Math.floor(Math.random() * 400)
        }
        const gray = Math.min(255, flash * 3)
        for (const player of [this.body, this.blink]) player.setExtraAdditiveDraw(flash > 0, new Color(gray, gray, gray))
    }

    snapshot(entityId: number): Extract<LevelEntitySnapshot, { kind: 'plant' }> {
        return { kind: 'plant', entityId, animations: { body: this.body.snapshot(), blink: this.blink.snapshot() }, blinkAtTick: this.blinkAtTick }
    }

    restore(snapshot: Extract<LevelEntitySnapshot, { kind: 'plant' }>): void {
        const { body, blink } = snapshot.animations
        if (!blink || snapshot.blinkAtTick === undefined) {
            throw new Error(`Missing blink animation state for plant ${snapshot.entityId}`)
        }
        this.body.restore(body)
        this.blink.restore(blink)
        if (blink.attachmentTrackId) this.blink.reattachAfterRestore(this.body)
        this.blinkAtTick = snapshot.blinkAtTick
    }
}
