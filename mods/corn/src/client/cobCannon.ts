import type { Context } from './index.js'

const CANNON = 'corn:cob_cannon'
export const flashGray = (tick: number, period: number) => {
    const half = Math.floor(period / 2)
    return Math.min(255, Math.trunc(200 * Math.abs(half - tick % period) / half + 55))
}

export function registerCobCannon({ host, assets }: Context): void {
    const config = assets.json('assets/presentation.json').plants[CANNON]
    const behavior = assets.json('assets/gameplay.json').plants[CANNON].behavior
    const visuals = assets.json('assets/visuals.json'), visual = visuals.cannon
    const { Color, Graphics, Sprite, SpriteFrame, isValid } = host.get('cc')
    const { uiNode } = host.get('client/view/uiNode')
    const { ReanimPlayer } = host.get('client/reanim/ReanimPlayer')
    const { loadIntegratedGameContent } = host.get('client/game/loadIntegratedGameContent')
    const { GameDebugSettings } = host.get('platform/debug/GameDebugSettings')
    const { Haptics } = host.get('platform/Haptics')
    const { LevelInputPresenter } = host.get('client/level/LevelInputPresenter')
    const { LevelHudPresenter } = host.get('client/level/LevelHudPresenter')
    const { LevelSeedBank } = host.get('client/level/LevelSeedBank')
    const { LevelView } = host.get('client/level/LevelView')
    const { LevelEntityRenderer } = host.get('client/level/LevelEntityRenderer')
    let contentReady: Promise<any> | undefined, targetReady: Promise<any> | undefined, targetFrame: any
    const content = () => contentReady ??= loadIntegratedGameContent()
    const loadTarget = () => targetReady ??= content().then(game =>
        game.loader.load(game.registry.resolve('sprites', visual.target.sprite), SpriteFrame)).then(frame => targetFrame = frame)
    const player = async (parent: any, name: string, clip: any, game: any) => {
        const result = uiNode({ name, parent }).node.addComponent(ReanimPlayer)
        await result.load(clip.reanimId, game.registry, game.loader)
        return result
    }

    class CannonView {
        players: Record<string, any> = {}
        phase?: string
        blinkAtTick: number
        constructor(readonly context: any) { this.blinkAtTick = context.tick + context.animations.nextPlantBlinkTicks() }
        async initialize() {
            await Promise.all([loadTarget(), ...Object.entries(config.animations).map(async ([name, clip]) => {
                this.players[name] = await player(this.context.node, name, clip, this.context.content)
            })])
            if (!isValid(this.context.node, true)) return
            for (const value of Object.values(this.players)) value.hide()
            this.sync(this.context.plant, { gameplayTick: this.context.tick })
        }
        sync(plant: any, world: any) {
            const state = plant.behaviorState, phase = state?.phase ?? 'arming', slot = visual.phaseClips[phase]
            const active = this.players[slot], blink = this.players.blink, tick = world.gameplayTick
            if (this.phase !== phase) {
                if (this.phase) active.blendFrom(this.players[visual.phaseClips[this.phase]], visuals.blendSeconds)
                for (const value of Object.values(this.players)) value.hide()
                active.play({ loop: phase === 'arming' || phase === 'ready', rate: 1, hideOnFinish: false })
                blink.attachToTrack(active, config.animations.blink.attachmentTrackId)
                this.phase = phase
            }
            const elapsed = Math.max(0, tick - Math.max(0, state?.startedAtTick ?? tick)) / 100
            const progress = elapsed / active.durationSeconds
            if (phase === 'ready') {
                const gray = flashGray(tick, visual.flashPeriod)
                active.setTrackColorOverride(visual.cobTrack, new Color(gray, gray, gray))
            }
            active.seek((phase === 'arming' || phase === 'ready' ? progress % 1 : Math.min(1, progress)) * active.lastFrameTimeSeconds)
            const flash = Math.min(255, plant.eatenFlashCounter * 3)
            active.setExtraAdditiveDraw(flash > 0, new Color(flash, flash, flash))
            if (tick >= this.blinkAtTick) {
                this.blinkAtTick = tick + this.context.animations.nextPlantBlinkTicks()
                if (phase === 'arming' || phase === 'ready') blink.play({ loop: false, rate: 15 / 12, timeSeconds: 0 })
            }
        }
        snapshot(entityId: number) {
            return { kind: 'plant', entityId, blinkAtTick: this.blinkAtTick,
                animations: Object.fromEntries(Object.entries(this.players).map(([name, value]) => [name, value.snapshot()])) }
        }
        restore(saved: any) {
            for (const [name, value] of Object.entries(this.players)) value.restore(saved.animations[name])
            this.phase = Object.keys(visual.phaseClips).find(phase => saved.animations[visual.phaseClips[phase]].visible)
            this.blinkAtTick = saved.blinkAtTick
            this.players.blink.reattachAfterRestore(this.players[visual.phaseClips[this.phase!]])
        }
    }
    host.get('client/views').plants.register(CANNON, async (context: any) => {
        const view = new CannonView(context)
        await view.initialize()
        return view
    })

    const { PlantPreview } = host.get('client/hud/PlantPreview')
    const { SeedPacketRenderer } = host.get('client/hud/SeedPacketRenderer')
    const preview = async (owner: any, root: any) => {
        const game = await content()
        if (!isValid(root, true)) return
        const body = await player(root, 'CobCannon', config.animations.ready, game)
        if (!isValid(root, true)) return
        body.play({ loop: false, rate: 1, timeSeconds: 0 }); body.pause()
        owner.players.push(body)
    }
    host.around(PlantPreview.prototype, 'load', function (next, root, id) {
        return id === CANNON ? preview(this, root) : next(root, id)
    })
    host.around(PlantPreview.prototype, 'initialize', function (next, definitions, id, cached, placement, scale) {
        const owner = this
        return next(definitions, id, (root: any, selected: any) => {
            if (selected !== CANNON) return cached(root, selected)
            const pose = uiNode({ parent: root }).node
            if (scale !== undefined) {
                pose.setPosition(visual.preview.x * scale, visual.preview.y * scale)
                pose.setScale(visual.preview.scale * scale, visual.preview.scale * scale, 1)
            }
            return preview(owner, pose)
        }, placement, scale)
    })
    host.around(SeedPacketRenderer, 'drawSeedPacket', function (next, args) {
        return next(args.seedType === CANNON ? { ...args, upgrade: true } : args)
    })
    host.around(SeedPacketRenderer, '_drawPlantIcon', function (next, root, args, scale) {
        if (args.seedType !== CANNON) return next(root, args, scale)
        const size = Math.max(1, scale), placement = visual.preview
        const plant = uiNode({ name: 'PacketPlant', parent: root, layer: args.layer }).node.addComponent(PlantPreview)
        plant.initialize(args.definitions, CANNON, () => Promise.resolve(),
            { x: placement.x * size, y: placement.y * size, scale: placement.scale * size }, size)
    })

    const aimed = (snapshot: any) => Object.keys(snapshot.extensions['corn:cob_aim'] ?? {}).length > 0
    const canUpgrade = (snapshot: any) => (snapshot.extensions['corn:cob_upgrade']?.targets.length ?? 0) > 0
    host.around(LevelSeedBank.prototype, 'packetState', function (next, snapshot, packet) {
        const state = next(snapshot, packet)
        return packet.seedId === CANNON && !canUpgrade(snapshot)
            ? { ...state, ready: false, warning: state.warning || this.options.ui.text('corn:requires_kernel_pults') }
            : state
    })
    host.around(LevelInputPresenter.prototype, 'selectSeedPacket', function (next, seedId) {
        const snapshot = this.game.render()
        if (seedId !== CANNON || canUpgrade(snapshot) || snapshot.cursor.mode === 'seed') return next(seedId)
        const packet = snapshot.seedPackets.find((packet: any) => packet.seedId === seedId)
        const canAfford = snapshot.extensions['pvz:debug']?.sunCost === false || snapshot.availableSun >= this.game.definitions.seeds[seedId].sunCost
        if (!packet?.ready || !canAfford) return next(seedId)
        if (!this.enabled || !this.view.introComplete || snapshot.phase !== 'gameplay' || snapshot.result !== 'playing') return
        Haptics.play()
        this.game.command({ type: 'selectSeed', seedId })
    })
    host.around(LevelHudPresenter.prototype, 'syncAdvice', function (next, snapshot, events, ...args) {
        next(snapshot, events, ...args)
        for (const event of events) if (event.type === 'corn:advice') {
            this.advice.show(this.seedBank.options.ui.text(event.data.key), event.data.style)
        }
    })
    const overItem = (snapshot: any, definitions: any, point: any) => snapshot.items.some((item: any) => {
        const definition = definitions.items[item.typeId], extra = definition ? 15 : 0
        return item.state !== 'collecting' && point.x >= item.x - extra && point.x < item.x + (definition?.width ?? 50) + extra &&
            point.y >= item.y - extra && point.y < item.y + (definition?.height ?? 70) + extra
    })
    const insidePlant = (plant: any, definitions: any, point: any) => {
        const body = definitions.plants[plant.typeId].body
        return point.x >= plant.x + body.x &&
            point.x < plant.x + body.x + body.width && point.y >= plant.y + body.y && point.y < plant.y + body.y + body.height
    }
    const hitCannon = (snapshot: any, definitions: any, point: any) => snapshot.plants.find((plant: any) =>
        plant.typeId === CANNON && plant.behaviorState?.phase === 'ready' && insidePlant(plant, definitions, point))
    const canTarget = (point: any) => point && point.x >= 0 && point.x < 800 && point.y >= behavior.minTargetY && point.y < 600
    const aimPointer = (presenter: any, event: any, right = false) => {
        const snapshot = presenter.game.render()
        if (!presenter.enabled || !presenter.view.introComplete || snapshot.paused || snapshot.phase !== 'gameplay' || snapshot.result !== 'playing') return false
        const point = presenter.boardPixel(event)
        if (!right && overItem(snapshot, presenter.game.definitions, point)) return false
        if (aimed(snapshot)) {
            // Native aiming still allows seed packets and Menu; their normal handlers run after clearing the target.
            if (!right && point.y < behavior.minTargetY) {
                presenter.game.command({ type: 'clearCursor' })
                return false
            }
            presenter.game.command(right ? { type: 'clearCursor' } : { type: 'mod', id: 'corn:fire_cannon', data: point })
            if (!right && !aimed(presenter.game.render())) Haptics.play('medium')
        } else {
            if (right || snapshot.cursor.mode !== 'none') return false
            const cannon = hitCannon(snapshot, presenter.game.definitions, point)
            if (!cannon) return false
            presenter.game.command({ type: 'mod', id: 'corn:aim_cannon', data: { ...point, entityId: cannon.entityId } })
            Haptics.play()
        }
        presenter.view.setPointer(point)
        event.propagationStopped = true
        return true
    }
    host.around(LevelInputPresenter.prototype, 'onMouseDown', function (next, event) {
        if (!GameDebugSettings.isMobileMode() && (event.getButton() === 0 || event.getButton() === 2) && aimPointer(this, event, event.getButton() === 2)) return
        return next(event)
    })
    // Keep the host's finger ownership, drag tracking and last-point release handling.
    const mobileAims = new WeakMap<object, any>()
    host.around(LevelInputPresenter.prototype, 'mobilePressReady', function (next, press) {
        const source = mobileAims.get(press)
        return source ? !insidePlant(source, this.game.definitions, press.point) : next(press)
    })
    host.around(LevelInputPresenter.prototype, 'onTouchStart', function (next, event) {
        if (!GameDebugSettings.isMobileMode() || this.mobilePress || !this.enabled || !this.view.introComplete) return next(event)
        const snapshot = this.game.render(), point = this.boardPixel(event), aiming = aimed(snapshot)
        if (snapshot.paused || snapshot.phase !== 'gameplay' || snapshot.result !== 'playing' || snapshot.cursor.mode !== 'none' ||
            overItem(snapshot, this.game.definitions, point)) return next(event)
        if (aiming && point.y < behavior.minTargetY) {
            this.game.command({ type: 'clearCursor' })
            return next(event)
        }
        const cannon = hitCannon(snapshot, this.game.definitions, point)
        next(event)
        const press = this.mobilePress
        if (!press || (!aiming && !cannon)) return
        mobileAims.set(press, cannon)
        if (cannon) {
            Haptics.play()
            press.cancelInside = !!snapshot.extensions['corn:cob_aim']?.[cannon.entityId]
            press.leftSource = false
            if (!press.cancelInside) this.game.command({ type: 'mod', id: 'corn:aim_cannon', data: { ...point, entityId: cannon.entityId } })
        }
        this.view.setPointer(this.mobilePressReady(press) ? press.point : undefined)
        event.propagationStopped = true
    })
    host.around(LevelInputPresenter.prototype, 'onTouchEnd', function (next, event) {
        const press = this.mobilePress
        if (!GameDebugSettings.isMobileMode() || !press || !mobileAims.has(press) || event.touch!.getID() !== press.id) return next(event)
        const ready = this.mobilePressReady(press)
        next(event)
        const snapshot = this.game.render()
        if (!this.enabled || snapshot.paused || snapshot.phase !== 'gameplay' || snapshot.result !== 'playing' || !aimed(snapshot)) return
        event.propagationStopped = true
        if (ready) {
            if (canTarget(press.point)) {
                this.game.command({ type: 'mod', id: 'corn:fire_cannon', data: press.point })
                if (!aimed(this.game.render())) Haptics.play('medium')
            }
            if (aimed(this.game.render())) this.game.command({ type: 'clearCursor' })
        } else if (press.cancelInside || press.leftSource) this.game.command({ type: 'clearCursor' })
    })
    host.around(LevelInputPresenter.prototype, 'start', function (next) {
        const started = this.started
        next()
        if (!started) {
            const open = this.onMenu
            this.onMenu = () => {
                if (aimed(this.game.render())) this.game.command({ type: 'clearCursor' })
                open()
            }
        }
    })

    const reticles = new WeakMap<object, any>(), mobileGuides = new WeakMap<object, string>()
    const showMobileGuide = (hud: any, board: any, row: number, column: number, width: number) => {
        hud.mobileGridGuide.active = true
        const key = `${row}:${column}:${width}`
        if (mobileGuides.get(hud) === key && hud.mobileGuideCell === -1) return
        mobileGuides.set(hud, key)
        // This Graphics node is shared with planting; invalidate its cached cell after our drawing.
        hud.mobileGuideCell = -1
        const graphics = hud.mobileGridGuide.getComponent(Graphics)
        graphics.clear(); graphics.fillColor = new Color(255, 255, 255, 72)
        graphics.fillRect(board.origin.x, -(board.origin.y + (row + 1) * board.cell.height), board.columns * board.cell.width, board.cell.height)
        graphics.fillRect(board.origin.x + column * board.cell.width, -(board.origin.y + board.rows * board.cell.height), width * board.cell.width, board.rows * board.cell.height)
    }
    host.around(LevelHudPresenter.prototype, 'syncPreviews', function (next, snapshot) {
        next(snapshot)
        const pointer = this.pointer, aim = aimed(snapshot), board = this.content.definitions.boards[this.level.board]
        let reticle = reticles.get(this)
        const show = aim && canTarget(pointer) && !overItem(snapshot, this.content.definitions, pointer) && snapshot.result === 'playing' && !snapshot.paused
        this.hoverClient.cursor = show ? 'none' : undefined
        if (!show) { if (reticle) reticle.active = false }
        else if (targetFrame) {
            if (!reticle) {
                reticle = uiNode({ name: 'CobCannonTarget', parent: this.cursorPreview.parent, anchor: { x: 0, y: 1 },
                    sprite: { frame: targetFrame, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node
                reticles.set(this, reticle)
            }
            reticle.setPosition(pointer.x + visual.target.x, -pointer.y + visual.target.y)
            reticle.setSiblingIndex(reticle.parent.children.length - 1); reticle.active = true
        }
        if (aim) {
            this.mobileGridGuide.active = false
            if (show && GameDebugSettings.isMobileMode()) {
                const column = Math.floor((pointer.x - board.origin.x) / board.cell.width), row = Math.floor((pointer.y - board.origin.y) / board.cell.height)
                if (column >= 0 && column < board.columns && row >= 0 && row < board.rows && this.level.activeRows.includes(row)) {
                    showMobileGuide(this, board, row, column, 1)
                }
            }
            return
        }
        if (!pointer || snapshot.cursor.mode !== 'seed') return
        const column = Math.floor((pointer.x - board.origin.x) / board.cell.width), row = Math.floor((pointer.y - board.origin.y) / board.cell.height)
        const selected = snapshot.cursor.seedId === CANNON
        const occupied = snapshot.plants.some((p: any) => p.typeId === CANNON && p.row === row && column >= p.column && column < p.column + behavior.width)
        if (!selected) {
            mobileGuides.delete(this)
            if (occupied) this.gridPreview.active = this.mobileGridGuide.active = false
            return
        }
        const targets = snapshot.extensions['corn:cob_upgrade']?.targets ?? []
        const base = (col: number) => snapshot.plants.some((p: any) => p.row === row && p.column === col && targets.includes(p.entityId))
        const pair = (col: number) => col >= 0 && col + 1 < board.columns && base(col) && base(col + 1)
        const start = pair(column) ? column : column - 1
        const valid = pair(start) && this.level.activeRows.includes(row)
        this.gridPreview.active = valid && !GameDebugSettings.isMobileMode()
        if (valid) {
            this.gridPreview.setPosition(board.origin.x + start * board.cell.width, -(board.origin.y + row * board.cell.height))
            if (GameDebugSettings.isMobileMode()) {
                showMobileGuide(this, board, row, start, behavior.width)
            }
        }
    })
    host.around(LevelHudPresenter.prototype, 'isPointerOverItem', function (next, snapshot) {
        return next(snapshot) || !snapshot.paused && snapshot.result === 'playing' && this.pointer && snapshot.cursor.mode === 'none' &&
            (aimed(snapshot) ? canTarget(this.pointer) : !!hitCannon(snapshot, this.content.definitions, this.pointer))
    })
    host.around(LevelEntityRenderer.prototype, 'playEvents', function (next, snapshot, events) {
        next(snapshot, events)
        for (const event of events) {
            if (event.type === 'corn:sound' && visual.sounds[event.data.id]) this.audio.sounds([visual.sounds[event.data.id]])
            if (event.type === 'projectileImpact' && event.data.typeId === 'corn:cob') {
                Haptics.play('explosion')
                const mark = this.spawnProjectileImpact(snapshot, event, visual.blastMark)
                if (mark) { mark.name = 'CornBlastMark'; mark.setSiblingIndex(0) }
            }
        }
    })
    host.around(LevelEntityRenderer.prototype, 'syncLayerOrder', function (next, snapshot) {
        next(snapshot)
        for (const node of this.entityLayer.children) if (node.name === 'CornBlastMark') node.setSiblingIndex(0)
    })
    host.around(LevelView.prototype, 'syncShake', function (next, tick, events) {
        if (events.some((event: any) => event.type === 'projectileImpact' && event.data.typeId === 'corn:cob')) {
            this.shake = { endTick: tick + visual.shake.ticks, x: visual.shake.x, y: visual.shake.y, tick: -1 }
        }
        return next(tick, events)
    })
}
