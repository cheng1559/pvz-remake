import type { PlantPresentationDefinition, PlantVisual, PresentationDefinitions, SeedPacketSeedType } from '@/shared/content/presentation'
import type { SeedDefinition } from '@/shared/content/gameplay'
export type { SeedPacketSeedType } from '@/shared/content/presentation'

export function plantDefinition(definitions: PresentationDefinitions, plantId: string): PlantPresentationDefinition {
    const definition = definitions.plants[plantId]
    if (!definition) throw new Error(`Plant presentation is not installed: ${plantId}`)
    return definition
}

export function plantVisual(definitions: PresentationDefinitions, plantId: string): PlantVisual | undefined {
    return definitions.plants[plantId]?.visual
}

/** What a seed's packet shows and is called (SeedPacket::DrawSeedPacket): its plant's picture, its zombie or a grave. */
export interface PacketSubject {
    readonly seedType: SeedPacketSeedType
    readonly zombie?: string
    readonly grave?: boolean
    readonly nameKey: string
    /** A plant's chooser text; the zombies and the grave show their names only. */
    readonly tooltipKey?: string
}

export function packetSubject(presentation: PresentationDefinitions, seed: SeedDefinition): PacketSubject {
    // A zombie seed's packet draws its zombie (SEED_ZOMBIE_*), named as the almanac names it.
    if (seed.kind === 'zombie') return { seedType: -1, zombie: seed.id, nameKey: presentation.zombies[seed.id]?.nameKey ?? seed.id }
    if (seed.kind === 'grave') return { seedType: -1, grave: true, nameKey: 'GRAVE_SEED' }
    const visual = plantDefinition(presentation, seed.id).visual
    const nameKey = visual.nameKey ?? String(visual.seedType).toUpperCase()
    return { seedType: visual.seedType, nameKey, tooltipKey: visual.tooltipKey ?? `${nameKey}_TOOLTIP` }
}
