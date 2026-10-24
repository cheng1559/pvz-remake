import type { PlantPresentationDefinition, PlantVisual, PresentationDefinitions } from '@/shared/content/presentation'
export type { SeedPacketSeedType } from '@/shared/content/presentation'

export function plantDefinition(definitions: PresentationDefinitions, plantId: string): PlantPresentationDefinition {
    const definition = definitions.plants[plantId]
    if (!definition) throw new Error(`Plant presentation is not installed: ${plantId}`)
    return definition
}

export function plantVisual(definitions: PresentationDefinitions, plantId: string): PlantVisual | undefined {
    return definitions.plants[plantId]?.visual
}
