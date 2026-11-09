import type { World } from '@/ecs'
import { chooserSeeds, type GameplayDefinitions, type LevelDefinition } from '@/shared/content/gameplay'
import { cheatSeedEntries } from '@/shared/content/chooserPages'
import { chooserEntryKey, type ChooserEntry, type GameCommand, type Team, type WorldSnapshot } from '@/shared/protocol'
import { packetTeam } from '@/shared/content/teams'
import { EconomyStateResource, LevelStateResource, SeedBankResource, type SeedBankState } from '../state/components'
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
 * The cards Mods offer beyond the catalog grid, for a player owning `owned` (see availableSeeds), after `/cheatseed`'s
 * pages when it is on. The base offers none; Mods wrap `entries` to add theirs, such as hidden seeds or a seed on the
 * other side (`team`), in their order. They count like owned seeds towards the slots and towards opening the chooser.
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
    /** The owned seeds in the catalog grid, in place order (availableSeeds); with `/cheatseed` every seed there. */
    available: string[]
    /**
     * The cards beyond them, `/cheatseed`'s pages and then the Mods': installed seeds, each card once, sides kept as
     * packets keep them (packetTeam).
     */
    entries: ChooserEntry[]
}

export function chooserOffer(definitions: GameplayDefinitions, owned: readonly string[] | undefined, cheatSeeds = false): ChooserOffer {
    // `/cheatseed` offers every seed in the grid, owned or not: a Mod's seed placed there shows as the base's do.
    const available = availableSeeds(definitions, cheatSeeds ? undefined : owned)
    // An owned grid seed on its own side is offered already.
    const seen = new Set(available.map(seedId => chooserEntryKey({ seedId })))
    const entries: ChooserEntry[] = []
    for (const entry of [...cheatSeeds ? cheatSeedEntries(definitions, available) : [], ...seedChooser.entries(definitions, owned)]) {
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

/** Every card offered, in order: the owned grid seeds, then the entries beyond them. */
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
    const bank = world.resources.get(SeedBankResource)
    const offer = chooserOffer(definitions, bank.owned, getDebugRules(world).cheatSeeds)
    // A repick keeps the bank's size: a slot bought since waits for the next level, as a bank in play does.
    return { offer, slots: bank.repick?.packets.length ?? bankSlots(definitions, offer, world.resources.get(EconomyStateResource).packetUpgrades) }
}

export function applySeedChoice(world: World, definitions: GameplayDefinitions, command: Extract<GameCommand, { type: 'chooseSeed' | 'confirmSeeds' }>): CommandRejectionCode | undefined {
    const level = world.resources.get(LevelStateResource)
    const bank = world.resources.get(SeedBankResource)
    if (level.paused) return 'game-paused'
    if (!bank.choosing || level.phase !== 'intro' && !bank.repick) return 'not-choosing-seeds'
    if (world.resources.get(TutorialResource).dialogIndex !== undefined) return 'intro-not-complete'
    const { offer, slots } = worldOffer(world, definitions)
    if (command.type === 'confirmSeeds') {
        // `/cheatseed` starts with any cards chosen, the slots left over empty (finishSeedChoice).
        if (bank.packets.length !== slots && !(getDebugRules(world).cheatSeeds && bank.packets.length > 0)) return 'seed-choice-incomplete'
        finishSeedChoice(world, definitions)
        return
    }
    const seed = definitions.seeds[command.seedId]
    if (!seed) return 'seed-not-available'
    // A card in the bank always goes back; one is only added while the chooser offers it.
    const team = packetTeam(seed, command.team)
    const index = bank.packets.findIndex(packet => packet?.seedId === command.seedId && packet.team === team)
    if (index >= 0) bank.packets.splice(index, 1)
    else {
        if (!offers(offer, command.seedId, team)) return 'seed-not-available'
        if (bank.packets.length >= slots) return 'seed-bank-full'
        if (bank.repick) {
            // Survival's repick: no opening recharge (SeedPacket::SetPacketType), but a card the bank held keeps its own.
            const kept = bank.repick.packets.find(packet => packet?.seedId === command.seedId && packet.team === team)
            bank.packets.push(kept ? { ...kept } : { seedId: command.seedId, readyAtTick: 0, ...(team ? { team } : {}) })
            return
        }
        // Like a planted packet's recharge, the opening recharge is skipped while `/cooldown false` is active.
        const cooldown = getDebugRules(world).cooldown ? definitions.seeds[command.seedId].initialCooldownTicks ?? 0 : 0
        bank.packets.push({ seedId: command.seedId, readyAtTick: cooldown, cooldownTotal: cooldown, ...(team ? { team } : {}) })
    }
}

/**
 * Ends the choice and starts the level; a repick's level waits on until the chooser has lifted out (finishRepick). The
 * slots left unchosen stay empty (null), which only Let's Rock taking fewer cards than slots leaves (`/cheatseed`).
 */
export function finishSeedChoice(world: World, definitions: GameplayDefinitions): void {
    const bank = world.resources.get(SeedBankResource)
    const { slots } = worldOffer(world, definitions)
    while (bank.packets.length < slots) bank.packets.push(null)
    bank.choosing = false
    if (bank.repick) bank.repick.confirmed = true
}

/** A repick's chooser is out and the bank back in place: the level goes on, its bank as it was, chosen or dealt. */
export function finishRepick(world: World): CommandRejectionCode | undefined {
    const bank = world.resources.get(SeedBankResource)
    if (!bank.repick?.confirmed) return 'not-choosing-seeds'
    if (!bank.repick.chooser) delete bank.choosing
    delete bank.repick
}

/**
 * `/repick`: stands the level still and opens the chooser over it with the bank's cards still chosen, closed up over
 * its empty slots; each keeps its recharge, taken out and back too, as Survival's repick keeps each packet's.
 */
export function startRepick(world: World): void {
    const bank = world.resources.get(SeedBankResource)
    bank.repick = { chooser: bank.choosing !== undefined, packets: bank.packets.map(packet => packet && { ...packet }) }
    bank.packets = bank.packets.flatMap(packet => packet ? [packet] : [])
    bank.choosing = true
    bank.selection = { mode: 'none' }
}

/**
 * The bank as a save holds it: a repick is not saved, so the bank as it stood before it (once confirmed, as chosen),
 * with the chooser state the level had and nothing held. Without a repick, the bank itself.
 */
export function savedSeedBank(bank: SeedBankState): SeedBankState {
    const repick = bank.repick
    if (!repick) return bank
    const { repick: _, choosing: __, ...rest } = bank
    return { ...rest, ...(repick.chooser ? { choosing: false } : {}), packets: repick.confirmed ? bank.packets : repick.packets }
}

/** For a game that opened the chooser. */
export function seedChooserSnapshot(world: World, definitions: GameplayDefinitions): NonNullable<WorldSnapshot['seedChooser']> {
    const bank = world.resources.get(SeedBankResource)
    const firstAdventure = world.resources.get(TutorialResource).firstAdventure
    const special = firstAdventure ? getActiveTutorial(world)?.chooserWarnings : undefined
    // A repick asks nothing before its Let's Rock: no warning, as Survival's repick leaves out its sun and pool ones.
    const warnings = bank.repick ? [] : [
        ...(special?.seed && !bank.packets.some(packet => packet?.seedId === special.seed!.id) ? [special.seed.warning] : []),
        ...(bank.packets.some(packet => { const seed = packet && definitions.seeds[packet.seedId]; return seed?.kind === 'plant' && !!definitions.plants[seed.id].producer })
            ? [] : [special?.sunWarning ?? 'SEED_CHOOSER_SUN_WARNING']),
    ]
    const { offer, slots } = worldOffer(world, definitions)
    return {
        availableSeeds: offer.available, ...(offer.entries.length ? { entries: offer.entries } : {}),
        slots, choosing: bank.choosing === true, ...(warnings.length ? { warnings } : {}), ...(bank.repick ? { repick: true } : {}),
        ...(getDebugRules(world).cheatSeeds ? { cheatSeeds: true } : {}),
    }
}
