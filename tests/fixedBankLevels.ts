/**
 * Replays open the seed chooser on every adventure level. Tests that replay 1-1 and 1-2 as plain levels give them
 * the banks they have on a first adventure.
 */
export function withFixedBanks<T extends { levels: Record<string, { seedPackets?: string[] }> }>(source: T): T {
    source.levels['pvz:adventure-1-1'].seedPackets = ['pvz:peashooter']
    source.levels['pvz:adventure-1-2'].seedPackets = ['pvz:peashooter', 'pvz:sunflower']
    return source
}
