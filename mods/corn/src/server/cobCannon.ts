import type { Context } from './index.js'

const CANNON = 'corn:cob_cannon'

export function registerCobCannon({ host, assets }: Context): void {
    const config = assets.json('assets/gameplay.json').plants[CANNON].behavior
    const { registry } = host.get('server/GameplayRegistry')
    const { defineComponent } = host.get('ecs')
    const { PositionComponent: Position, PlantComponent: Plant, ProjectileComponent: Projectile, ZombieComponent: Zombie,
        LevelStateResource: Level, SeedBankResource: SeedBank } = host.get('server/components')
    const { TutorialResource: Tutorial } = host.get('server/levelState')
    const { IntegratedGameServer } = host.get('server/IntegratedGameServer')
    const { ProjectileSystem } = host.get('server/projectiles')
    const { explode } = host.get('server/explosions')
    const { rectOverlap } = host.get('server/collision')
    const { getDebugRules } = host.get('server/debug/DebugRules')
    const { EventQueueResource, emitServerEvent } = host.get('server/events')
    const Aim = defineComponent('corn:cob_aim'), Flight = defineComponent('corn:cob_flight')
    const upgrading = new WeakMap<object, Set<number>>()
    const emit = (world: any, type: string, data: any) => emitServerEvent(world.resources.get(EventQueueResource), type, data)
    const advice = (world: any, key: string, style: string) => {
        const shown = world.resources.get(Tutorial).displayedAdvice ??= []
        if (shown.includes(key)) return
        shown.push(key)
        emit(world, 'corn:advice', { key, style })
    }
    const clearAim = (world: any) => { for (const id of world.query(Aim)) world.remove(id, Aim) }
    const at = (world: any, row: number, column: number) => [...world.query(Position, Plant)].find(id => {
        const plant = world.get(id, Plant)
        return world.get(id, Position).row === row && column >= plant.column && column < plant.column + (plant.typeId === CANNON ? config.width : 1)
    })
    const pair = (world: any, row: number, column: number) => {
        const board = world.resources.get(Level).board
        return column >= 0 && column + config.width <= board.columns && [column, column + 1].every(col => {
            const id = at(world, row, col), plant = id === undefined ? undefined : world.get(id, Plant)
            return plant?.typeId === config.basePlant && plant.health > 0
        })
    }
    const upgradeTargets = (world: any) => {
        const result = new Set<number>(), rows = world.resources.get(Level).definition.activeRows
        for (const id of world.query(Position, Plant)) {
            const p = world.get(id, Position), plant = world.get(id, Plant)
            if (rows.includes(p.row) && plant.typeId === config.basePlant && pair(world, p.row, plant.column)) {
                result.add(id); result.add(at(world, p.row, plant.column + 1)!)
            }
        }
        return [...result]
    }
    host.around(IntegratedGameServer.prototype, 'snapshot', function (next) {
        const snapshot = next()
        snapshot.extensions['corn:cob_upgrade'] = { targets: upgradeTargets(this.requireSession().world) }
        return snapshot
    })
    host.around(IntegratedGameServer.prototype, 'selectSeed', function (next, session, seedId) {
        if (seedId === CANNON) {
            const world = session.world, packet = world.resources.get(SeedBank).packets.find((value: any) => value.seedId === seedId)
            const rules = getDebugRules(world)
            if (packet && (!rules.cooldown || packet.readyAtTick <= session.gameplayTick) &&
                (!rules.sunCost || this.availableSun(world) >= this.definitions.seeds[seedId].sunCost) && !upgradeTargets(world).length) {
                emit(world, 'corn:sound', { id: 'buzzer' })
                advice(world, 'corn:needs_kernel_pults', 'hint-long')
                return 'seed-not-available'
            }
        }
        return next(session, seedId)
    })
    registry.components.register(Aim, (state: any) => {
        if (!Number.isInteger(state.startedAtTick) || state.startedAtTick < 0 || !Number.isFinite(state.x) || !Number.isFinite(state.y)) throw new Error('Invalid cannon aim')
    })
    registry.components.register(Flight, (state: any) => {
        for (const key of ['baseY', 'z', 'velocityZ', 'targetX', 'targetRow', 'rotation']) if (!Number.isFinite(state[key])) throw new Error('Invalid cannon flight')
        if (!Number.isInteger(state.targetRow) || state.targetRow < 0) throw new Error('Invalid cannon target row')
    })

    host.around(IntegratedGameServer.prototype, 'findPlantAt', function (next, world, row, column) {
        const entity = next(world, row, column) ?? at(world, row, column)
        return entity !== undefined && upgrading.get(this)?.has(entity) ? undefined : entity
    })
    // Keep the bases intact until spending, cooldown and placement validation have all succeeded.
    host.around(IntegratedGameServer.prototype, 'placePlant', function (next, session, row, column, debugSeedId) {
        const world = session.world, seedId = debugSeedId ?? world.resources.get(SeedBank).selectedSeedId
        if (seedId !== CANNON) return next(session, row, column, debugSeedId)
        const board = world.resources.get(Level).board
        if (!Number.isInteger(row) || row < 0 || row >= board.rows) return 'row-not-active'
        if (!Number.isInteger(column) || column < 0 || column >= board.columns) return 'column-out-of-range'
        if (!pair(world, row, column)) {
            if (pair(world, row, column - 1)) column--
            else {
                if (!debugSeedId) advice(world, 'corn:only_on_kernel_pults', 'hint')
                return 'cell-occupied'
            }
        }
        const bases = [at(world, row, column)!, at(world, row, column + 1)!]
        upgrading.set(this, new Set(bases))
        try {
            const rejection = next(session, row, column, debugSeedId)
            if (rejection !== undefined) return rejection
            for (const id of bases) world.destroyEntity(id)
        } finally {
            upgrading.delete(this)
        }
    })

    host.around(IntegratedGameServer.prototype, 'executeCommand', function (next, command) {
        const session = this.requireSession(), world = session.world, level = world.resources.get(Level)
        if (command.type !== 'mod' || !['corn:aim_cannon', 'corn:fire_cannon'].includes(command.id)) {
            const rejection = next(command)
            if (rejection === undefined && ['clearCursor', 'selectSeed'].includes(command.type)) clearAim(world)
            return rejection
        }
        if (level.result !== 'playing') return 'game-not-playing'
        if (level.phase !== 'gameplay') return 'intro-not-complete'
        if (level.paused) return 'game-paused'
        const { entityId, x, y } = command.data
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x >= 800 || y < 0 || y >= 600) return 'unsupported-command'
        if (command.id === 'corn:aim_cannon') {
            const plant = world.get(entityId, Plant), p = world.get(entityId, Position)
            if (plant?.typeId !== CANNON || plant.health <= 0 || plant.behaviorState.phase !== 'ready' || !p) return 'unsupported-command'
            if (world.resources.get(SeedBank).selectedSeedId || x < p.x || x >= p.x + this.definitions.plants[CANNON].body.width || y < p.y || y >= p.y + this.definitions.plants[CANNON].body.height) return 'unsupported-command'
            clearAim(world)
            world.add(entityId, Aim, { startedAtTick: session.gameplayTick, x, y })
            return
        }
        const selected = [...world.query(Aim, Plant)].find(id => world.get(id, Plant).typeId === CANNON)
        if (selected === undefined) return 'unsupported-command'
        const aim = world.get(selected, Aim), state = world.get(selected, Plant).behaviorState
        if (y >= config.minTargetY && session.gameplayTick - aim.startedAtTick < config.clickDelayTicks && Math.hypot(x - aim.x, y - aim.y) < config.clickGuardRadius) return
        clearAim(world)
        if (y < config.minTargetY || state.phase !== 'ready') return
        Object.assign(state, { phase: 'firing', startedAtTick: session.gameplayTick, targetX: x, targetY: y, released: false })
    })

    registry.plantBehaviors.register(assets.id, CANNON, {
        createState: () => ({ phase: 'arming', startedAtTick: -1, initial: true, released: false, targetX: 0, targetY: 0 }),
        validateState(state: any) {
            if (!['arming', 'loading', 'ready', 'firing'].includes(state.phase) || !Number.isInteger(state.startedAtTick) || state.startedAtTick < -1 ||
                typeof state.initial !== 'boolean' || typeof state.released !== 'boolean' || !Number.isFinite(state.targetX) || !Number.isFinite(state.targetY)) throw new Error('Invalid cannon state')
        },
        tick({ world, commands, tick, entity, state, position }: any) {
            if (state.startedAtTick < 0) state.startedAtTick = tick - 1
            const elapsed = tick - state.startedAtTick
            const sound = (id: string) => emit(world, 'corn:sound', { id })
            if (state.phase === 'arming' && elapsed >= (state.initial ? config.initialArmingTicks : config.rechargeTicks)) {
                state.phase = 'loading'; state.startedAtTick = tick
            } else if (state.phase === 'loading') {
                if (elapsed === config.chargeSoundTicks) sound('corn:shoop')
                if (elapsed >= config.chargeTicks) { state.phase = 'ready'; state.startedAtTick = tick }
            } else if (state.phase === 'firing') {
                if (elapsed === config.launchSoundTicks) sound('corn:coblaunch')
                if (!state.released && elapsed >= config.releaseTicks) {
                    state.released = true
                    const board = world.resources.get(Level).board
                    const projectile = commands.createEntity(), x = position.x + config.origin.x, y = position.y + config.origin.y
                    commands.add(projectile, Position, { x, y, row: position.row })
                    commands.add(projectile, Projectile, { typeId: config.projectile, sourcePlantId: entity })
                    commands.add(projectile, Flight, { baseY: y, z: 0, velocityZ: -config.flight.speed, rotation: Math.PI / 2,
                        targetX: state.targetX - config.flight.targetOffsetX,
                        targetRow: Math.max(0, Math.min(board.rows - 1, Math.floor((state.targetY - board.origin.y) / board.cell.height))) })
                    emit(world, 'projectileFired', { plantId: entity, projectileId: projectile, typeId: config.projectile })
                }
                if (elapsed >= config.shootTicks) {
                    state.phase = 'arming'; state.startedAtTick = tick; state.initial = false
                }
            }
        },
    })

    host.around(ProjectileSystem.prototype, 'update', function (next, context, entity) {
        const { world, commands } = context, flight = world.get(entity, Flight)
        if (!flight) return next(context, entity)
        const p = world.get(entity, Position), board = world.resources.get(Level).board, previousX = p.x
        if (flight.velocityZ < 0 && flight.z < config.flight.turnZ) {
            flight.velocityZ = config.flight.speed; flight.rotation = -Math.PI / 2
            p.row = flight.targetRow; p.x = flight.targetX
            flight.baseY = board.origin.y + p.row * board.cell.height
        }
        p.x += config.flight.velocityX; flight.z += flight.velocityZ; p.y = flight.baseY + flight.z
        if (flight.velocityZ < 0 || flight.z <= config.flight.collisionZ) return
        const hitbox = this.definitions.projectiles[config.projectile].hitbox
        const hit = [...world.query(Position, Zombie)].some(id => {
            const zombie = world.get(id, Zombie), position = world.get(id, Position), body = this.definitions.zombies[zombie.typeId].body
            return zombie.health > 0 && position.row === p.row && zombie.state !== 'burned' && rectOverlap(
                { x: Math.trunc(previousX) + hitbox.x, width: hitbox.width }, { x: Math.trunc(position.x) + body.x, width: body.width }) >= 0
        })
        if (!hit && flight.z <= config.flight.groundZ) return
        explode(world, this.definitions, { x: p.x, y: flight.baseY, row: p.row }, config.explosion, commands)
        emit(world, 'projectileImpact', { projectileId: entity, typeId: config.projectile, x: p.x, y: flight.baseY })
        commands.destroyEntity(entity)
    })
}
