import type { World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import type { SeedAvailability, Team } from '@/shared/protocol'
import { LevelStateResource, type SeedBankState, type SeedCard, type SeedPacketState } from '../state/components'
import { getDebugRules } from '../debug/debugRules'
import { getAvailableSun } from '../level/items'

export function selectedSeedId(bank: SeedBankState): string | undefined {
    return selectedPacket(bank)?.seedId
}

/** The side the held packet puts down on when it is not its seed's own (`/seed {slot} {seed} {team}`). */
export function selectedTeam(bank: SeedBankState): Team | undefined {
    return selectedPacket(bank)?.team
}

/** The held packet's card, from a bank slot or the belt. */
function selectedPacket(bank: SeedBankState): SeedCard | null | undefined {
    const selected = bank.selection
    return selected.mode === 'seed' ? bank.packets[selected.slot] : selected.mode === 'conveyor'
        ? bank.conveyor?.packets.find(packet => packet.id === selected.packetId)?.card : undefined
}

/** What a seed costs to plant: its sun, or nothing under `/suncost false`. */
export function seedSunCost(world: World, definitions: GameplayDefinitions, seedId: string): number {
    return getDebugRules(world).sunCost ? definitions.seeds[seedId].sunCost : 0
}

/**
 * SeedPacket::CanPickUp: a bank packet can be taken up once it has recharged (always under `/cooldown false`) and its
 * seed is affordable with the sun there is and is on its way to the counter.
 */
export function packetAvailability(world: World, definitions: GameplayDefinitions, packet: SeedPacketState, tick: number): SeedAvailability {
    if (getDebugRules(world).cooldown && packet.readyAtTick > tick) return { reason: 'seed-not-ready', warningKey: 'WAITING_FOR_SEED' }
    if (getAvailableSun(world, definitions) < seedSunCost(world, definitions, packet.seedId)) return { reason: 'not-enough-sun', warningKey: 'NOT_ENOUGH_SUN' }
    return {}
}

/**
 * SeedPacket::SetPacketType: the recharge a packet starts with as it goes into the bank, none on a level without it
 * (`openingRecharge: false`) or under `/cooldown false`.
 */
export function openingCooldown(world: World, definitions: GameplayDefinitions, seedId: string): number {
    if (world.resources.get(LevelStateResource).definition.openingRecharge === false || !getDebugRules(world).cooldown) return 0
    return definitions.seeds[seedId].initialCooldownTicks ?? 0
}
