import type { World } from '@/ecs'
import { seedUnlocked, type GameplayDefinitions, type GameplayLevels, type LevelDefinition } from '@/shared/content/gameplay'
import type { GameCommand, WorldSnapshot } from '@/shared/protocol'
import { EconomyStateResource, LevelStateResource, SeedBankResource } from '../state/components'
import type { CommandRejectionCode } from '../session/session'
import { TutorialResource } from '../state/levelState'
import { getDebugRules } from '../debug/debugRules'
import { getActiveTutorial } from '../tutorials'

/** Keep one catalog and its ordering; a first adventure has the seeds earlier levels awarded. */
export function availableSeeds(definitions: GameplayDefinitions, levels: GameplayLevels, level: LevelDefinition, firstAdventure: boolean): string[] {
    return definitions.seedCatalog.filter(id => seedUnlocked(levels, id, level, firstAdventure))
}

/** Board::GetNumSeedsInBank: the base slots plus one per upgrade, but never more than the seeds there are. */
export function bankSlots(definitions: GameplayDefinitions, levels: GameplayLevels, level: LevelDefinition, firstAdventure: boolean, packetUpgrades = 0): number {
    const { baseSlots, maxSlots } = definitions.seedBank
    return Math.min(baseSlots + packetUpgrades, maxSlots, availableSeeds(definitions, levels, level, firstAdventure).length)
}

/**
 * How the level's bank starts: its fixed packets, a conveyor, or the original's rule. Board::InitLevel fills a bank
 * the seeds fit in with all of them in order, and Board::ChooseSeedsOnCurrentLevel opens the chooser otherwise (from
 * level 8 of a first adventure, the first with more seeds than slots, and on every replay).
 */
export function seedBankStart(definitions: GameplayDefinitions, levels: GameplayLevels, level: LevelDefinition, firstAdventure: boolean, packetUpgrades = 0):
    { seeds: string[] } | { chooser: true } | { conveyor: true } {
    if (level.conveyor) return { conveyor: true }
    if (level.seedPackets) return { seeds: level.seedPackets }
    const available = availableSeeds(definitions, levels, level, firstAdventure)
    const slots = bankSlots(definitions, levels, level, firstAdventure, packetUpgrades)
    return available.length > slots ? { chooser: true } : { seeds: available.slice(0, slots) }
}

function worldChooserSlots(world: World, definitions: GameplayDefinitions, levels: GameplayLevels): number {
    return bankSlots(definitions, levels, world.resources.get(LevelStateResource).definition, world.resources.get(TutorialResource).firstAdventure,
        world.resources.get(EconomyStateResource).packetUpgrades)
}

export function applySeedChoice(world: World, definitions: GameplayDefinitions, levels: GameplayLevels, command: Extract<GameCommand, { type: 'chooseSeed' | 'confirmSeeds' }>): CommandRejectionCode | undefined {
    const level = world.resources.get(LevelStateResource)
    const bank = world.resources.get(SeedBankResource)
    if (level.paused) return 'game-paused'
    if (level.phase !== 'intro' || !bank.choosing) return 'not-choosing-seeds'
    if (world.resources.get(TutorialResource).dialogIndex !== undefined) return 'intro-not-complete'
    if (command.type === 'confirmSeeds') {
        if (bank.packets.length !== worldChooserSlots(world, definitions, levels)) return 'seed-choice-incomplete'
        bank.choosing = false
        return
    }
    if (!availableSeeds(definitions, levels, level.definition, world.resources.get(TutorialResource).firstAdventure).includes(command.seedId)) return 'seed-not-available'
    const index = bank.packets.findIndex(packet => packet.seedId === command.seedId)
    if (index >= 0) bank.packets.splice(index, 1)
    else {
        if (bank.packets.length >= worldChooserSlots(world, definitions, levels)) return 'seed-bank-full'
        // Like a planted packet's recharge, the opening recharge is skipped while `/cooldown false` is active.
        const cooldown = getDebugRules(world).cooldown ? definitions.seeds[command.seedId].initialCooldownTicks ?? 0 : 0
        bank.packets.push({ seedId: command.seedId, readyAtTick: cooldown, cooldownTotal: cooldown })
    }
}

/** For a game that opened the chooser. */
export function seedChooserSnapshot(world: World, definitions: GameplayDefinitions, levels: GameplayLevels): NonNullable<WorldSnapshot['seedChooser']> {
    const level = world.resources.get(LevelStateResource).definition
    const bank = world.resources.get(SeedBankResource)
    const firstAdventure = world.resources.get(TutorialResource).firstAdventure
    const special = firstAdventure ? getActiveTutorial(world)?.chooserWarnings : undefined
    const warnings = [
        ...(special?.seed && !bank.packets.some(packet => packet.seedId === special.seed!.id) ? [special.seed.warning] : []),
        ...(bank.packets.some(packet => definitions.plants[definitions.seeds[packet.seedId].plant].producer)
            ? [] : [special?.sunWarning ?? 'SEED_CHOOSER_SUN_WARNING']),
    ]
    return {
        availableSeeds: availableSeeds(definitions, levels, level, firstAdventure), slots: worldChooserSlots(world, definitions, levels), choosing: bank.choosing === true,
        ...(warnings.length ? { warnings } : {}),
    }
}
