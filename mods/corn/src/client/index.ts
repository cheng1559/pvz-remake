import { flashGray, registerCobCannon } from './cobCannon.js'

export interface Context {
    host: { get(id: string): any; around(target: any, key: string, handler: (this: any, next: (...args: any[]) => any, ...args: any[]) => any): void }
    assets: { id: string; json(path: string): any }
}

export function register({ host, assets }: Context): void {
    registerCobCannon({ host, assets })
    const presentation = assets.json('assets/presentation.json')
    host.get('content/definitions').register(assets.id, presentation)
    host.get('content/resources').register(assets, assets.json('assets/content.json'))
    const { AudioClip, Color, Sprite, SpriteFrame, UITransform, Vec3, isValid } = host.get('cc')
    const { uiNode } = host.get('client/view/uiNode')
    const { ReanimPlayer } = host.get('client/reanim/ReanimPlayer')
    const { loadIntegratedGameContent } = host.get('client/game/loadIntegratedGameContent')
    let contentReady: Promise<any> | undefined
    const content = () => contentReady ??= loadIntegratedGameContent()
    const sounds = assets.json('assets/content.json').sounds
    const { SoundLoader } = host.get('client/sound/LegacySoundSystem')
    host.around(SoundLoader, 'load', function (next, id) {
        if (!sounds[id]) return next(id)
        const effect = id === 'corn:kernelpult' && Math.random() < 0.5 ? 'corn:kernelpult2' : id
        return content().then(game => game.loader.load(game.registry.resolve('sounds', effect), AudioClip))
    })
    const config = presentation.plants['corn:kernel_pult']
    const behavior = assets.json('assets/gameplay.json').plants['corn:kernel_pult'].behavior
    const visuals = assets.json('assets/visuals.json')
    const animation = config.animations
    const plantId = 'corn:kernel_pult'
    let butterFrame: any, butterReady: Promise<any> | undefined
    const loadButter = () => butterReady ??= content().then(game =>
        game.loader.load(game.registry.resolve('sprites', visuals.butter.sprite), SpriteFrame)).then(frame => butterFrame = frame)

    const createPlayer = async (parent: any, name: string, clip: any, content: any) => {
        const player = uiNode({ name, parent }).node.addComponent(ReanimPlayer)
        await player.load(clip.reanimId, content.registry, content.loader)
        return player
    }
    const heldCorn = (player: any, butter: boolean) => {
        player.setTrackPrefixVisible('Cornpult_butter', butter)
        player.setTrackPrefixVisible('Cornpult_kernal', !butter)
    }

    // Both poses are loaded once. Switching or resuming a shot never starts an async load.
    class KernelPultView {
        players: Record<string, any> = {}
        phase?: string
        idleRate = 1
        blinkAtTick: number
        constructor(readonly context: any) { this.blinkAtTick = context.tick + context.animations.nextPlantBlinkTicks() }
        async initialize() {
            const { node, content } = this.context
            uiNode({ name: 'PlantShadow', parent: node, position: config.shadow, anchor: { x: 0, y: 1 },
                sprite: { frame: this.context.assets.shadow, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node.setSiblingIndex(0)
            await Promise.all([loadButter(), ...Object.entries({ body: animation.body, shoot: animation.shoot, blink: animation.blink }).map(async ([name, clip]) => {
                this.players[name] = await createPlayer(node, name, clip, content)
            })])
            if (!isValid(node, true)) return
            this.players.blink.attachToTrack(this.players.body, animation.blink.attachmentTrackId)
            this.players.blink.hide()
            this.idleRate = (10 + Math.random() * 5) / 12
            this.sync(this.context.plant, { gameplayTick: this.context.tick })
        }
        sync(plant: any, world: any) {
            const { body, shoot, blink } = this.players, state = plant.behaviorState
            const phase = state?.phase ?? 'idle', active = phase === 'shooting' ? shoot : body
            if (this.phase !== phase) {
                if (this.phase) active.blendFrom(this.phase === 'shooting' ? shoot : body, visuals.blendSeconds)
                if (this.phase === 'shooting' && phase === 'idle') this.idleRate = 1
                body.hide(); shoot.hide(); blink.hide()
                active.play({ loop: phase === 'idle', rate: phase === 'shooting' ? 35 / 12 : this.idleRate, timeSeconds: 0, hideOnFinish: false })
                blink.attachToTrack(active, animation.blink.attachmentTrackId)
                this.phase = phase
            }
            const tick = world.gameplayTick
            const start = phase === 'shooting' ? state.startedAtTick : state?.released ? state.startedAtTick + behavior.shootTicks : this.context.tick
            const rate = phase === 'shooting' ? 35 : this.idleRate * 12
            const progress = Math.max(0, tick - start) / 100 * rate / (active.durationSeconds * 12)
            // Native Reanim maps the normalized cycle across frameCount - 1 intervals.
            active.seek((phase === 'shooting' ? Math.min(1, progress) : progress % 1) * active.lastFrameTimeSeconds)
            heldCorn(active, phase === 'shooting' && state.butter && !state.released)
            const upgrade = world.cursor?.mode === 'seed' && world.cursor.seedId === 'corn:cob_cannon' &&
                world.extensions?.['corn:cob_upgrade']?.targets.includes(plant.entityId)
            const tint = upgrade ? flashGray(tick, visuals.cannon.upgradeFlashPeriod) : 255
            for (const player of Object.values(this.players)) player.setColorOverride(new Color(tint, tint, tint))
            const gray = Math.min(255, plant.eatenFlashCounter * 3)
            active.setExtraAdditiveDraw(gray > 0, new Color(gray, gray, gray))
            if (tick >= this.blinkAtTick) {
                this.blinkAtTick = tick + this.context.animations.nextPlantBlinkTicks()
                if (phase === 'idle') blink.play({ loop: false, rate: 15 / 12, timeSeconds: 0 })
            }
        }
        snapshot(entityId: number) {
            return { kind: 'plant', entityId, idleRate: this.idleRate, blinkAtTick: this.blinkAtTick,
                animations: Object.fromEntries(Object.entries(this.players).map(([name, player]) => [name, player.snapshot()])) }
        }
        restore(saved: any) {
            for (const [name, player] of Object.entries(this.players)) player.restore(saved.animations[name])
            this.idleRate = saved.idleRate; this.blinkAtTick = saved.blinkAtTick
            this.phase = saved.animations.shoot.visible ? 'shooting' : 'idle'
            this.players.blink.reattachAfterRestore(this.phase === 'shooting' ? this.players.shoot : this.players.body)
        }
    }
    host.get('client/views').plants.register(plantId, async (context: any) => {
        const view = new KernelPultView(context)
        await view.initialize()
        return view
    })

    const { PlantPreview } = host.get('client/hud/PlantPreview')
    const { SeedPacketRenderer } = host.get('client/hud/SeedPacketRenderer')
    const loadPreview = async (preview: any, root: any) => {
        const game = await content()
        if (!isValid(root, true)) return
        const body = await createPlayer(root, 'KernelPult', animation.body, game)
        if (!isValid(root, true)) return
        body.play({ loop: false, rate: 1, timeSeconds: 0 }); body.pause(); heldCorn(body, false)
        preview.players.push(body)
    }
    host.around(PlantPreview.prototype, 'load', function (next, root, id) {
        return id === plantId ? loadPreview(this, root) : next(root, id)
    })
    host.around(PlantPreview.prototype, 'initialize', function (next, definitions, id, cached, placement, scale) {
        const preview = this
        return next(definitions, id, (root: any, selected: any) => {
            if (selected !== plantId) return cached(root, selected)
            // Standard packets use the same owned pose; placement previews remain full size.
            const pose = uiNode({ name: 'KernelPultPose', parent: root }).node
            if (scale !== undefined) { pose.setPosition(13 * scale, -15 * scale); pose.setScale(0.4 * scale, 0.4 * scale, 1) }
            return loadPreview(preview, pose)
        }, placement, scale)
    })
    host.around(SeedPacketRenderer, '_drawPlantIcon', function (next, root, args, scale) {
        if (args.seedType !== plantId) return next(root, args, scale)
        const size = Math.max(1, scale)
        const preview = uiNode({ name: 'PacketPlant', parent: root, layer: args.layer }).node.addComponent(PlantPreview)
        preview.initialize(args.definitions, plantId, () => Promise.resolve(), { x: 13 * size, y: -15 * size, scale: 0.4 * size }, size)
    })

    const { ZombieView } = host.get('client/zombies/ZombieView')
    const overlays = new WeakMap<object, any>()
    const buttered = new WeakMap<object, boolean>(), frozenPlayers = new WeakSet<object>()
    const syncButter = (view: any) => {
        for (const player of [view.player, view.flag]) if (player) {
            if (buttered.get(view)) frozenPlayers.add(player)
            else frozenPlayers.delete(player)
        }
        let overlay = overlays.get(view)
        const head = buttered.get(view) && view.getTrackWorldPosition(visuals.butter.track)
        if (!head) { if (overlay) overlay.active = false; return }
        if (!butterFrame) { void loadButter().then(() => { if (isValid(view.node, true)) syncButter(view) }).catch(console.error); return }
        if (!overlay) {
            overlay = uiNode({ name: 'Butter', parent: view.node, anchor: { x: 0, y: 1 },
                sprite: { frame: butterFrame, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node
            overlay.setScale(visuals.butter.scale, visuals.butter.scale, 1)
            overlays.set(view, overlay)
        }
        // Zombie::DrawButter uses the head track's centre and an upright splat, not the flying block.
        const position = view.node.getComponent(UITransform).convertToNodeSpaceAR(head)
        overlay.setPosition(new Vec3(position.x + visuals.butter.offset.x, position.y + visuals.butter.offset.y, 0))
        overlay.setSiblingIndex(view.node.children.length - 1)
        overlay.active = true
    }
    host.around(ZombieView.prototype, 'sync', function (next, zombie, world) {
        next(zombie, world)
        const butter = world?.extensions['corn:buttered']?.[String(zombie.entityId)]
        buttered.set(this, Boolean(butter && zombie.hasHead && (zombie.state === 'walking' || zombie.state === 'eating')))
        syncButter(this)
    })
    host.around(ZombieView.prototype, 'load', async function (next, zombie) {
        await next(zombie)
        if (isValid(this.node, true)) syncButter(this)
    })
    host.around(ReanimPlayer.prototype, 'advance', function (next, dt) {
        if (!frozenPlayers.has(this)) return next(dt)
    })

    const { LevelEntityRenderer } = host.get('client/level/LevelEntityRenderer')
    host.around(LevelEntityRenderer.prototype, 'sync', function (next, snapshot, changes, events) {
        next(snapshot, changes, events)
        for (const projectile of snapshot.projectiles) {
            const visual = visuals.projectiles[projectile.typeId]
            const pose = snapshot.extensions['corn:lob']?.[String(projectile.entityId)] ?? snapshot.extensions['corn:cob_flight']?.[String(projectile.entityId)]
            const node = this.entities.get(projectile.entityId)
            if (!visual || !pose || !node) continue
            const size = node.getComponent(Sprite).spriteFrame.originalSize
            // Rotate and scale about the sprite centre, preserving the original top-left projectile position.
            node.getComponent(UITransform).setAnchorPoint(0.5, 0.5)
            node.setPosition(projectile.x - 400 + size.width / 2, 300 - projectile.y - size.height / 2)
            node.setScale(visual.scale, visual.scale, 1)
            node.angle = pose.rotation * 180 / Math.PI
        }
    })
    host.around(LevelEntityRenderer.prototype, 'playEvents', function (next, snapshot, events) {
        next(snapshot, events)
        // Butter plays its own splat in addition to a helm hit; kernels never play the helm sound.
        for (const event of events) if (event.type === 'projectileImpact' && event.data.typeId === 'corn:butter' && event.data.helm) {
            this.audio.sounds(presentation.projectiles['corn:butter'].impactSounds)
        }
    })
}
