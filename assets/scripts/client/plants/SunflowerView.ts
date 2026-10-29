import { Color, Sprite } from 'cc'
import { randomAnimationRate, type ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { attachmentTrack } from '@/shared/content/presentation'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import type { PlantView, PlantViewContext, PlantViewSnapshot } from './PlantView'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { plantDefinition } from './definitions'

export class SunflowerView implements PlantView {
    private constructor(private readonly body: ReanimPlayer, private readonly blink: ReanimPlayer, private blinkAtTick: number, private readonly blinkRate: number, private readonly animations: ClientAnimationRegistry) {}

    static async create(context: PlantViewContext) {
        const { node, content, animations, assets, plant, tick } = context
        const presentation = plantDefinition(animations.definitions, plant.typeId)
        const animation = animations.resolve(presentation.animationTarget!)
        const shadow = assets.shadow
        uiNode({
            name: 'PlantShadow', parent: node, position: { ...presentation.shadow, z: -1 }, anchor: { x: 0, y: 1 },
            sprite: { frame: shadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
        })
        const body = uiNode({ name: 'Body', parent: node, position: animation.body }).node.addComponent(ReanimPlayer)
        const blink = uiNode({ name: 'Blink', parent: node, position: animation.blink }).node.addComponent(ReanimPlayer)
        await Promise.all([
            body.load(animation.body.reanimId, content.registry, content.loader),
            blink.load(animation.blink.reanimId, content.registry, content.loader),
        ])
        if (node.isValid) {
            body.play({ loop: true, rate: randomAnimationRate(animations.rates.plantIdle) / 12 * animation.body.rateScale })
            blink.attachToTrack(body, attachmentTrack(animation.blink))
            blink.hide()
        }
        return new SunflowerView(body, blink, tick + animations.nextPlantBlinkTicks(), 15 / 12 * animation.blink.rateScale, animations)
    }

    sync(plant: PlantSnapshot, world: WorldSnapshot): void {
        const flash = plant.eatenFlashCounter, tick = world.gameplayTick
        if (tick >= this.blinkAtTick) {
            this.blink.play({ loop: false, rate: this.blinkRate, timeSeconds: 0 })
            this.blinkAtTick = tick + this.animations.nextPlantBlinkTicks()
        }
        const gray = Math.min(255, flash * 3)
        // The blink is attached to the body, so it takes the body's colors.
        this.body.setExtraAdditiveDraw(flash > 0, new Color(gray, gray, gray))
    }

    snapshot(entityId: number): PlantViewSnapshot {
        return { kind: 'plant', entityId, animations: { body: this.body.snapshot(), blink: this.blink.snapshot() }, blinkAtTick: this.blinkAtTick }
    }

    restore(snapshot: PlantViewSnapshot): void {
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
