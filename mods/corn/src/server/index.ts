import { registerCobCannon } from './cobCannon.js'

export interface Context { host: { get(id: string): any, around(target: any, key: string, handler: (this: any, next: (...args: any[]) => any, ...args: any[]) => any): void }, assets: { id: string, json(path: string): any } }

export function register({ host, assets }: Context): void {
    registerCobCannon({ host, assets })
    const gameplay = assets.json('assets/gameplay.json')
    const { registry } = host.get('server/GameplayRegistry')
    const { defineComponent } = host.get('ecs')
    const { PositionComponent: Position, ProjectileComponent: Projectile, ZombieComponent: Zombie, RandomResource: Random } = host.get('server/components')
    const { ProjectileSystem } = host.get('server/projectiles')
    const { ZombieSystem } = host.get('server/zombies/system')
    const { damageZombie, isTargetableZombie } = host.get('server/zombies/damage')
    const { rectOverlap, getBoardBounds } = host.get('server/collision')
    const { EventQueueResource, emitServerEvent } = host.get('server/events')
    const Lob = defineComponent('corn:lob'), Butter = defineComponent('corn:buttered')
    const config = gameplay.plants['corn:kernel_pult'].behavior, physics = config.lob
    const emit = (world: any, type: string, data: any) => emitServerEvent(world.resources.get(EventQueueResource), type, data)
    registry.components.register(Lob, (state: any) => {
        for (const key of ['age', 'baseY', 'z', 'velocityX', 'velocityZ', 'rotation', 'rotationSpeed']) {
            if (!Number.isFinite(state[key])) throw new Error(`Invalid lob state: ${key}`)
        }
        if (!Number.isInteger(state.age) || state.age < 0) throw new Error('Invalid lob age')
    })
    registry.components.register(Butter, (state: any) => {
        if (!Number.isInteger(state.ticks) || state.ticks <= 0 || state.ticks > config.stunTicks) throw new Error('Invalid butter state')
    })

    // Lobbers can hit a pole vaulter in the air (DAMAGES_OFF_GROUND), but cannot butter it there.
    const canHit = (zombie: any) => isTargetableZombie(zombie) || zombie.health > 0 && zombie.state === 'vaulting'
    const findTarget = (world: any, position: any, definitions: any, attack?: any) => {
        let target: number | undefined, nearest = Infinity
        for (const id of world.query(Position, Zombie)) {
            const zombie = world.get(id, Zombie), p = world.get(id, Position), body = definitions.zombies[zombie.typeId].body
            const rect = { x: Math.trunc(p.x) + body.x, width: body.width }
            if (!canHit(zombie) || p.row !== position.row) continue
            if (zombie.state !== 'vaulting' && rect.x > getBoardBounds(world).right || attack && rectOverlap(attack, rect) < 0) continue
            if (rect.x < nearest) { nearest = rect.x; target = id }
        }
        return target
    }

    registry.plantBehaviors.register(assets.id, 'corn:kernel_pult', {
        createState: () => ({ phase: 'idle', startedAtTick: 0, readyAtTick: -1, butter: false, released: false }),
        validateState(state: any) {
            if (!['idle', 'shooting'].includes(state.phase) || !Number.isInteger(state.startedAtTick) || state.startedAtTick < 0 ||
                !Number.isInteger(state.readyAtTick) || state.readyAtTick < -1 || typeof state.butter !== 'boolean' || typeof state.released !== 'boolean') throw new Error('Invalid kernel-pult state')
        },
        tick({ world, commands, tick, entity, state, position, definitions }: any) {
            const random = world.resources.get(Random)
            if (state.readyAtTick < 0) state.readyAtTick = tick + Math.max(0, random.integer(0, config.cadenceTicks) - 1)
            const attack = { x: position.x + config.attack.x, width: config.attack.width }
            // Plant::UpdateShooter resets the counter even when there is no target.
            if (tick >= state.readyAtTick) {
                state.readyAtTick = tick + config.cadenceTicks - random.integer(0, config.cadenceJitter - 1)
                if (findTarget(world, position, definitions, attack) !== undefined) {
                    state.phase = 'shooting'; state.startedAtTick = tick; state.released = false
                    state.butter = random.nextFloat() < config.butterChance
                    emit(world, 'plantFiring', { plantId: entity })
                }
            }
            if (state.phase !== 'shooting') return
            const elapsed = tick - state.startedAtTick
            if (!state.released && elapsed >= config.releaseTicks) {
                state.released = true
                const target = findTarget(world, position, definitions, attack)
                const offset = state.butter ? config.butterOrigin : config.kernelOrigin
                const x = position.x + offset.x, y = position.y + offset.y
                let rangeX = physics.fallbackX - x, rangeY = 0
                if (target !== undefined) {
                    const p = world.get(target, Position), zombie = world.get(target, Zombie), body = definitions.zombies[zombie.typeId].body
                    const speed = zombie.state !== 'eating' && !world.has(target, Butter) ? zombie.speedPerTick * (zombie.chilledTicks > 0 ? 0.5 : 1) : 0
                    rangeX = Math.trunc(p.x) + body.x + body.width / 2 - speed * physics.leadTicks - x - physics.targetOffsetX
                    rangeY = Math.trunc(p.y) + body.y - y
                }
                const projectile = commands.createEntity(), typeId = state.butter ? config.butter : config.kernel
                const rotation = state.butter ? physics.butterRotation : physics.kernelRotation
                commands.add(projectile, Position, { x, y, row: position.row })
                commands.add(projectile, Projectile, { typeId, sourcePlantId: entity })
                commands.add(projectile, Lob, { age: 0, baseY: y, z: 0,
                    velocityX: Math.max(physics.minRangeX, rangeX) / physics.rangeDivisor,
                    velocityZ: rangeY / physics.rangeDivisor - physics.launchSpeedZ,
                    rotation: rotation.initial, rotationSpeed: rotation.speed[0] + random.nextFloat() * (rotation.speed[1] - rotation.speed[0]) })
                emit(world, 'projectileFired', { plantId: entity, projectileId: projectile, typeId })
            }
            if (elapsed >= config.shootTicks) state.phase = 'idle'
        },
    })

    host.around(ProjectileSystem.prototype, 'update', function (next, context, entity) {
        const { world, commands } = context, lob = world.get(entity, Lob)
        if (!lob) return next(context, entity)
        const position = world.get(entity, Position), projectile = world.get(entity, Projectile)
        const previousX = position.x
        lob.age++; lob.rotation += lob.rotationSpeed
        lob.velocityZ += physics.gravity
        position.x += lob.velocityX
        lob.z += lob.velocityZ
        position.y = lob.baseY + lob.z
        const butter = projectile.typeId === config.butter
        const minZ = butter ? physics.butterCollisionZ : physics.kernelCollisionZ
        // Projectile::UpdateLobMotion checks height only after the initial 20 ticks.
        if (lob.age > physics.collisionDelayTicks && (lob.velocityZ < 0 || lob.z <= minZ)) return
        const definition = this.definitions.projectiles[projectile.typeId]
        const hit = findTarget(world, position, this.definitions, { x: Math.trunc(previousX) + definition.hitbox.x, width: definition.hitbox.width })
        if (hit === undefined && lob.z <= physics.groundZ) return
        const data: any = { projectileId: entity, typeId: projectile.typeId,
            x: previousX + physics.impactOffset.x + (hit === undefined ? 0 : physics.impactOffset.targetX),
            y: position.y - lob.velocityZ + physics.impactOffset.y }
        if (hit !== undefined) {
            const zombie = world.get(hit, Zombie)
            data.targetId = hit; data.targetTypeId = zombie.typeId
            const helm = this.definitions.zombies[zombie.typeId].helm
            if (butter && zombie.helmHealth > 0 && helm) data.helm = helm.type
            damageZombie(world, this.definitions, hit, definition.damage, {}, commands)
            if (butter && zombie.hasHead && isTargetableZombie(zombie)) world.add(hit, Butter, { ticks: config.stunTicks })
        }
        emit(world, 'projectileImpact', data)
        commands.destroyEntity(entity)
    })

    host.around(ZombieSystem.prototype, 'run', function (next, context) {
        for (const entity of context.world.query(Butter, Zombie)) {
            const zombie = context.world.get(entity, Zombie)
            if (!zombie.hasHead || !isTargetableZombie(zombie)) context.world.remove(entity, Butter)
        }
        return next(context)
    })
    host.around(ZombieSystem.prototype, 'updateActive', function (next, context, entity) {
        const state = context.world.get(entity, Butter)
        if (!state) return next(context, entity)
        if (--state.ticks <= 0) { context.world.remove(entity, Butter); return next(context, entity) }
        // Death, mowing, hit flashes and chilled timers keep their normal lifecycle.
    })
}
