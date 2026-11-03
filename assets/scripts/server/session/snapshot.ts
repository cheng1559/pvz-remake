import type { JsonObject, WorldSnapshot } from '@/shared/protocol/index'
import { jsonRoundTrip } from '@/shared/protocol/index'
import { EconomyStateResource, LawnMowerComponent, LevelStateResource, PlantAttackComponent, PlantComponent, PositionComponent, ProjectileComponent, SeedBankResource, ZombieComponent } from '../state/components'
import { DebugRulesResource, getDebugRules } from '../debug/debugRules'
import { getAvailableSun } from '../level/items'
import { ItemComponent, TutorialResource, WaveResource } from '../state/levelState'
import { planting } from '../seeds/planting'
import { selectedSeedId } from '../seeds/seedBank'
import { seedChooserSnapshot } from '../seeds/seedChooser'
import type { Session } from './session'
import { tools } from '../seeds/tools'
import { getActiveTutorial } from '../tutorials'
import { levelRule } from '../rules/registry'

/** What the client draws each frame. Mods add their state through `host.around(snapshot, 'build', ...)`. */
export const snapshot = {
    build(session: Session): WorldSnapshot {
        const { world, tick, gameplayTick, definitions, gameplay } = session
        const level = world.resources.get(LevelStateResource)
        const economy = world.resources.get(EconomyStateResource)
        const seedBank = world.resources.get(SeedBankResource)
        const waves = world.resources.get(WaveResource)
        const tutorial = world.resources.get(TutorialResource)
        const seedPackets = seedBank.packets.map((packet, slot) => {
            const cooldownRemaining = Math.max(0, packet.readyAtTick - gameplayTick)
            const selected = seedBank.selection.mode === 'seed' && seedBank.selection.slot === slot
            return {
                seedId: packet.seedId,
                ...(packet.team === 'zombies' ? { team: 'zombies' as const } : {}),
                ready: cooldownRemaining === 0 && !selected,
                selected,
                cooldownRemaining,
                availability: planting.seedAvailability(session, packet.seedId, undefined, slot),
                cooldownTotal: cooldownRemaining === 0
                    ? 0
                    : packet.cooldownTotal ?? definitions.seeds[packet.seedId].cooldownTicks,
            }
        })
        const plants = [...world.query(PositionComponent, PlantComponent)].map(entity => {
            const position = world.get(entity, PositionComponent)!
            const plant = world.get(entity, PlantComponent)!
            const production = definitions.plants[plant.typeId].producer && world.get(entity, PlantAttackComponent)
            return {
                entityId: entity, ...plant, ...position,
                ...(plant.ability ? { ability: { ...plant.ability } } : {}),
                ...(plant.behaviorState ? { behaviorState: jsonRoundTrip(plant.behaviorState) } : {}),
                ...(definitions.plants[plant.typeId].nocturnal && !level.board.night ? { asleep: true as const } : {}),
                ...(production ? { produceTicks: Math.max(0, production.readyAtTick - gameplayTick) } : {}),
            }
        })
        const zombies = [...world.query(PositionComponent, ZombieComponent)].map(entity => {
            const position = world.get(entity, PositionComponent)!
            const zombie = world.get(entity, ZombieComponent)!
            return {
                entityId: entity,
                typeId: zombie.typeId,
                state: zombie.state,
                health: zombie.health,
                maxHealth: zombie.maxHealth,
                animation: zombie.animation,
                animationTime: zombie.animationTime,
                animationSpeed: zombie.animationSpeed,
                moweredTicksRemaining: zombie.moweredTicksRemaining,
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
        const projectiles = [...world.query(PositionComponent, ProjectileComponent)].map(entity => {
            const position = world.get(entity, PositionComponent)!
            const projectile = world.get(entity, ProjectileComponent)!
            return { entityId: entity, typeId: projectile.typeId, ...position, ...(projectile.team === 'zombies' ? { team: 'zombies' as const } : {}) }
        })
        const lawnMowers = [...world.query(PositionComponent, LawnMowerComponent)].map(entity => {
            const position = world.get(entity, PositionComponent)!
            const mower = world.get(entity, LawnMowerComponent)!
            return { entityId: entity, typeId: mower.typeId, state: mower.state, ...position }
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

        const owned = tools.owned(session), script = getActiveTutorial(world)
        const question = tutorial.dialogIndex === undefined ? undefined : script?.dialogQuestion?.(world, definitions)
        const ruleSnapshot = levelRule(world)?.snapshot?.(world)
        const dialog: JsonObject | undefined = tutorial.dialogIndex === undefined ? undefined : { index: tutorial.dialogIndex, ...(question ? { question } : {}) }
        return {
            levelId: level.id,
            tick,
            gameplayTick,
            phase: level.phase,
            result: level.result,
            paused: level.paused,
            sun: economy.sun,
            availableSun: getAvailableSun(world, definitions),
            money: economy.money,
            wave: {
                index: waves.index,
                total: waves.plan.length,
                flagWaves: waves.plan.flatMap((wave, index) => wave.flagWave ? [index] : []),
                countdown: Math.max(0, (waves.nextWaveAtTick ?? gameplayTick) - gameplayTick),
                ...(level.phase === 'intro' ? { previewZombies: waves.plan.flatMap(wave => wave.zombies).reduce<Record<string, number>>((counts, id) => { counts[id] = (counts[id] ?? 0) + 1; return counts }, {}) } : {}),
            },
            cursor: seedBank.selection.mode === 'tool' ? { ...seedBank.selection } : selectedSeedId(seedBank)
                ? { mode: 'seed', seedId: selectedSeedId(seedBank)!,
                    ...(seedBank.selection.mode === 'seed' && seedBank.packets[seedBank.selection.slot]?.team === 'zombies' ? { team: 'zombies' as const } : {}) }
                : { mode: 'none' },
            seedPackets,
            // A game that opened the chooser keeps `choosing`, also once confirmed.
            ...(seedBank.choosing === undefined ? {} : { seedChooser: seedChooserSnapshot(world, definitions) }),
            conveyorPackets: seedBank.conveyor?.packets.map(packet => ({ ...packet, selected: seedBank.selection.mode === 'conveyor' && packet.id === seedBank.selection.packetId,
                availability: planting.seedAvailability(session, packet.seedId, packet.id) })) ?? [],
            ...(waves.graves ? { graves: waves.graves.map(grave => ({ ...grave })) } : {}),
            plants,
            zombies,
            projectiles,
            items,
            lawnMowers,
            tutorial: { id: level.definition.tutorial, step: tutorial.step, ...(script?.dave ? { dave: true } : {}), ...(script?.toolsInIntro ? { toolsInIntro: true } : {}) },
            extensions: { ...gameplay.components.snapshot(world),
                ...(owned.length ? { 'pvz:tools': { owned, available: owned.filter(id => tools.available(session, id)) } } : {}),
                ...(seedBank.conveyor ? { 'pvz:conveyor': { ticks: seedBank.conveyor.moveTicks } } : {}),
                ...(dialog ? { 'pvz:dialog': dialog } : {}),
                ...(ruleSnapshot ? { [level.definition.rules!.kind]: ruleSnapshot } : {}),
                ...(world.resources.has(DebugRulesResource) ? { 'pvz:debug': { ...getDebugRules(world) } } : {}) },
        }
    },
}
