import type { SeedPacketSeedType } from '@/client/hud/SeedPacketRenderer'

// Atlas positions are client presentation data; costs, unlocks and seeds come from the server.
const PLANTS: Record<string, { seedType: SeedPacketSeedType; preview: number }> = {
    'pvz:sunflower': { seedType: 'sunflower', preview: 1 },
    'pvz:cherrybomb': { seedType: 'cherrybomb', preview: 2 },
    'pvz:peashooter': { seedType: 'peashooter', preview: 0 },
    'pvz:repeater': { seedType: 'repeater', preview: 7 },
}

export function levelPlantVisual(plantId: string) {
    const visual = PLANTS[plantId]
    if (!visual) throw new Error(`Plant presentation is not installed: ${plantId}`)
    return visual
}
