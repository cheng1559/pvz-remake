import type { GameSystem, World } from '@/ecs/index'
import type { FreezeDefinition, GameplayDefinitions } from '@/shared/content/gameplay'
import { isHostile, plantTeam, type Team, zombieTeam } from '@/shared/content/teams'
import { plantCanBeChilled, plantCanBeFrozen, zombieCanBeChilled, zombieCanBeFrozen } from './cold'
import { TEAMS } from '@/shared/protocol'
import {
    type EntityRemover, LevelStateResource, type Plant, PlantComponent, PositionComponent, RandomResource, type Zombie, ZombieComponent,
} from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { chillZombie, damageZombie } from '../zombies/damage'
import { chillPlant } from '../plants/chill'
import { damagePlant } from '../plants/damage'

/**
 * Plant::DoSpecial for a plant that freezes (the ice-shroom): FOLEY_FROZEN and PARTICLE_ICE_TRAP where it stands
 * (`plantFroze`), the ice (Plant::IceZombies), and it is gone.
 */
export function freezeFromPlant(world: World, definitions: GameplayDefinitions, entity: number, freeze: FreezeDefinition, remover: EntityRemover): void {
    const plant = world.get(entity, PlantComponent)!, position = world.get(entity, PositionComponent)!, team = plantTeam(plant)
    emitServerEvent(world.resources.get(EventQueueResource), 'plantFroze', {
        entityId: entity, typeId: plant.typeId, x: position.x, y: position.y, row: position.row, ...(team === 'zombies' ? { team } : {}),
    })
    freezeHostiles(world, definitions, team, freeze, remover)
    remover.destroyEntity(entity)
}

/**
 * Plant::IceZombies, for the side that set it off (`team`): every zombie and every plant hostile to it on the board,
 * off the screen too, is frozen (Zombie::HitIceTrap), and the board keeps the side frozen for a while
 * (Board::mIceTrapCounter). The original's ice spares the mind-controlled zombies, the only ones on its own side; here
 * it is the side that is spared, and a zombies' ice freezes the plants too, which the original never has to.
 */
export function freezeHostiles(world: World, definitions: GameplayDefinitions, team: Team, freeze: FreezeDefinition, remover: EntityRemover): void {
    for (const entity of world.query(ZombieComponent)) {
        const zombie = world.get(entity, ZombieComponent)!
        if (isHostile(zombieTeam(zombie), team) && world.hasEntity(entity)) freezeZombie(world, definitions, entity, zombie, freeze, remover)
    }
    for (const entity of world.query(PlantComponent)) {
        const plant = world.get(entity, PlantComponent)
        if (plant && isHostile(plantTeam(plant), team) && world.hasEntity(entity)) freezePlant(world, definitions, entity, plant, freeze, remover)
    }
    if (freeze.boardTicks <= 0) return
    const level = world.resources.get(LevelStateResource)
    level.iceTrap = { ...level.iceTrap }
    for (const side of TEAMS) if (isHostile(side, team)) level.iceTrap[side] = freeze.boardTicks
}

/**
 * Zombie::HitIceTrap: chilled (ApplyChill), then frozen for its time, shorter for one cold already, and hurt through
 * its shield. Zombie::CanBeChilled spares one dying or rising from a grave, or kept from the cold by its type; one its
 * type keeps from the ice (CanBeFrozen: a pole vaulter in the air) is only chilled (server/combat/cold.ts).
 */
function freezeZombie(world: World, definitions: GameplayDefinitions, entity: number, zombie: Zombie, freeze: FreezeDefinition, remover: EntityRemover): void {
    const definition = definitions.zombies[zombie.typeId]
    if (!zombieCanBeChilled(zombie, definition)) return
    const cold = zombie.chilledTicks > 0 || zombie.frozenTicks !== undefined
    if (freeze.chillTicks > 0) chillZombie(world, definitions, entity, zombie, freeze.chillTicks)
    if (!zombieCanBeFrozen(zombie, definition)) return
    zombie.frozenTicks = frozenTicks(world, freeze, cold)
    if (freeze.damage > 0) damageZombie(world, definitions, entity, freeze.damage, { bypassShield: true }, remover)
}

/**
 * Not in the original: a plant frozen as a zombie is, chilled for as long, frozen for as long and hurt as much (flashing
 * as a hostile plant's hit does); frozen, it does nothing (plants/chill.ts). One its type keeps from the ice is only
 * chilled, and one kept from the cold not even that (server/combat/cold.ts).
 */
function freezePlant(world: World, definitions: GameplayDefinitions, entity: number, plant: Plant, freeze: FreezeDefinition, remover: EntityRemover): void {
    if (!plantCanBeChilled(plant)) return
    const cold = plant.chilledTicks > 0 || plant.frozenTicks !== undefined
    if (freeze.chillTicks > 0) chillPlant(world, definitions, entity, plant, freeze.chillTicks)
    if (!plantCanBeFrozen(plant)) return
    plant.frozenTicks = frozenTicks(world, freeze, cold)
    if (freeze.damage > 0) damagePlant(world, definitions, entity, freeze.damage, remover)
}

function frozenTicks(world: World, freeze: FreezeDefinition, cold: boolean): number {
    const { min, max } = cold ? freeze.coldTicks : freeze.ticks
    return world.resources.get(RandomResource).integer(min, max)
}

/** Board::Update: the board's count of a side frozen (LevelState.iceTrap) runs down. */
export function createBoardIceSystem(): GameSystem {
    return {
        id: 'pvz:board-ice',
        run({ world }) {
            const level = world.resources.get(LevelStateResource), iceTrap = level.iceTrap
            if (!iceTrap || level.result === 'lost' || level.paused) return
            for (const side of TEAMS) if (iceTrap[side] !== undefined && --iceTrap[side]! <= 0) delete iceTrap[side]
            if (!Object.keys(iceTrap).length) delete level.iceTrap
        },
    }
}
