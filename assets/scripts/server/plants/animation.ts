import type { GameSystem } from '@/ecs/index'
import { type GameplayDefinitions, PLANT_BLINK_LAYER, type PlantDefinition } from '@/shared/content/gameplay'
import { type AnimationRandom, framePosition, playLayers } from '@/shared/content/animation'
import { startPlantLayers, stepPlantAnimation } from '@/shared/content/plantAnimation'
import { LevelStateResource, type Plant, PlantComponent, RandomResource } from '../state/components'
import { plantPace, plantSkipsTick } from './chill'
import { isPlantAsleep } from './sleep'

/**
 * A plant's animation is the server's, as a zombie's is: what each of its layers plays and how far into it
 * (Plant.animations), from the plant's definition (PlantDefinition.animation). A view only shows it, so what follows
 * from the animation (where a pea shooter's mouth is as it sways) is the same for everyone.
 */

/**
 * Plant::PlantInitialize: every layer starts its clip, an asleep plant's taking the place of its own, and the first
 * blink is counted down to; then its kind starts what it plays of its own (Plant.animationStarted: a fuse lit as it goes
 * down plays its `fuse` state's clips, Plant::UpdateDoomShroom's anim_explode at 23 on its first update, past its idle;
 * the cherry bomb's own clip is already its explode).
 */
export function startPlantAnimations(plant: Plant, definition: PlantDefinition, asleep: boolean, random: AnimationRandom): void {
    const animation = definition.animation
    if (!animation) return
    startPlantLayers(animation, plant, { ...animation.layers, ...(asleep ? animation.asleep : undefined) }, random)
    plant.animationStarted(asleep, random)
}

/** Plant::FindTargetAndFire: the plant starts a shot, so its blink ends and its layers play their firing clips from the start. */
export function firePlantAnimation(plant: Plant, definition: PlantDefinition, random: AnimationRandom): void {
    const animation = definition.animation
    if (!animation || !plant.animations) return
    delete plant.animations[PLANT_BLINK_LAYER]
    playLayers(animation, plant, animation.fire, random)
}

/** The plant came to a state of its kind: its layers play that state's clips, and a plant that blinks from then on counts down to its first. */
export function plantAbilityAnimation(plant: Plant, definition: PlantDefinition, state: string, random: AnimationRandom): void {
    const animation = definition.animation
    if (!animation || !plant.animations) return
    playLayers(animation, plant, animation.states?.[state], random)
    const blink = animation.blink
    if (blink?.first && blink.states?.includes(state)) plant.blinkTicks = random.integer(blink.first.min, blink.first.max)
}

/**
 * Where a part of the plant is now: the track of the clip the layer plays, between two of its frames. A loop comes
 * round after the clip's frames, holding its last for the one before the first. A clip without the track has the part
 * at the plant's own place.
 */
export function plantTrackPoint(plant: Plant, definition: PlantDefinition, layer: string, track: string): { x: number, y: number } {
    const state = plant.animations?.[layer], clip = state && definition.animation?.clips[state.clip], points = clip?.tracks?.[track]
    if (!state || !clip || !points) return { x: 0, y: 0 }
    const last = points.length - 1, time = framePosition(clip, state.time)
    const from = Math.min(last, Math.floor(time)), to = Math.min(last, from + 1), part = time - from
    return { x: points[from].x + (points[to].x - points[from].x) * part, y: points[from].y + (points[to].y - points[from].y) * part }
}

/** Runs after the plants acted (Plant::Update ends with Animate and UpdateReanim): a clip started this tick moves on at once. */
export function createPlantAnimationSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:plant-animation',
        run({ world }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result === 'lost' || level.paused) return
            const random = world.resources.get(RandomResource)
            for (const entity of world.query(PlantComponent)) {
                const plant = world.get(entity, PlantComponent)!
                const definition = definitions.plants[plant.typeId], animation = definition.animation
                if (!animation || !plant.animations) continue
                stepPlantAnimation(animation, plant, random, {
                    // A chilled plant animates at half its rate, and counts down to its blink every other tick.
                    slowed: () => plantPace(plant),
                    chewed: plant.recentlyEatenCounter > 0,
                    // Plant::UpdateBlink: an asleep plant's blink waits. Plant::DoBlink: one about to shoot, or in a state
                    // it does not blink in (a potato mine not armed), misses its blink (its kind says, Plant.blinkMisses).
                    blinkWaits: plantSkipsTick(plant) || isPlantAsleep(definition, level.board),
                    blinkMisses: () => plant.blinkMisses(),
                })
            }
        },
    }
}
