import type { World } from '@/ecs'
import { chooserSeeds, type GameplayDefinitions, type LevelDefinition } from '@/shared/content/gameplay'
import { chooserEntryKey, type ChooserEntry, type GameCommand, type Team, type WorldSnapshot } from '@/shared/protocol'
import { packetTeam } from '@/shared/content/teams'
import { EconomyStateResource, LevelStateResource, SeedBankResource } from '../state/components'
import type { CommandRejectionCode } from '../session/session'
import { TutorialResource } from '../state/levelState'
import { getDebugRules } from '../debug/debugRules'
import { getActiveTutorial } from '../tutorials'

/**
 * LawnApp::HasSeedType: the seeds in the chooser's grid the player owns, in place order. `owned` is the profile's list
 * (awards collected and seeds bought); without one (no profile) every seed in the grid is there.
 */
export function availableSeeds(definitions: GameplayDefinitions, owned: readonly string[] | undefined): string[] {
    const seeds = chooserSeeds(definitions)
    return owned ? seeds.filter(id => owned.includes(id)) : seeds
}

/**
 * The cards the chooser offers beyond its catalog grid, for a player owning `owned` (see availableSeeds). The base
 * offers none; Mods wrap `entries` to add theirs, such as hidden seeds or a seed on the other side (`team`), in the
 * order they show them. They count like owned seeds towards the slots and towards opening the chooser.
 */
export const seedChooser = {
    entries(_definitions: GameplayDefinitions, _owned: readonly string[] | undefined): ChooserEntry[] {
        return []
    },
}

/**
 * What the chooser offers a player owning `owned`. Worked out once per operation and passed on, so the cards it can
 * take and its slots come from the same answer even if a Mod's `entries` would answer differently another time.
 */
export interface ChooserOffer {
    /** The owned seeds in the catalog grid, in place order (availableSeeds). */
    available: string[]
    /** The Mods' cards beyond them: installed seeds, each card once, sides kept as packets keep them (packetTeam). */
    entries: ChooserEntry[]
}

export function chooserOffer(definitions: GameplayDefinitions, owned: readonly string[] | undefined): ChooserOffer {
    const available = availableSeeds(definitions, owned)
    // An owned grid seed on its own side is offered already.
    const seen = new Set(available.map(seedId => chooserEntryKey({ seedId })))
    const entries: ChooserEntry[] = []
    for (const entry of seedChooser.entries(definitions, owned)) {
        const seed = definitions.seeds[entry.seedId]
        if (!seed) continue
        const team = packetTeam(seed, entry.team)
        const card = { seedId: entry.seedId, ...(team ? { team } : {}) }
        if (seen.has(chooserEntryKey(card))) continue
        seen.add(chooserEntryKey(card))
        entries.push(card)
    }
    return { available, entries }
}

/** Every card offered, in order: the owned grid seeds, then the Mods' entries. */
const offeredCards = (offer: ChooserOffer): ChooserEntry[] => [...offer.available.map(seedId => ({ seedId })), ...offer.entries]

const offers = (offer: ChooserOffer, seedId: string, team: Team | undefined): boolean =>
    team === undefined && offer.available.includes(seedId) || offer.entries.some(entry => entry.seedId === seedId && entry.team === team)

/** Board::GetNumSeedsInBank: the base slots plus one per upgrade, but never more than the cards there are. */
export function bankSlots(definitions: GameplayDefinitions, offer: ChooserOffer, packetUpgrades = 0): number {
    const { baseSlots, maxSlots } = definitions.seedBank
    return Math.min(baseSlots + packetUpgrades, maxSlots, offer.available.length + offer.entries.length)
}

/**
 * How the level's bank starts: its fixed packets, a conveyor, or the original's rule. Board::InitLevel fills a bank
 * the cards fit in with all of them in order, and Board::ChooseSeedsOnCurrentLevel opens the chooser otherwise (from
 * level 8 of a first adventure, the first with more seeds than slots, and on every replay). A Mod's entries count too,
 * so offering more cards can open the chooser earlier.
 */
export function seedBankStart(definitions: GameplayDefinitions, level: LevelDefinition, offer: ChooserOffer, packetUpgrades = 0):
    { seeds: ChooserEntry[] } | { chooser: true } | { conveyor: true } {
    if (level.conveyor) return { conveyor: true }
    if (level.seedPackets) return { seeds: level.seedPackets.map(seedId => ({ seedId })) }
    const cards = offeredCards(offer)
    const slots = bankSlots(definitions, offer, packetUpgrades)
    return cards.length > slots ? { chooser: true } : { seeds: cards.slice(0, slots) }
}

/** The offer for the world's player and the chooser's slots with it. */
function worldOffer(world: World, definitions: GameplayDefinitions): { offer: ChooserOffer, slots: number } {
    const offer = chooserOffer(definitions, world.resources.get(SeedBankResource).owned)
    return { offer, slots: bankSlots(definitions, offer, world.resources.get(EconomyStateResource).packetUpgrades) }
}

export function applySeedChoice(world: World, definitions: GameplayDefinitions, command: Extract<GameCommand, { type: 'chooseSeed' | 'confirmSeeds' }>): CommandRejectionCode | undefined {
    const level = world.resources.get(LevelStateResource)
    const bank = world.resources.get(SeedBankResource)
    if (level.paused) return 'game-paused'
    if (level.phase !== 'intro' || !bank.choosing) return 'not-choosing-seeds'
    if (world.resources.get(TutorialResource).dialogIndex !== undefined) return 'intro-not-complete'
    const { offer, slots } = worldOffer(world, definitions)
    if (command.type === 'confirmSeeds') {
        if (bank.packets.length !== slots) return 'seed-choice-incomplete'
        bank.choosing = false
        return
    }
    const seed = definitions.seeds[command.seedId]
    if (!seed) return 'seed-not-available'
    // A card in the bank always goes back; one is only added while the chooser offers it.
    const team = packetTeam(seed, command.team)
    const index = bank.packets.findIndex(packet => packet.seedId === command.seedId && packet.team === team)
    if (index >= 0) bank.packets.splice(index, 1)
    else {
        if (!offers(offer, command.seedId, team)) return 'seed-not-available'
        if (bank.packets.length >= slots) return 'seed-bank-full'
        // Like a planted packet's recharge, the opening recharge is skipped while `/cooldown false` is active.
        const cooldown = getDebugRules(world).cooldown ? definitions.seeds[command.seedId].initialCooldownTicks ?? 0 : 0
        bank.packets.push({ seedId: command.seedId, readyAtTick: cooldown, cooldownTotal: cooldown, ...(team ? { team } : {}) })
    }
}

/** For a game that opened the chooser. */
export function seedChooserSnapshot(world: World, definitions: GameplayDefinitions): NonNullable<WorldSnapshot['seedChooser']> {
    const bank = world.resources.get(SeedBankResource)
    const firstAdventure = world.resources.get(TutorialResource).firstAdventure
    const special = firstAdventure ? getActiveTutorial(world)?.chooserWarnings : undefined
    const warnings = [
        ...(special?.seed && !bank.packets.some(packet => packet.seedId === special.seed!.id) ? [special.seed.warning] : []),
        ...(bank.packets.some(packet => { const plant = definitions.seeds[packet.seedId].plant; return plant !== undefined && definitions.plants[plant].producer })
            ? [] : [special?.sunWarning ?? 'SEED_CHOOSER_SUN_WARNING']),
    ]
    const { offer, slots } = worldOffer(world, definitions)
    return {
        availableSeeds: offer.available, ...(offer.entries.length ? { entries: offer.entries } : {}),
        slots, choosing: bank.choosing === true, ...(warnings.length ? { warnings } : {}),
    }
}
