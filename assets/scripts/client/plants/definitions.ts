import type { PlantPresentationDefinition, PlantVisual, PresentationDefinitions } from '@/shared/content/presentation'
import type { SeedDefinition } from '@/shared/content/gameplay'
import { zombieDefinition } from '@/client/zombies/definitions'

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
    /** The plant a plant seed's packet shows; a zombie or grave seed's packet has none. */
    readonly plant?: string
    readonly zombie?: string
    readonly grave?: boolean
    readonly nameKey: string
    /** A plant's chooser text; the zombies and the grave show their names only. */
    readonly tooltipKey?: string
}

export function packetSubject(presentation: PresentationDefinitions, seed: SeedDefinition): PacketSubject {
    // A zombie seed's packet draws its zombie (SEED_ZOMBIE_*), named as the almanac names it.
    if (seed.kind === 'zombie') return { zombie: seed.id, nameKey: zombieDefinition(presentation, seed.id).nameKey }
    if (seed.kind === 'grave') return { grave: true, nameKey: 'GRAVE_SEED' }
    return plantPacket(presentation, seed.id)
}

/** A plant's seed packet: the plant it shows (`visual.packetPlant`, else the plant itself), its name and its text. */
export function plantPacket(presentation: PresentationDefinitions, plantId: string): { plant: string, nameKey: string, tooltipKey: string } {
    const visual = plantDefinition(presentation, plantId).visual
    return { plant: visual.packetPlant ?? plantId, nameKey: visual.nameKey, tooltipKey: visual.tooltipKey ?? `${visual.nameKey}_TOOLTIP` }
}
