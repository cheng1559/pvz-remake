import type { Team } from '@/shared/protocol'
import type { SeedBankState } from '../state/components'

export function selectedSeedId(bank: SeedBankState): string | undefined {
    return selectedPacket(bank)?.seedId
}

/** The side the held packet puts down on when it is not its seed's own (`/seed {slot} {seed} {team}`). */
export function selectedTeam(bank: SeedBankState): Team | undefined {
    return selectedPacket(bank)?.team
}

function selectedPacket(bank: SeedBankState): { seedId: string, team?: Team } | null | undefined {
    const selected = bank.selection
    return selected.mode === 'seed' ? bank.packets[selected.slot] : selected.mode === 'conveyor'
        ? bank.conveyor?.packets.find(packet => packet.id === selected.packetId) : undefined
}
