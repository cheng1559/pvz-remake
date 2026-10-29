import { randomAnimationRate } from '@/client/content/ClientAnimationRegistry'
import { plantDefinition } from './definitions'
import type { ClientAnimationClip } from '@/client/content/ClientAnimationRegistry'
import { attachmentTrack } from '@/shared/content/presentation'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { AnimatedPlantView, plantAnimation } from './AnimatedPlantView'

export class PotatoMineView extends AnimatedPlantView {
    private get definition() { return plantDefinition(this.animations.definitions, this.context.plant.typeId).mine! }

    private glowRate(frames: number): number {
        const fps = this.clips.armed.fps ?? 12
        return (this.body.snapshot().rate * fps - this.definition.glow.rateOffset) / frames * this.extras.get('Glow')!.durationSeconds
    }

    protected async loadAnimations(): Promise<void> {
        const mine = this.clips
        await Promise.all([this.loadExtra('Blink', mine.blink), this.loadExtra('Glow', mine.glow)])
    }

    protected extraClip(name: string): ClientAnimationClip {
        const mine = this.clips
        return name === 'Blink' ? mine.blink : mine.glow
    }

    protected onAbilityChanged(state: string | undefined, tick: number): void {
        if (state === 'armed') {
            const [min, max] = this.definition.blinkTicks
            this.blinkAtTick = tick + min + Math.floor(Math.random() * (max - min + 1))
        }
    }

    protected onAbilityPlayed(state: string | undefined): void {
        if (state !== 'armed') return
        const glow = this.extras.get('Glow')!
        glow.play({ loop: true, rate: this.glowRate(this.definition.glow.frames[1]),
            timeSeconds: 0, hideOnFinish: false })
    }

    protected abilityClip(state: string | undefined) {
        const mine = this.clips
        if (state === 'arming') return plantAnimation(mine.buried, true, 1)
        if (state === 'rising') return plantAnimation(mine.rise, false, this.definition.riseRate / (mine.rise.fps ?? 12), this.definition.blendSeconds)
        if (state === 'armed') return plantAnimation(mine.armed, true, randomAnimationRate(this.definition.armedRate) / (mine.armed.fps ?? 12))
        return undefined
    }

    protected attachExtras(clip: ClientAnimationClip): void {
        // A potato mine shows its face and light only once armed; its blink and glow attach then.
        const scale = plantDefinition(this.animations.definitions, this.context.plant.typeId).scale
        const attach = clip.reanimId === this.clips.armed.reanimId
        const glow = this.parts.glow ?? []
        this.body.setTracksVisible(glow, false)
        for (const [name, extra] of this.extras) {
            extra.node.setPosition(clip.x, clip.y)
            extra.node.setScale(scale, scale, 1)
            if (name === 'Glow') {
                extra.setTracksVisible(extra.trackIds, false)
                extra.setTracksVisible(glow, true)
            }
            if (attach) extra.attachToTrack(this.body, attachmentTrack(this.extraClip(name)))
            else extra.hide()
        }
    }

    protected blinkPlayer() { return this.abilityState === 'armed' ? this.extras.get('Blink') : undefined }

    protected syncVisuals(plant: PlantSnapshot, snapshot: WorldSnapshot): void {
        const glow = this.extras.get('Glow')
        if (!glow) return
        if (plant.ability?.state !== 'armed' || this.body.loadedId !== this.clips.armed.reanimId) {
            glow.node.active = false
            return
        }
        const attack = this.context.content.definitions.plants[plant.typeId].mine!.attack
        const attackLeft = plant.x + attack.x, attackRight = attackLeft + attack.width
        let distance = Infinity
        for (const zombie of snapshot.zombies) {
            if (zombie.row !== plant.row || zombie.state === 'dying' || zombie.state === 'mowered' || zombie.state === 'burned') continue
            const body = this.context.content.definitions.zombies[zombie.typeId].body
            const left = zombie.x + body.x, right = left + body.width
            distance = Math.min(distance, Math.max(0, -(Math.min(attackRight, right) - Math.max(attackLeft, left))))
        }
        const glowDefinition = this.definition.glow
        const [near, far] = glowDefinition.distance
        const [fast, slow] = glowDefinition.frames
        const frames = Math.round(Math.max(fast, Math.min(slow, slow + (distance - far) * (fast - slow) / (near - far))))
        // Keep normalized local phase when the cycle shortens, just like mAnimTime/mFrameCount.
        const phase = glow.snapshot().timeSeconds / glow.durationSeconds
        glow.play({ loop: true, rate: this.glowRate(frames), hideOnFinish: false })
        glow.node.active = true
        glow.setTracksVisible(this.parts.glow ?? [], phase * (frames - 1) < 1)
    }
}
