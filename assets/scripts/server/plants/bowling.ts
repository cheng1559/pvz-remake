import type { PlantBehavior } from './behaviors'
import { LevelStateResource, PositionComponent, RandomResource, ZombieComponent } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { damageZombie, isTargetableZombie } from '../zombies/damage'
import { explode } from '../combat/explosions'
import { rectOverlap } from '../combat/collision'

interface State { [key: string]: number; direction: number; rate: number; frame: number }
interface Rules { rateMin: number; rateMax: number; groundDeltas: number[]; bounceSpeed: number; damage: number; helmDamage: number }

/** A separate moving plant; it shares no stationary wall-nut health or chewing behavior. */
export const bowlingBehavior: PlantBehavior<State> = {
    tickAfterWin: true,
    createState: () => ({ direction: 0, rate: 0, frame: 0 }),
    validateState(state, definition) {
        const rules = definition.behavior as unknown as Rules
        if (rules.rateMax < rules.rateMin || !Number.isFinite(state.frame) || state.frame < 0 || ![-1, 0, 1].includes(state.direction) ||
            !Number.isFinite(state.rate) || state.rate !== 0 && (state.rate < rules.rateMin || state.rate > rules.rateMax) ||
            !Array.isArray(rules.groundDeltas) || rules.groundDeltas.length === 0 || rules.groundDeltas.some(delta => !Number.isFinite(delta) || delta <= 0) ||
            ![rules.rateMin, rules.rateMax, rules.bounceSpeed, rules.damage, rules.helmDamage].every(value => Number.isFinite(value) && value > 0)) {
            throw new Error('Invalid bowling plant state or configuration')
        }
    },
    tick({ world, commands, definitions, entity, plant, definition, position, state }) {
        const rules = definition.behavior as unknown as Rules
        const board = world.resources.get(LevelStateResource).board
        const random = world.resources.get(RandomResource)
        if (state.rate === 0) state.rate = rules.rateMin + random.nextFloat() * (rules.rateMax - rules.rateMin)
        // Use the original _ground displacement curve, rather than a separate constant travel speed.
        const next = state.frame + state.rate / 100
        const travel = (frame: number) => {
            const cycle = rules.groundDeltas.reduce((sum, delta) => sum + delta, 0)
            const whole = Math.floor(frame), index = whole % rules.groundDeltas.length
            return Math.floor(whole / rules.groundDeltas.length) * cycle + rules.groundDeltas.slice(0, index).reduce((sum, delta) => sum + delta, 0)
                + (frame - whole) * rules.groundDeltas[index]
        }
        position.x += travel(next) - travel(state.frame)
        state.frame = next
        if (position.x > board.bounds.right) { commands.destroyEntity(entity); return }
        position.y += state.direction * rules.bounceSpeed
        if (Math.abs(board.origin.y + position.row * board.cell.height - position.y) > rules.bounceSpeed) return
        let direction = state.direction
        if (direction < 0 && position.row === 0) direction = 1
        else if (direction > 0 && position.row === board.rows - 1) direction = -1
        const target = [...world.query(ZombieComponent, PositionComponent)].find(id => {
            const zombie = world.get(id, ZombieComponent)!, point = world.get(id, PositionComponent)!
            const body = definitions.zombies[zombie.typeId].body
            return point.row === position.row && isTargetableZombie(zombie) &&
                rectOverlap({ x: position.x + definition.body.x, width: definition.body.width }, { x: point.x + body.x, width: body.width }) > 0
        })
        if (target !== undefined) {
            if (definition.deathExplosion) {
                explode(world, definitions, position, definition.deathExplosion, commands)
                emitServerEvent(world.resources.get(EventQueueResource), 'plantExploded', { entityId: entity, typeId: plant.typeId, x: position.x + definition.deathExplosion.offset.x, y: position.y + definition.deathExplosion.offset.y, row: position.row })
                commands.destroyEntity(entity)
                return
            }
            const zombie = world.get(target, ZombieComponent)!
            const helm = zombie.helmHealth > 0
            damageZombie(world, definitions, target, zombie.helmHealth > 0 ? Math.min(zombie.helmHealth, rules.helmDamage) : rules.damage)
            emitServerEvent(world.resources.get(EventQueueResource), 'bowlingImpact', { entityId: target, typeId: zombie.typeId, helm })
            direction = position.row === board.rows - 1 || state.direction > 0 ? -1
                : position.row === 0 || state.direction < 0 ? 1 : random.integer(0, 1) ? -1 : 1
        }
        if (direction) { position.row += direction; state.direction = direction }
    },
}
