import type { World } from '@/ecs'
import type { GameplayDefinitions, LevelDefinition } from '@/shared/content/gameplay'
import type { GameCommand, WorldSnapshot } from '@/shared/protocol'
import { EconomyStateResource, LevelStateResource, SeedBankResource } from '../state/components'
import type { CommandRejectionCode } from '../session/session'
import { TutorialResource } from '../state/levelState'
import { getDebugRules } from '../debug/debugRules'
import { getActiveTutorial } from '../tutorials'

/**
 * LawnApp::HasSeedType: the catalog seeds the player owns, in catalog order. `owned` is the profile's list (awards
 * collected and seeds bought); without one (no profile) every seed is there.
 */
export function availableSeeds(definitions: GameplayDefinitions, owned: readonly string[] | undefined): string[] {
    return owned ? definitions.seedCatalog.filter(id => owned.includes(id)) : [...definitions.seedCatalog]
}

/** Board::GetNumSeedsInBank: the base slots plus one per upgrade, but never more than the seeds there are. */
export function bankSlots(definitions: GameplayDefinitions, owned: readonly string[] | undefined, packetUpgrades = 0): number {
    const { baseSlots, maxSlots } = definitions.seedBank
    return Math.min(baseSlots + packetUpgrades, maxSlots, availableSeeds(definitions, owned).length)
}

/**
 * How the level's bank starts: its fixed packets, a conveyor, or the original's rule. Board::InitLevel fills a bank
 * the seeds fit in with all of them in order, and Board::ChooseSeedsOnCurrentLevel opens the chooser otherwise (from
 * level 8 of a first adventure, the first with more seeds than slots, and on every replay).
 */
export function seedBankStart(definitions: GameplayDefinitions, level: LevelDefinition, owned: readonly string[] | undefined, packetUpgrades = 0):
    { seeds: string[] } | { chooser: true } | { conveyor: true } {
    if (level.conveyor) return { conveyor: true }
    if (level.seedPackets) return { seeds: level.seedPackets }
    const available = availableSeeds(definitions, owned)
    const slots = bankSlots(definitions, owned, packetUpgrades)
    return available.length > slots ? { chooser: true } : { seeds: available.slice(0, slots) }
}

function worldChooserSlots(world: World, definitions: GameplayDefinitions): number {
    return bankSlots(definitions, world.resources.get(SeedBankResource).owned, world.resources.get(EconomyStateResource).packetUpgrades)
}

export function applySeedChoice(world: World, definitions: GameplayDefinitions, command: Extract<GameCommand, { type: 'chooseSeed' | 'confirmSeeds' }>): CommandRejectionCode | undefined {
    const level = world.resources.get(LevelStateResource)
    const bank = world.resources.get(SeedBankResource)
    if (level.paused) return 'game-paused'
    if (level.phase !== 'intro' || !bank.choosing) return 'not-choosing-seeds'
    if (world.resources.get(TutorialResource).dialogIndex !== undefined) return 'intro-not-complete'
    if (command.type === 'confirmSeeds') {
        if (bank.packets.length !== worldChooserSlots(world, definitions)) return 'seed-choice-incomplete'
        bank.choosing = false
        return
    }
    if (!availableSeeds(definitions, bank.owned).includes(command.seedId)) return 'seed-not-available'
    const index = bank.packets.findIndex(packet => packet.seedId === command.seedId)
    if (index >= 0) bank.packets.splice(index, 1)
    else {
        if (bank.packets.length >= worldChooserSlots(world, definitions)) return 'seed-bank-full'
        // Like a planted packet's recharge, the opening recharge is skipped while `/cooldown false` is active.
        const cooldown = getDebugRules(world).cooldown ? definitions.seeds[command.seedId].initialCooldownTicks ?? 0 : 0
        bank.packets.push({ seedId: command.seedId, readyAtTick: cooldown, cooldownTotal: cooldown })
    }
}

/** For a game that opened the chooser. */
export function seedChooserSnapshot(world: World, definitions: GameplayDefinitions): NonNullable<WorldSnapshot['seedChooser']> {
    const bank = world.resources.get(SeedBankResource)
    const firstAdventure = world.resources.get(TutorialResource).firstAdventure
    const special = firstAdventure ? getActiveTutorial(world)?.chooserWarnings : undefined
    const warnings = [
        ...(special?.seed && !bank.packets.some(packet => packet.seedId === special.seed!.id) ? [special.seed.warning] : []),
        ...(bank.packets.some(packet => definitions.plants[definitions.seeds[packet.seedId].plant].producer)
            ? [] : [special?.sunWarning ?? 'SEED_CHOOSER_SUN_WARNING']),
    ]
    return {
        availableSeeds: availableSeeds(definitions, bank.owned), slots: worldChooserSlots(world, definitions), choosing: bank.choosing === true,
        ...(warnings.length ? { warnings } : {}),
    }
}
