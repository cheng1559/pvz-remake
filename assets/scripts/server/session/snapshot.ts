import type { WorldSnapshot } from '@/shared/protocol/index'
import { EconomyStateResource, LevelStateResource, SeedBankResource } from '../state/components'
import { DebugRulesResource, getDebugRules } from '../debug/debugRules'
import { TutorialResource, WaveResource } from '../state/levelState'
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
        const plants = [...world.plants].map(plant => plant.snapshot(world, gameplayTick))
        // What any zombie shows, and what only its kind has (a pole vaulter's pole, a dancer's phase, a newspaper zombie's rage).
        const zombies = [...world.zombies].map(zombie => ({ entityId: zombie.id, ...zombie.snapshot(), ...zombie.position }))
        // What any projectile shows, and what only its kind has; a mower set off runs among them.
        const projectiles = [...world.projectiles].map(projectile => projectile.snapshot(world))
        const mowers = [...world.mowers].map(mower => mower.snapshot())
        const items = [...world.items].map(item => {
            return {
                entityId: item.id,
                typeId: item.typeId,
                state: item.state,
                x: item.position.x,
                y: item.position.y,
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

