import type { Component, World } from '@/ecs/index'
import type { LayerState } from '@/shared/content/animation'
import { LEVEL_AWARD, MOWER_READY_X, mowerY, parseProjectile as parseProjectileDefinition, PLANT_BLINK_LAYER, ZOMBIE_BODY_LAYER, ZOMBIE_CLIPS } from '@/shared/content/gameplay'
import { hasPlantAttack, PLANT_ABILITY_STATES, PLANT_ABILITY_STATES_BY_KIND, plantAbilityKind } from '@/shared/content/plantAbilities'
import { zombieClip } from '@/shared/content/zombieAnimation'
import { ZOMBIE_STATES } from '@/shared/content/zombieStates'
import { checkGraveRanges, GRAVE } from '@/shared/content/graves'
import { jsonRoundTrip, MOWER_STATES, TEAMS, type JsonObject } from '@/shared/protocol/index'
import { array, boolean, exact, finite, integer, nonEmptyString, nonNegativeFinite, nonNegativeInteger, oneOf, positiveInteger, record, trueFlag } from '@/shared/validate'
import {
    GridItemComponent, LevelStateResource, MowedPlantComponent, MowerComponent, PlantAttackComponent, PlantComponent, PositionComponent, ProjectileComponent,
    ZombieComponent, type GridItem, type MowedPlant, type Mower, type Plant, type PlantAbility, type PlantAttack, type Position, type Projectile, type Zombie,
} from '../state/components'
import { ItemComponent, type Item } from '../state/levelState'
import type { SavedEntity } from './save'
import type { ServerContent } from './session'

/** The base components a saved entity holds, by their key in it. */
export type SavedComponentKey = Exclude<keyof SavedEntity, 'entityId' | 'extensions'>

/** What a component's check sees: the content and the level it runs in, and the whole saved entity. */
export interface SavedComponentContext {
    content: ServerContent
    world: World
    entity: SavedEntity
}

/**
 * How one base component is saved: its key in a saved entity, the shape it is saved in (`parse`), and whether the
 * installed content and the level can run it (`check`, as it is saved and as it is restored). It is saved and restored
 * as the JSON it is; a Mod's components take the same way through JsonComponents.
 */
export interface SavedComponent<K extends SavedComponentKey = SavedComponentKey> {
    readonly key: K
    readonly component: Component<NonNullable<SavedEntity[K]>>
    parse(value: unknown, name: string): NonNullable<SavedEntity[K]>
    check?(value: NonNullable<SavedEntity[K]>, context: SavedComponentContext): void
}

function savedComponent<K extends SavedComponentKey>(entry: SavedComponent<K>): SavedComponent<K> { return entry }

/** Whether the entity stands in one of the board's rows (an item in flight has none: row -1). */
function onBoardRow({ world, entity }: SavedComponentContext): boolean {
    const row = entity.position?.row ?? -1
    return row >= 0 && row < world.resources.get(LevelStateResource).board.rows
}

export const SAVED_COMPONENTS: readonly SavedComponent[] = [
    savedComponent({
        key: 'position', component: PositionComponent,
        parse: (value, name): Position => {
            const source = exact(value, ['x', 'y', 'row'], name)
            return { x: finite(source.x, `${name}.x`), y: finite(source.y, `${name}.y`), row: integer(source.row, `${name}.row`) }
        },
    }),
    savedComponent({
        // A grave: the only thing of a cell there is.
        key: 'gridItem', component: GridItemComponent,
        parse: (value, name): GridItem => {
            const grave = exact(value, ['typeId', 'column', 'row', 'variant', 'riseDelay', 'offsetX', 'offsetY'], name, ['special', 'riseAtTick', 'team'])
            if (grave.typeId !== GRAVE) throw new TypeError(`${name}.typeId is not a grid item's`)
            const result = { typeId: GRAVE, column: nonNegativeInteger(grave.column, `${name}.column`), row: nonNegativeInteger(grave.row, `${name}.row`),
                variant: integer(grave.variant, `${name}.variant`), riseDelay: integer(grave.riseDelay, `${name}.riseDelay`),
                offsetX: integer(grave.offsetX, `${name}.offsetX`), offsetY: integer(grave.offsetY, `${name}.offsetY`),
                ...(grave.special === undefined ? {} : { special: trueFlag(grave.special, `${name}.special`) }),
                ...(grave.riseAtTick === undefined ? {} : { riseAtTick: nonNegativeInteger(grave.riseAtTick, `${name}.riseAtTick`) }),
                ...(grave.team === undefined ? {} : { team: oneOf(grave.team, ['plants'] as const, `${name}.team`) }) } as const
            checkGraveRanges(result, name)
            return result
        },
        check: (item, { world, entity }) => {
            const { board } = world.resources.get(LevelStateResource)
            if (item.row >= board.rows || item.column >= board.columns) throw new Error(`Saved grid item ${entity.entityId} is outside the board`)
        },
    }),
    savedComponent({
        key: 'plant', component: PlantComponent, parse: parsePlant,
        check: (saved, context) => {
            const { content: { definitions, gameplay }, world, entity } = context
            const plant = definitions.plants[saved.typeId]
            const seed = definitions.seeds[saved.seedId]
            if (!plant || seed?.kind !== 'plant' || seed.id !== saved.typeId) throw new Error(`Unknown saved plant: ${saved.typeId}`)
            gameplay.plantBehaviors.validateState(saved, plant)
            if (!onBoardRow(context) || saved.column >= world.resources.get(LevelStateResource).board.columns) {
                throw new Error(`Saved plant ${entity.entityId} is invalid for the level`)
            }
            const ability = plantAbilityKind(plant)
            if ((saved.ability === undefined) !== (ability === undefined) ||
                saved.ability && !(PLANT_ABILITY_STATES_BY_KIND[ability!] as readonly string[]).includes(saved.ability.state)) {
                throw new Error(`Saved plant ${entity.entityId} has an invalid ability state`)
            }
            // A plant the server animates has its layers, each on a clip of its own; the blink is counted down to with them.
            const layers = Object.entries(saved.animations ?? {})
            if (!plant.animation !== !saved.animations || !plant.animation?.blink !== (saved.blinkTicks === undefined) ||
                layers.some(([layer, state]) => !plant.animation!.clips[state.clip] || layer !== PLANT_BLINK_LAYER && !Object.hasOwn(plant.animation!.layers, layer))) {
                throw new Error(`Saved plant ${entity.entityId} has an invalid animation state`)
            }
            // A plant with an attack keeps its timer (PlantAttackComponent); one without has none.
            if (hasPlantAttack(plant) !== (entity.plantAttack !== undefined)) throw new Error(`Saved entity ${entity.entityId} has an invalid plant attack component`)
        },
    }),
    savedComponent({
        key: 'mowedPlant', component: MowedPlantComponent,
        parse: (value, name): MowedPlant => {
            const mowed = exact(value, ['plant', 'squash'], name, ['left'])
            return { plant: parsePlant(mowed.plant, `${name}.plant`), squash: parseLayer(mowed.squash, `${name}.squash`),
                ...(mowed.left === undefined ? {} : { left: trueFlag(mowed.left, `${name}.left`) }) }
        },
        check: (mowed, context) => {
            if (!onBoardRow(context) || !context.content.definitions.plants[mowed.plant.typeId]) throw new Error(`Unknown saved plant: ${mowed.plant.typeId}`)
            if (mowed.squash.clip !== ZOMBIE_CLIPS.mowered) throw new Error(`Saved entity ${context.entity.entityId} has an invalid squash`)
        },
    }),
    savedComponent({
        key: 'plantAttack', component: PlantAttackComponent,
        parse: (value, name): PlantAttack => {
            const source = exact(value, ['readyAtTick'], name, ['burst'])
            const burst = source.burst === undefined ? undefined : exact(source.burst, ['fireAtTick', 'shotsRemaining'], `${name}.burst`)
            return {
                readyAtTick: nonNegativeInteger(source.readyAtTick, `${name}.readyAtTick`),
                ...(burst === undefined ? {} : { burst: {
                    fireAtTick: nonNegativeInteger(burst.fireAtTick, `${name}.burst.fireAtTick`),
                    shotsRemaining: positiveInteger(burst.shotsRemaining, `${name}.burst.shotsRemaining`),
                } }),
            }
        },
        // Only a plant with an attack has one (the plant checks the other way).
        check: (_attack, { content, entity }) => {
            const plant = entity.plant && content.definitions.plants[entity.plant.typeId]
            if (!plant || !hasPlantAttack(plant)) throw new Error(`Saved entity ${entity.entityId} has an invalid plant attack component`)
        },
    }),
    savedComponent({
        key: 'zombie', component: ZombieComponent,
        parse: (value, name): Zombie => {
            const source = exact(value, [
                'typeId', 'health', 'maxHealth', 'state', 'speedPerTick', 'biteTicks', 'deathTicksRemaining',
                'walkClip', 'animations', 'hasHead', 'hasArm',
                'hasTongue', 'groanCounter', 'helmHealth', 'shieldHealth', 'chilledTicks', 'hasPole', 'enrageTicks', 'riseTicks',
            ], name, ['behaviorState', 'droppedLoot', 'team', 'mindControlled'])
            const maxHealth = positiveInteger(source.maxHealth, `${name}.maxHealth`)
            const health = nonNegativeInteger(source.health, `${name}.health`)
            if (health > maxHealth) throw new TypeError(`${name}.health must not exceed maxHealth`)
            return {
                typeId: nonEmptyString(source.typeId, `${name}.typeId`),
                health,
                maxHealth,
                state: oneOf(source.state, ZOMBIE_STATES, `${name}.state`),
                speedPerTick: finite(source.speedPerTick, `${name}.speedPerTick`),
                biteTicks: nonNegativeInteger(source.biteTicks, `${name}.biteTicks`),
                deathTicksRemaining: nonNegativeInteger(source.deathTicksRemaining, `${name}.deathTicksRemaining`),
                walkClip: nonEmptyString(source.walkClip, `${name}.walkClip`),
                animations: parseLayers(source.animations, `${name}.animations`),
                hasHead: boolean(source.hasHead, `${name}.hasHead`),
                hasTongue: boolean(source.hasTongue, `${name}.hasTongue`),
                hasArm: boolean(source.hasArm, `${name}.hasArm`),
                groanCounter: integer(source.groanCounter, `${name}.groanCounter`),
                helmHealth: nonNegativeInteger(source.helmHealth, `${name}.helmHealth`),
                shieldHealth: nonNegativeInteger(source.shieldHealth, `${name}.shieldHealth`),
                chilledTicks: nonNegativeInteger(source.chilledTicks, `${name}.chilledTicks`),
                hasPole: boolean(source.hasPole, `${name}.hasPole`),
                enrageTicks: nonNegativeFinite(source.enrageTicks, `${name}.enrageTicks`),
                riseTicks: nonNegativeInteger(source.riseTicks, `${name}.riseTicks`),
                ...(source.droppedLoot === undefined ? {} : { droppedLoot: trueFlag(source.droppedLoot, `${name}.droppedLoot`) }),
                ...(source.team === undefined ? {} : { team: oneOf(source.team, TEAMS, `${name}.team`) }),
                ...(source.mindControlled === undefined ? {} : { mindControlled: trueFlag(source.mindControlled, `${name}.mindControlled`) }),
                ...parseBehaviorState(source, name),
            }
        },
        check: (saved, context) => {
            const { content: { definitions, gameplay }, entity } = context
            const zombie = definitions.zombies[saved.typeId]
            if (!zombie) throw new Error(`Unknown saved zombie: ${saved.typeId}`)
            gameplay.zombieBehaviors.validateState(saved, zombie)
            if (!onBoardRow(context) || saved.helmHealth > (zombie.helm?.health ?? 0) || saved.shieldHealth > (zombie.shield?.health ?? 0) ||
                saved.hasPole && !zombie.vault || saved.state === 'vaulting' && !zombie.vault) {
                throw new Error(`Saved zombie ${entity.entityId} is invalid for the level`)
            }
            const body = saved.animations[ZOMBIE_BODY_LAYER]
            if (!body || Object.keys(saved.animations).some(layer => !Object.hasOwn(zombie.animation.layers, layer)) || !zombie.animation.clips[saved.walkClip]?.ground ||
                (saved.state === 'mowered') !== (body.clip === ZOMBIE_CLIPS.mowered) || !zombieClip(zombie.animation, body.clip) ||
                saved.state === 'walking' && !saved.enrageTicks && !zombie.animation.clips[body.clip].ground ||
                saved.state === 'dying' && !zombie.animation.clips[body.clip].marks) {
                throw new Error(`Saved zombie ${entity.entityId} has an invalid animation state`)
            }
        },
    }),
    savedComponent({
        key: 'projectile', component: ProjectileComponent,
        parse: (value, name): Projectile => {
            const source = exact(value, ['typeId', 'age', 'definition', 'motion'], name, ['team', 'chompCounter', 'motionState', 'hits'])
            return {
                typeId: nonEmptyString(source.typeId, `${name}.typeId`),
                age: nonNegativeInteger(source.age, `${name}.age`),
                definition: parseProjectileDefinition(source.definition, `${name}.definition`),
                motion: nonEmptyString(source.motion, `${name}.motion`),
                ...(source.team === undefined ? {} : { team: oneOf(source.team, TEAMS, `${name}.team`) }),
                ...(source.chompCounter === undefined ? {} : { chompCounter: nonNegativeInteger(source.chompCounter, `${name}.chompCounter`) }),
                ...(source.hits === undefined ? {} : { hits: array(source.hits, `${name}.hits`).map(hit => positiveInteger(hit, `${name}.hits[]`)) }),
                // Its motion checks it (check).
                ...(source.motionState === undefined ? {} : { motionState: jsonRoundTrip(record(source.motionState, `${name}.motionState`)) as JsonObject }),
            }
        },
        check: (projectile, context) => {
            const { content: { definitions, gameplay }, entity } = context
            if (!onBoardRow(context) || !definitions.projectiles[projectile.typeId]) throw new Error(`Unknown saved projectile: ${projectile.typeId}`)
            // Its motion is installed and takes the state it flew with.
            const motion = gameplay.projectileMotions.of(projectile)
            if (!motion.parseState && projectile.motionState !== undefined) throw new Error(`Saved projectile ${entity.entityId} has an invalid motion state`)
            motion.parseState?.(projectile.motionState)
            // A mowing projectile runs on its chew.
            if (!!projectile.definition.mow !== (projectile.chompCounter !== undefined)) throw new Error(`Saved projectile ${entity.entityId} is invalid for its type`)
        },
    }),
    savedComponent({
        key: 'mower', component: MowerComponent,
        parse: (value, name): Mower => ({ state: oneOf(exact(value, ['state'], name).state, MOWER_STATES, `${name}.state`) }),
        // A ready one waits where every row's does; a triggered one runs as the level's mowing projectile.
        check: (mower, context) => {
            const { world, entity } = context, level = world.resources.get(LevelStateResource), position = entity.position!
            const ready = mower.state === 'ready'
            if (!onBoardRow(context) || (ready ? entity.projectile !== undefined || position.x !== MOWER_READY_X || position.y !== mowerY(level.board, position.row)
                : entity.projectile?.typeId !== level.definition.lawnMower)) throw new Error(`Saved mower ${entity.entityId} is invalid for the level`)
        },
    }),
    savedComponent({
        key: 'item', component: ItemComponent,
        parse: (value, name): Item => {
            const source = exact(value, [
                'typeId', 'value', 'state', 'velocityX', 'velocityY', 'accelerationY', 'width', 'groundY', 'disappearTicks', 'fadeTicks',
                'scale', 'alpha',
            ], name, ['landed', 'arrow'])
            const alpha = nonNegativeInteger(source.alpha, `${name}.alpha`)
            const width = nonNegativeFinite(source.width, `${name}.width`)
            if (alpha > 255) throw new TypeError(`${name}.alpha must not exceed 255`)
            if (width === 0) throw new TypeError(`${name}.width must be positive`)
            return {
                typeId: nonEmptyString(source.typeId, `${name}.typeId`),
                value: positiveInteger(source.value, `${name}.value`),
                state: oneOf(source.state, ['available', 'collecting', 'fading'] as const, `${name}.state`),
                velocityX: finite(source.velocityX, `${name}.velocityX`),
                velocityY: finite(source.velocityY, `${name}.velocityY`),
                accelerationY: finite(source.accelerationY, `${name}.accelerationY`),
                width,
                groundY: nonNegativeFinite(source.groundY, `${name}.groundY`),
                disappearTicks: nonNegativeInteger(source.disappearTicks, `${name}.disappearTicks`),
                fadeTicks: nonNegativeInteger(source.fadeTicks, `${name}.fadeTicks`),
                scale: nonNegativeFinite(source.scale, `${name}.scale`),
                alpha,
                ...(source.landed === undefined ? {} : { landed: trueFlag(source.landed, `${name}.landed`) }),
                ...(source.arrow === undefined ? {} : { arrow: trueFlag(source.arrow, `${name}.arrow`) }),
            }
        },
        // Items lie above the board (row -1): the level's award, or an item the content has.
        check: (item, { content, world, entity }) => {
            if (item.typeId !== LEVEL_AWARD && !content.definitions.items[item.typeId] || entity.position?.row !== -1) {
                throw new Error(`Unknown saved item: ${item.typeId}`)
            }
        },
    }),
]

/**
 * Whether an entity can run as saved: as a cell's (a grid item, nothing else, no position), or with a position and one
 * domain component (or only a Mod's), each of its components checked against the content and the level. A mower that
 * has set off is one, with the projectile it runs as.
 */
export function checkSavedEntity(content: ServerContent, world: World, entity: SavedEntity): void {
    if (entity.gridItem) {
        if (Object.keys(entity).some(key => key !== 'entityId' && key !== 'gridItem' && key !== 'extensions')) throw new Error(`Saved grid item ${entity.entityId} must have no other component`)
    } else {
        if (!entity.position) throw new Error(`Saved entity ${entity.entityId} has no position`)
        const kinds = [entity.plant, entity.mowedPlant, entity.zombie, entity.mower ?? entity.projectile, entity.item].filter(value => value !== undefined).length
        if (kinds !== 1 && !(kinds === 0 && entity.extensions && Object.keys(entity.extensions).length)) throw new Error(`Saved entity ${entity.entityId} must have exactly one domain component`)
    }
    const context = { content, world, entity }
    for (const { key, check } of SAVED_COMPONENTS) {
        const value = entity[key]
        if (value !== undefined) (check as ((value: unknown, context: SavedComponentContext) => void) | undefined)?.(value, context)
    }
}

function parsePlant(value: unknown, name: string): Plant {
    const source = exact(value, ['typeId', 'seedId', 'column', 'health', 'maxHealth', 'recentlyEatenCounter', 'chilledTicks'], name,
        ['ability', 'behaviorState', 'team', 'mindControlled', 'animations', 'blinkTicks'])
    const maxHealth = positiveInteger(source.maxHealth, `${name}.maxHealth`)
    const health = nonNegativeInteger(source.health, `${name}.health`)
    if (health > maxHealth) throw new TypeError(`${name}.health must not exceed maxHealth`)
    return {
        typeId: nonEmptyString(source.typeId, `${name}.typeId`),
        seedId: nonEmptyString(source.seedId, `${name}.seedId`),
        column: nonNegativeInteger(source.column, `${name}.column`),
        health,
        maxHealth,
        recentlyEatenCounter: nonNegativeInteger(source.recentlyEatenCounter, `${name}.recentlyEatenCounter`),
        chilledTicks: nonNegativeInteger(source.chilledTicks, `${name}.chilledTicks`),
        ...(source.ability === undefined ? {} : { ability: parsePlantAbility(source.ability, `${name}.ability`) }),
        ...(source.team === undefined ? {} : { team: oneOf(source.team, TEAMS, `${name}.team`) }),
        ...(source.mindControlled === undefined ? {} : { mindControlled: trueFlag(source.mindControlled, `${name}.mindControlled`) }),
        ...(source.animations === undefined ? {} : { animations: parseLayers(source.animations, `${name}.animations`) }),
        ...(source.blinkTicks === undefined ? {} : { blinkTicks: nonNegativeInteger(source.blinkTicks, `${name}.blinkTicks`) }),
        ...parseBehaviorState(source, name),
    }
}

function parsePlantAbility(value: unknown, name: string): PlantAbility {
    const source = exact(value, ['state', 'ticks'], name, ['prey'])
    return {
        state: oneOf(source.state, PLANT_ABILITY_STATES, `${name}.state`), ticks: nonNegativeInteger(source.ticks, `${name}.ticks`),
        ...(source.prey === undefined ? {} : { prey: oneOf(source.prey, ['plant'] as const, `${name}.prey`) }),
    }
}

/** What the layers of an animation play, a plant's or a zombie's, by layer. */
function parseLayers(value: unknown, name: string): Record<string, LayerState> {
    return Object.fromEntries(Object.entries(record(value, name)).map(([layer, entry]) => [layer, parseLayer(entry, `${name}.${layer}`)]))
}

/** What a layer of an animation plays. */
function parseLayer(value: unknown, name: string): LayerState {
    const state = exact(value, ['clip', 'time', 'rate'], name, ['hidden'])
    return {
        ...(state.hidden === undefined ? {} : { hidden: trueFlag(state.hidden, `${name}.hidden`) }),
        clip: nonEmptyString(state.clip, `${name}.clip`),
        time: nonNegativeFinite(state.time, `${name}.time`),
        rate: nonNegativeFinite(state.rate, `${name}.rate`),
    }
}

/** A behaviour's own state, which the behaviour checks (EntityBehaviorRegistry.validateState). */
function parseBehaviorState(source: Record<string, unknown>, name: string) {
    return source.behaviorState === undefined ? {} : {
        behaviorState: jsonRoundTrip(record(source.behaviorState, `${name}.behaviorState`)) as JsonObject,
    }
}
