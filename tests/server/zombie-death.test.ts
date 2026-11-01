import assert from 'node:assert/strict'
import test from 'node:test'
import { World } from '@/ecs'
import { LevelStateResource, RandomResource, ZombieComponent } from '@/server/state/components'
import { createEventQueue, EventQueueResource } from '@/server/state/events'
import { TutorialResource } from '@/server/state/levelState'
import { startZombieDeath } from '@/server/zombies/damage'
import { spawnZombie } from '@/server/zombies/spawn'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { readGameplaySource } from '../../tools/mod/content'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)

/** A board whose death roll is `roll` (Rand(100)) and whose rate roll is the middle of 24-30. */
function dyingZombie(roll: number, { levelId = 'pvz:adventure-1-6', firstAdventure = true, chilled = false, others = 0, typeId = 'pvz:normal' } = {}) {
    const world = new World()
    world.resources.set(LevelStateResource, { id: levelId, definition: levels.levels[levelId], board: definitions.boards['pvz:day'], phase: 'gameplay', result: 'playing', paused: false })
    world.resources.set(TutorialResource, { firstAdventure, step: 'complete' } as never)
    world.resources.set(RandomResource, { integer: (min: number, max: number) => min === 0 && max === 99 ? roll : min, nextFloat: () => 0.5 } as never)
    world.resources.set(EventQueueResource, createEventQueue())
    for (let index = 0; index < others; index++) spawnZombie(world, definitions, 'pvz:normal', 2, 600 + index, 0)
    const entity = spawnZombie(world, definitions, typeId, 2, 500, 0)
    const zombie = world.get(entity, ZombieComponent)!
    if (chilled) zombie.chilledTicks = 100
    startZombieDeath(world, definitions, entity, zombie)
    return zombie
}

test('Zombie::PlayDeathAnim: a 99 plays the super long death at rate 14, from level 6, unchilled, with at most five on screen', () => {
    const longest = dyingZombie(99)
    assert.equal(longest.animation, 'anim_superlongdeath')
    assert.equal(longest.animationSpeed, 14 / 12, 'the fixed rate, not 24-30')
    assert.equal(longest.deathTicksRemaining, Math.ceil(137 / 14 * 100) + 100)
    assert.equal(dyingZombie(99, { others: 5 }).animation, 'anim_superlongdeath', 'five other zombies still allow it')
    // Each failed condition falls back to anim_death2, as a roll above 50 does.
    for (const [label, options] of [
        ['level 5 of a first adventure', { levelId: 'pvz:adventure-1-5' }],
        ['a chilled zombie', { chilled: true }],
        ['six zombies on screen', { others: 6 }],
    ] as const) assert.equal(dyingZombie(99, options).animation, 'anim_death2', label)
    assert.equal(dyingZombie(99, { levelId: 'pvz:adventure-1-1', firstAdventure: false }).animation, 'anim_superlongdeath', 'any level after the adventure')
    assert.deepEqual([dyingZombie(98).animation, dyingZombie(51).animation, dyingZombie(50).animation], ['anim_death2', 'anim_death2', 'anim_death'])
    assert.equal(dyingZombie(99, { typeId: 'pvz:pole_vaulter' }).animation, 'anim_death', 'a gait without it keeps its own deaths')
})
