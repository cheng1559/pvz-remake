import type { Team } from '@/shared/protocol'
import type { SeedBankState, SeedCard } from '../state/components'

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
