import type { EntityRemover, World } from '@/server/state/World'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { plantTeam } from '@/shared/content/teams'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { tryDropLevelAward } from '../level/levelAward'
import { plantInPlay } from '../level/lawn'

/**
 * Zombie::AnimateChewSound for a plant that mind-controls (Plant.mindControls: the hypno-shroom awake), eaten by a hostile zombie as it chews or
 * by a hostile plant as it swallows it whole (a chomper's bite; not in the original, whose plants never eat plants):
 * the plant is gone at once (Plant::Die), so nothing else eats it, and its eater comes over to its side
 * (StartMindControlled), tinted, and its kind hears of it (Zombie.changedSides: a dancer leaves its troupe). A zombie walks on at a speed picked as it
 * stops eating, as every zombie does (the original's mVelX = 0.17 is picked over then); if it was the last zombie
 * against the player, the level's award drops from it (TrySpawnLevelAward). The client hears `mindControlled`.
 */
export function mindControl(world: World, definitions: GameplayDefinitions, eater: number, plantEntity: number, remover: EntityRemover): void {
    const prey = plantInPlay(world, plantEntity)!, team = plantTeam(prey)
    prey.health = 0
    remover.destroyEntity(plantEntity)
    // Each side is written only when it is not the eater's own default: a zombie's the zombies', a plant's the plants'.
    const zombie = world.zombies.get(eater), turned = zombie ?? plantInPlay(world, eater)!
    turned.mindControlled = true
    if (team === (zombie ? 'zombies' : 'plants')) delete turned.team
    else turned.team = team
    if (zombie) zombie.changedSides(world)
    emitServerEvent(world.resources.get(EventQueueResource), 'mindControlled', { entityId: eater, plantId: plantEntity, typeId: turned.typeId, team })
    if (zombie) tryDropLevelAward(world, definitions, remover, eater)
}
