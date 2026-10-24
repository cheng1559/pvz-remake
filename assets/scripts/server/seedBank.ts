import type { SeedBankState } from './components'

export function selectedSeedId(bank: SeedBankState): string | undefined {
    const selected = bank.selection
    return selected.mode === 'seed' ? selected.seedId : selected.mode === 'conveyor'
        ? bank.conveyor?.packets.find(packet => packet.id === selected.packetId)?.seedId : undefined
}
