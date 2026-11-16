import { type GameplayDefinitions, type GameplayLevels, ZOMBIE_CLIPS } from '@/shared/content/gameplay'
import { PLANT_ABILITY_STATES_BY_KIND, plantAbilityKind } from '@/shared/content/plantAbilities'
import type { PresentationDefinitions } from '@/shared/content/presentation'

interface Views { has(kind: string): boolean }

/** A zombie drawn without these still stands and falls: its first way, and with its plain death. */
const SPARED: readonly string[] = [ZOMBIE_CLIPS.standing2, ZOMBIE_CLIPS.superLongDeath]

/**
 * Everything the gameplay defines can be drawn: each plant, zombie, projectile and item has a presentation whose view
 * is installed, and a plant's or a zombie's has the pictures of every clip its animation plays (the mower's driver too,
 * for a zombie), and a plant is drawn only in states of its ability; each tool has its bank and picture (`tools`); each
 * level's award has its picture (`awards`, with its pages for a note), or for a seed its plant's.
 * Checked as content is put together, so that a Mod missing some fails to load, not a level to draw.
 */
export function assertPresented(content: { definitions: Pick<GameplayDefinitions, 'plants' | 'zombies' | 'projectiles' | 'items' | 'tools'>, levels: GameplayLevels },
    presentation: PresentationDefinitions, views: { plants: Views, zombies: Views, projectiles: Views, gridItems: Views, items: Views }): void {
    const { definitions, levels } = content
    const pictures = (id: string, clips: readonly string[]) => {
        const drawn = (presentation.plants[id] ?? presentation.zombies[id])?.clips as Record<string, unknown> | undefined
        for (const clip of clips) if (!drawn?.[clip]) throw new Error(`${id} is missing ${clip} animation`)
    }
    for (const [id, plant] of Object.entries(definitions.plants)) {
        const definition = presentation.plants[id]
        if (!definition || !views.plants.has(definition.view ?? 'plant')) throw new Error(`Plant presentation is not installed: ${id}`)
        if (plant.animation) pictures(id, Object.keys(plant.animation.clips))
        // What it is drawn in a state of (its packet's picture, its shadow) is a state of its own ability.
        const kind = plantAbilityKind(plant), states: readonly string[] = kind ? PLANT_ABILITY_STATES_BY_KIND[kind] : []
        for (const state of [...definition.packet?.state ? [definition.packet.state] : [], ...Object.keys(definition.shadow?.states ?? {})]) {
            if (!states.includes(state)) throw new Error(`${id} is drawn in a state its ability does not have: ${state}`)
        }
    }
    for (const [id, zombie] of Object.entries(definitions.zombies)) {
        const definition = presentation.zombies[id]
        if (!definition || !views.zombies.has(definition.view ?? 'zombie')) throw new Error(`Zombie presentation is not installed: ${id}`)
        pictures(id, [...Object.keys(zombie.animation.clips).filter(clip => !SPARED.includes(clip)), ZOMBIE_CLIPS.mowered])
    }
    for (const id of Object.keys(definitions.projectiles)) {
        const definition = presentation.projectiles[id]
        if (!definition || !views.projectiles.has(definition.view ?? 'projectile')) throw new Error(`Projectile presentation is not installed: ${id}`)
    }
    for (const [id, item] of Object.entries(presentation.gridItems)) {
        if (!views.gridItems.has(item.view)) throw new Error(`Grid item presentation is not installed: ${id}`)
    }
    for (const id of Object.keys(definitions.items)) {
        const definition = presentation.items[id]
        if (!definition || !views.items.has(definition.view ?? 'item')) throw new Error(`Item presentation is not installed: ${id}`)
    }
    for (const id of Object.keys(definitions.tools)) {
        if (!presentation.tools[id]) throw new Error(`Tool presentation is not installed: ${id}`)
    }
    // AwardView draws a seed's packet by its plant, any other award by its picture; the award screen a note by its pages.
    for (const [levelId, { award }] of Object.entries(levels.levels)) {
        const drawn = award.kind === 'seed' ? presentation.plants[award.id] : presentation.awards?.[award.id]
        if (!drawn || award.kind === 'note' && !presentation.awards?.[award.id]?.pageImages) {
            throw new Error(`Award presentation is not installed: ${award.id} (${levelId})`)
        }
    }
}
