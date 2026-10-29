import { plantDefinition } from './definitions'
import { Color, Node, Sprite } from 'cc'
import { type ClientAnimationClip } from '@/client/content/ClientAnimationRegistry'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import type { ReanimKeyframe } from '@/shared/content/reanim'
import { attachmentTrack, type PlantParts } from '@/shared/content/presentation'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import type { PlantParticle, PlantView, PlantViewContext, PlantViewSnapshot } from './PlantView'

export interface PlantAnimation { clip: ClientAnimationClip; loop: boolean; rate: number; blend: number }
export const plantAnimation = (clip: ClientAnimationClip, loop: boolean, rate: number, blend = 0): PlantAnimation => ({ clip, loop, rate, blend })

/** Shared body loading, blending, blink playback and presentation persistence. */
export abstract class AnimatedPlantView implements PlantView {
    protected abilityState: string | undefined
    /** A slower clip load must not overwrite a newer body change. */
    private bodyVersion = 0
    protected blinkAtTick: number
    private blinking = false
    protected body: ReanimPlayer
    protected readonly extras = new Map<string, ReanimPlayer>()
    /**
     * Reanimation::mFrameBasePose: the body fixes a track's base pose at the first blink, and later body animations
     * keep it, so a grown sun-shroom's blink still scales from the small face.
     */
    private readonly attachmentBases = new Map<string, ReanimKeyframe>()
    /** The Z animation over a sleeping mushroom. */
    private sleeping?: ReanimPlayer
    protected readonly node: Node
    protected readonly content: PlantViewContext['content']
    protected readonly animations: PlantViewContext['animations']
    protected readonly assets: PlantViewContext['assets']

    constructor(protected readonly context: PlantViewContext) {
        const { node, content, animations, assets, tick } = context
        this.node = node; this.content = content; this.animations = animations; this.assets = assets
        this.body = uiNode({ name: 'Body', parent: node }).node.addComponent(ReanimPlayer)
        this.blinkAtTick = tick + this.animations.nextPlantBlinkTicks(this.isNut)
    }

    async initialize(): Promise<void> {
        if (this.hasShadow) {
            const shadow = this.shadow
            const shadowScale = shadow.scale ?? 1, size = this.assets.shadow.originalSize
            const shadowNode = uiNode({ name: 'PlantShadow', parent: this.node, position: {
                x: shadow.x + size.width * (1 - shadowScale) / 2,
                y: shadow.y - size.height * (1 - shadowScale) / 2, z: -1,
            }, anchor: { x: 0, y: 1 },
                sprite: { frame: this.assets.shadow, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node
            shadowNode.setSiblingIndex(0)
            shadowNode.setScale(shadowScale, shadowScale, 1)
        }
        await this.loadAnimations()
        if (!this.node.isValid) return
        for (const [name, player] of this.extras) {
            if (this.body.loadedId) this.attachExtra(name, player)
            player.hide()
        }
        this.startBody()
        await this.syncAbility(this.context.plant.ability?.state, this.context.tick)
    }

    protected get clips() {
        const target = plantDefinition(this.animations.definitions, this.context.plant.typeId).animationTarget!
        return this.animations.resolve(target)
    }

    protected get isNut(): boolean { return false }
    protected get parts(): PlantParts {
        return plantDefinition(this.animations.definitions, this.context.plant.typeId).parts ?? {}
    }
    private get eyeTracks(): readonly string[] { return this.parts.eyes ?? [] }
    /** Plant::DrawShadow skips a few plants, such as the grave buster. */
    protected get hasShadow(): boolean { return true }
    protected get shadow(): { x: number; y: number; scale?: number } { return plantDefinition(this.animations.definitions, this.context.plant.typeId).shadow }
    protected async loadAnimations(): Promise<void> {}
    protected startBody(): void {}
    protected onAbilityChanged(_state: string | undefined, _tick: number): void {}
    protected onAbilityPlayed(_state: string | undefined): void {}
    protected abilityClip(_state: string | undefined, _previous: string | undefined): PlantAnimation | undefined { return undefined }
    protected afterRestore(): void {}
    protected syncVisuals(_plant: PlantSnapshot, _world: WorldSnapshot, _particle: PlantParticle): void {}
    protected blinkPlayer(): ReanimPlayer | undefined { return undefined }
    protected extraClip(name: string): ClientAnimationClip { throw new Error(`Unknown plant animation: ${name}`) }
    protected prepareBody(player: ReanimPlayer): void {
        const scale = plantDefinition(this.animations.definitions, this.context.plant.typeId).scale
        player.node.setScale(scale, scale, 1)
    }

    protected async loadExtra(name: string, clip: ClientAnimationClip): Promise<void> {
        const player = uiNode({ name, parent: this.node }).node.addComponent(ReanimPlayer)
        await player.load(clip.reanimId, this.content.registry, this.content.loader)
        this.extras.set(name, player)
    }

    protected attachExtras(_clip: ClientAnimationClip): void {
        for (const [name, extra] of this.extras) this.attachExtra(name, extra)
    }

    private attachExtra(name: string, extra: ReanimPlayer): void {
        const trackId = attachmentTrack(this.extraClip(name))
        extra.attachToTrack(this.body, trackId, this.attachmentBases.get(trackId))
    }

    private keepAttachmentBase(player: ReanimPlayer): void {
        const trackId = player.attachmentTrackId, pose = player.attachmentBasePose
        if (trackId && pose && !this.attachmentBases.has(trackId)) this.attachmentBases.set(trackId, pose)
    }

    sync(plant: PlantSnapshot, world: WorldSnapshot, particle: PlantParticle): void {
        void this.syncAbility(plant.ability?.state, world.gameplayTick)
        const gray = Math.min(255, plant.eatenFlashCounter * 3)
        // Extras attached to the body's tracks take its colors.
        this.body.setExtraAdditiveDraw(plant.eatenFlashCounter > 0, new Color(gray, gray, gray))
        this.syncVisuals(plant, world, particle)
        this.syncBlink(world.gameplayTick)
        this.syncSleeping(plant.asleep === true)
    }

    /** Plant::SetSleeping: a Z animation at (50, 40) loops at 6-8 fps from a random point while asleep. */
    private syncSleeping(asleep: boolean): void {
        if (!asleep) {
            if (this.sleeping?.node.isValid) this.sleeping.node.destroy()
            this.sleeping = undefined
            return
        }
        if (this.sleeping) return
        const [x, y] = plantDefinition(this.animations.definitions, this.context.plant.typeId).sleepOffset ?? [0, 0]
        const node = uiNode({ name: 'Sleeping', parent: this.node, position: { x: 50 + x, y: -40 - y } }).node
        const player = this.sleeping = node.addComponent(ReanimPlayer)
        void player.load('pvz:sleeping', this.content.registry, this.content.loader).then(() => {
            if (node.isValid) player.play({ loop: true, rate: (6 + Math.random() * 2) / 12, timeSeconds: Math.random() * 0.9 * player.durationSeconds })
        }, error => {
            if (node.isValid) console.error('[Plant] Failed to load the sleeping animation', error)
        })
    }

    snapshot(entityId: number): PlantViewSnapshot {
        const animations: Record<string, ReturnType<ReanimPlayer['snapshot']>> = { body: this.body.snapshot() }
        for (const [name, player] of this.extras) animations[name] = player.snapshot()
        return { kind: 'plant', entityId, animations, blinkAtTick: this.blinkAtTick }
    }

    async restore(snapshot: PlantViewSnapshot): Promise<void> {
        const body = snapshot.animations.body
        if (body.id !== this.body.loadedId) await this.body.load(body.id, this.content.registry, this.content.loader)
        this.body.restore(body)
        this.blinking = false
        for (const [name, player] of this.extras) {
            const saved = snapshot.animations[name]
            if (!saved) continue
            player.restore(saved)
            player.reattachAfterRestore(this.body)
            this.keepAttachmentBase(player)
            if (name.startsWith('Blink') && saved.visible && saved.playing) {
                this.blinking = true
                player.setOnFinish(() => this.endBlink())
            }
        }
        this.body.setTracksVisible(this.eyeTracks, !this.blinking)
        if (snapshot.blinkAtTick !== undefined) this.blinkAtTick = snapshot.blinkAtTick
        this.afterRestore()
    }

    protected async syncAbility(state: string | undefined, tick: number): Promise<void> {
        if (state === this.abilityState) return
        const previous = this.abilityState
        this.abilityState = state
        this.onAbilityChanged(state, tick)
        const target = this.abilityClip(state, previous)
        if (!target || this.body.loadedId === target.clip.reanimId) return
        await this.playBody(target.clip, target.loop, target.rate, previous === undefined ? 0 : target.blend)
        if (this.body.loadedId === target.clip.reanimId) this.onAbilityPlayed(state)
    }

    /** Keep the outgoing player alive until its pose has been captured for blending. */
    protected async playBody(clip: ClientAnimationClip, loop: boolean, rate: number, blend: number): Promise<void> {
        const version = ++this.bodyVersion
        const previous = this.body
        let player = previous
        if (previous.loadedId !== clip.reanimId) {
            if (previous.loadedId && blend > 0) {
                player = uiNode({ name: 'Body', parent: this.node }).node.addComponent(ReanimPlayer)
                player.node.setSiblingIndex(previous.node.getSiblingIndex())
            }
            try {
                await player.load(clip.reanimId, this.content.registry, this.content.loader)
            } catch (error) {
                if (player !== previous && player.node.isValid) player.node.destroy()
                if (this.node.isValid) throw error
                return
            }
            if (version !== this.bodyVersion || !this.node.isValid) {
                if (player !== previous && player.node.isValid) player.node.destroy()
                return
            }
        }
        player.node.setPosition(clip.x, clip.y)
        this.prepareBody(player)
        player.play({ loop, rate: rate * clip.rateScale, timeSeconds: 0, hideOnFinish: false })
        if (player !== previous) {
            player.blendFrom(previous, blend)
            previous.node.destroy()
            this.body = player
        }
        this.attachExtras(clip)
    }

    private syncBlink(tick: number): void {
        if (tick < this.blinkAtTick || this.blinking) return
        this.blinkAtTick = tick + this.animations.nextPlantBlinkTicks(this.isNut)
        const blink = this.blinkPlayer()
        if (!blink) return
        this.blinking = true
        this.keepAttachmentBase(blink)
        this.body.setTracksVisible(this.eyeTracks, false)
        blink.play({
            loop: false, rate: 15 / 12, timeSeconds: 0,
            onFinish: () => this.endBlink(),
        })
    }

    private endBlink(): void {
        this.blinking = false
        if (this.body.node.isValid) this.body.setTracksVisible(this.eyeTracks, true)
    }
}
