import type { PresentationDefinitions, ZombiePresentationDefinition } from '@/shared/content/presentation'

export function zombieDefinition(definitions: PresentationDefinitions, typeId: string): ZombiePresentationDefinition {
    const definition = definitions.zombies[typeId]
    if (!definition) throw new Error(`Zombie presentation is not installed: ${typeId}`)
    return definition
}
