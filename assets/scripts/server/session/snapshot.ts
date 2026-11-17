import type { WorldSnapshot } from '@/shared/protocol/index'
import {
    EconomyStateResource, LevelStateResource, MowedPlantComponent, MowerComponent, PlantComponent, PositionComponent, ProjectileComponent,
    SeedBankResource, ZombieComponent,
} from '../state/components'
import { DebugRulesResource, getDebugRules } from '../debug/debugRules'
import { ItemComponent, TutorialResource, WaveResource } from '../state/levelState'
import { planting } from '../seeds/planting'
import { selectedSeedId, selectedTeam } from '../seeds/seedBank'
import { seedChooserSnapshot } from '../seeds/seedChooser'
import type { Session } from './session'
import { tools } from '../seeds/tools'
import { getActiveTutorial } from '../tutorials'
import { levelRule } from '../rules/registry'
import { gridItems as lawnGridItems } from '../level/lawn'

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
        // What any plant shows, and what only its kind has (a producer's next sun, a chomper's prey, ...).
        const plants: WorldSnapshot['plants'] = [...world.query(PositionComponent, PlantComponent)].map(entity => {
            const plant = world.get(entity, PlantComponent)!, position = world.get(entity, PositionComponent)!
            return { entityId: entity, ...plant.snapshot(plant.asleep(world), gameplayTick), x: position.x, y: position.y, row: position.row }
        })
        for (const entity of world.query(PositionComponent, MowedPlantComponent)) {
            const { plant, squash, left } = world.get(entity, MowedPlantComponent)!, position = world.get(entity, PositionComponent)!
            plants.push({ entityId: entity, ...plant.snapshot(false), x: position.x, y: position.y, row: position.row,
                mowered: { time: squash.time, ...(left ? { left } : {}) } })
        }
        const zombies = [...world.query(PositionComponent, ZombieComponent)].map(entity => {
            const position = world.get(entity, PositionComponent)!
            const zombie = world.get(entity, ZombieComponent)!
            // What any zombie shows, and what only its kind has (a pole vaulter's pole, a dancer's step, a newspaper zombie's rage).
            return { entityId: entity, ...zombie.snapshot(), ...position }
        })
        // What any projectile shows, and what only its kind has; a mower set off runs among them.
        const projectiles = [...world.query(PositionComponent, ProjectileComponent)].map(entity => world.get(entity, ProjectileComponent)!.snapshot(world, entity))
        const mowers = [...world.query(PositionComponent, MowerComponent)].map(entity => world.get(entity, MowerComponent)!.snapshot(world, entity))
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
            ...(level.iceTrap ? { iceTrap: { ...level.iceTrap } } : {}),
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

