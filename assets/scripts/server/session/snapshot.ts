import type { World } from '@/ecs/index'
import type { PlantSnapshot, ProjectileSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { jsonRoundTrip } from '@/shared/protocol/index'
import {
    EconomyStateResource, LevelStateResource, MowedPlantComponent, MowerComponent, PlantAttackComponent, PlantComponent, PositionComponent, ProjectileComponent,
    SeedBankResource, ZombieComponent, type Plant, type Position,
} from '../state/components'
import { DebugRulesResource, getDebugRules } from '../debug/debugRules'
import { heightOverRow, ProjectileMotionsResource } from '../combat/motions'
import { ItemComponent, TutorialResource, WaveResource } from '../state/levelState'
import { planting } from '../seeds/planting'
import { selectedSeedId, selectedTeam } from '../seeds/seedBank'
import { seedChooserSnapshot } from '../seeds/seedChooser'
import type { Session } from './session'
import { tools } from '../seeds/tools'
import { getActiveTutorial } from '../tutorials'
import { levelRule } from '../rules/registry'
import { zombiePace } from '../zombies/animation'
import { gridItems as lawnGridItems } from '../level/lawn'
import { plantPace } from '../plants/chill'
import { pacedLayers } from '@/shared/content/animation'

/** What the client draws each frame. Mods add their state through `host.around(snapshot, 'build', ...)`. */
export const snapshot = {
    build(session: Session): WorldSnapshot {
        const { world, tick, gameplayTick, definitions, gameplay } = session
        const level = world.resources.get(LevelStateResource)
        const economy = world.resources.get(EconomyStateResource)
        const seedBank = world.resources.get(SeedBankResource)
        const waves = world.resources.get(WaveResource)
        const tutorial = world.resources.get(TutorialResource)
        const selectedSeed = selectedSeedId(seedBank)
        const heldTeam = selectedTeam(seedBank)
        const seedPackets = seedBank.packets.map((packet, slot) => {
            if (!packet) return null
            const cooldownRemaining = Math.max(0, packet.readyAtTick - gameplayTick)
            const selected = seedBank.selection.mode === 'seed' && seedBank.selection.slot === slot
            return {
                seedId: packet.seedId,
                ...(packet.team === undefined ? {} : { team: packet.team }),
                ready: cooldownRemaining === 0 && !selected,
                selected,
                cooldownRemaining,
                availability: planting.seedAvailability(session, packet.seedId, undefined, slot),
                cooldownTotal: cooldownRemaining === 0 ? 0 : packet.cooldownTotal,
            }
        })
        const plants: WorldSnapshot['plants'] = [...world.query(PositionComponent, PlantComponent)].map(entity => {
            const plant = world.get(entity, PlantComponent)!
            const production = definitions.plants[plant.typeId].producer && world.get(entity, PlantAttackComponent)
            return {
                ...plantSnapshot(entity, plant, world.get(entity, PositionComponent)!),
                ...(definitions.plants[plant.typeId].nocturnal && !level.board.night ? { asleep: true as const } : {}),
                ...(production ? { produceTicks: Math.max(0, production.readyAtTick - gameplayTick) } : {}),
            }
        })
        for (const entity of world.query(PositionComponent, MowedPlantComponent)) {
            const { plant, squash, left } = world.get(entity, MowedPlantComponent)!
            plants.push({ ...plantSnapshot(entity, plant, world.get(entity, PositionComponent)!), mowered: { time: squash.time, ...(left ? { left } : {}) } })
        }
        const zombies = [...world.query(PositionComponent, ZombieComponent)].map(entity => {
            const position = world.get(entity, PositionComponent)!
            const zombie = world.get(entity, ZombieComponent)!
            return {
                entityId: entity,
                typeId: zombie.typeId,
                state: zombie.state,
                health: zombie.health,
                maxHealth: zombie.maxHealth,
                // The rates a view plays them at: a chilled zombie's body's is halved.
                animations: pacedLayers(zombie.animations, layer => zombiePace(zombie, layer)),
                alpha: zombie.state === 'dying' ? Math.min(255, Math.trunc(255 * zombie.deathTicksRemaining / 10)) : 255,
                hasHead: zombie.hasHead,
                hasTongue: zombie.hasTongue,
                hasArm: zombie.hasArm,
                helmHealth: zombie.helmHealth,
                shieldHealth: zombie.shieldHealth,
                chilled: zombie.chilledTicks > 0,
                ...(zombie.team === 'plants' ? { team: 'plants' as const } : {}),
                hasPole: zombie.hasPole,
                ...(zombie.riseTicks ? { riseTicks: zombie.riseTicks } : {}),
                ...(definitions.zombies[zombie.typeId].enrage && zombie.shieldHealth === 0 ? { enraged: true } : {}),
                ...(zombie.behaviorState ? { behaviorState: jsonRoundTrip(zombie.behaviorState) } : {}),
                ...position,
            }
        })
        // A mower set off runs as a projectile, but is listed with the mowers it is, as it waited.
        const projectiles = [...world.query(PositionComponent, ProjectileComponent)].filter(entity => !world.has(entity, MowerComponent))
            .map(entity => projectileSnapshot(world, entity))
        const mowers: WorldSnapshot['mowers'] = [...world.query(PositionComponent, MowerComponent)].map(entity => {
            const { state } = world.get(entity, MowerComponent)!
            return state === 'triggered' ? { ...projectileSnapshot(world, entity), state }
                : { entityId: entity, typeId: level.definition.lawnMower, ...world.get(entity, PositionComponent)!, state }
        })
        const items = [...world.query(PositionComponent, ItemComponent)].map(entity => {
            const position = world.get(entity, PositionComponent)!
            const item = world.get(entity, ItemComponent)!
            return {
                entityId: entity,
                typeId: item.typeId,
                state: item.state,
                x: position.x,
                y: position.y,
                scale: item.scale,
                alpha: item.alpha,
                ...(item.landed ? { landed: true as const } : {}),
                ...(item.arrow ? { arrow: true as const } : {}),
            }
        })

        const gridItems = lawnGridItems(world)

        const owned = tools.owned(session), script = getActiveTutorial(world)
        const question = tutorial.dialogIndex === undefined ? undefined : script?.dialogQuestion?.(world, definitions)
        const ruleSnapshot = levelRule(world)?.snapshot?.(world)
        return {
            levelId: level.id,
            tick,
            gameplayTick,
            phase: level.phase,
            result: level.result,
            paused: level.paused,
            sun: economy.sun,
            money: economy.money,
            wave: {
                index: waves.index,
                total: waves.plan.length,
                flagWaves: waves.plan.flatMap((wave, index) => wave.flagWave ? [index] : []),
                countdown: Math.max(0, (waves.nextWaveAtTick ?? gameplayTick) - gameplayTick),
                ...(level.phase === 'intro' ? { previewZombies: waves.plan.flatMap(wave => wave.zombies).reduce<Record<string, number>>((counts, id) => { counts[id] = (counts[id] ?? 0) + 1; return counts }, {}) } : {}),
            },
            cursor: seedBank.selection.mode === 'tool' ? { ...seedBank.selection } : selectedSeed
                ? { mode: 'seed', seedId: selectedSeed, ...(heldTeam ? { team: heldTeam } : {}) }
                : { mode: 'none' },
            seedPackets,
            // A game that opened the chooser keeps `choosing`, also once confirmed.
            ...(seedBank.choosing === undefined ? {} : { seedChooser: seedChooserSnapshot(world, definitions) }),
            conveyorPackets: seedBank.conveyor?.packets.map(packet => ({ id: packet.id, x: packet.x, ...packet.card,
                selected: seedBank.selection.mode === 'conveyor' && packet.id === seedBank.selection.packetId,
                availability: planting.seedAvailability(session, packet.card.seedId, packet.id) })) ?? [],
            ...(gridItems.length ? { gridItems } : {}),
            plants,
            zombies,
            projectiles,
            items,
            mowers,
            tutorial: { step: tutorial.step, ...(script?.dave ? { dave: true } : {}), ...(script?.toolsInIntro ? { toolsInIntro: true } : {}) },
            ...(owned.length ? { tools: { owned, available: owned.filter(id => tools.available(session, id)) } } : {}),
            ...(seedBank.conveyor ? { conveyor: { ticks: seedBank.conveyor.moveTicks } } : {}),
            ...(tutorial.dialogIndex === undefined ? {} : { dialog: { index: tutorial.dialogIndex, ...(question ? { question } : {}) } }),
            ...(world.resources.has(DebugRulesResource) ? { debug: { ...getDebugRules(world) } } : {}),
            extensions: { ...gameplay.components.snapshot(world),
                ...(ruleSnapshot ? { [level.definition.rules!.kind]: ruleSnapshot } : {}) },
        }
    },
}

/** A projectile as a view draws it: where it is, and how high, how far thrown and which way it points, by its motion. */
function projectileSnapshot(world: World, entity: number): ProjectileSnapshot {
    const position = world.get(entity, PositionComponent)!
    const projectile = world.get(entity, ProjectileComponent)!
    const motion = world.resources.get(ProjectileMotionsResource).of(projectile)
    const height = motion.height?.(projectile.motionState) ?? heightOverRow(world, projectile.definition, position), facing = motion.facing?.(projectile.motionState)
    const lift = motion.lift?.(projectile.motionState) ?? 0
    return { entityId: entity, typeId: projectile.typeId, ...position, ...(projectile.team === 'zombies' ? { team: 'zombies' as const } : {}),
        ...(height > 0 ? { height } : {}), ...(lift > 0 ? { lift } : {}), ...(facing === undefined ? {} : { facing }) }
}

/**
 * A plant as a view draws it, standing or mowed, field by field: the server's own counters (its seed, its blink, its
 * last bite) stay on the server, and its layers go at the rates a view plays them at (a chilled plant's are halved).
 */
function plantSnapshot(entityId: number, plant: Plant, position: Position): PlantSnapshot {
    return {
        entityId,
        typeId: plant.typeId,
        x: position.x,
        y: position.y,
        row: position.row,
        column: plant.column,
        health: plant.health,
        maxHealth: plant.maxHealth,
        ...(plant.ability ? { ability: { ...plant.ability } } : {}),
        ...(plant.team === undefined ? {} : { team: plant.team }),
        ...(plant.chilledTicks ? { chilledTicks: plant.chilledTicks } : {}),
        ...(plant.animations ? { animations: pacedLayers(plant.animations, () => plantPace(plant)) } : {}),
        ...(plant.behaviorState ? { behaviorState: jsonRoundTrip(plant.behaviorState) } : {}),
    }
}
