import type { Component, World } from '@/ecs/index'
import type { LayerState } from '@/shared/content/animation'
import { LEVEL_AWARD, MOWER_READY_X, mowerY, parseProjectile as parseProjectileDefinition, PLANT_BLINK_LAYER, ZOMBIE_BODY_LAYER, ZOMBIE_CLIPS } from '@/shared/content/gameplay'
import { zombieClip } from '@/shared/content/zombieAnimation'
import { ZOMBIE_STATES } from '@/shared/content/zombieStates'
import { checkGraveRanges, GRAVE } from '@/shared/content/graves'
import { CRATER } from '@/shared/content/craters'
import { jsonRoundTrip, TEAMS, type JsonObject } from '@/shared/protocol/index'
import { array, boolean, exact, finite, integer, nonEmptyString, nonNegativeFinite, nonNegativeInteger, oneOf, positiveInteger, record, trueFlag } from '@/shared/validate'
import {
    GridItemComponent, LevelStateResource, MowedPlantComponent, MowerComponent, PlantComponent, PositionComponent, ProjectileComponent,
    ZombieComponent, type GridItem, type MowedPlant, type Plant, type Position, type Projectile, type Zombie,
} from '../state/components'
import { ItemComponent, type Item } from '../state/levelState'
import type { SavedEntity, SavedMowedPlant } from './save'
import { PLANT_FIELDS, PlantFactoryResource, type SavedPlant } from '../plants/Plant'
import { type SavedZombie, ZOMBIE_FIELDS, ZombieFactoryResource } from '../zombies/Zombie'
import { PROJECTILE_FIELDS, ProjectileFactoryResource, type SavedProjectile } from '../combat/Projectile'
import { Mower, type MowerFields } from '../level/Mower'
import type { ServerContent } from './session'

/** The base components a saved entity holds, by their key in it. */
export type SavedComponentKey = Exclude<keyof SavedEntity, 'entityId' | 'extensions'>

/** What a component's check sees: the content and the level it runs in, and the whole saved entity. */
export interface SavedComponentContext {
    content: ServerContent
    world: World
    entity: SavedEntity
}

/** What the world holds of a saved component that is more than the JSON it is saved as: a zombie is its kind's instance. */
interface LiveComponents { zombie: Zombie, plant: Plant, mowedPlant: MowedPlant, projectile: Projectile, mower: Mower }

/** What the world holds of a saved component. */
type LiveComponent<K extends SavedComponentKey> = K extends keyof LiveComponents ? LiveComponents[K] : NonNullable<SavedEntity[K]>

/**
 * How one base component is saved: its key in a saved entity, the shape it is saved in (`parse`), and whether the
 * installed content and the level can run it (`check`, as it is saved and as it is restored). It is saved as the JSON
 * it is and restored so, or as what `restore` makes of it (a zombie's kind); a Mod's components take the same way
 * through JsonComponents.
 */
export interface SavedComponent<K extends SavedComponentKey = SavedComponentKey> {
    readonly key: K
    readonly component: Component<LiveComponent<K>>
    parse(value: unknown, name: string): NonNullable<SavedEntity[K]>
    check?(value: NonNullable<SavedEntity[K]>, context: SavedComponentContext): void
    restore?(value: NonNullable<SavedEntity[K]>, context: SavedComponentContext): LiveComponent<K>
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
        // A grave or a crater.
        key: 'gridItem', component: GridItemComponent,
        parse: (value, name): GridItem => {
            if (record(value, name).typeId === CRATER) {
                const crater = exact(value, ['typeId', 'column', 'row', 'ticks'], name, ['team'])
                return { typeId: CRATER, column: nonNegativeInteger(crater.column, `${name}.column`), row: nonNegativeInteger(crater.row, `${name}.row`),
                    ticks: positiveInteger(crater.ticks, `${name}.ticks`),
                    ...(crater.team === undefined ? {} : { team: oneOf(crater.team, ['zombies'] as const, `${name}.team`) }) }
            }
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
        key: 'plant', component: PlantComponent, parse: parseSavedPlant,
        check: (saved, context) => {
            const { content: { definitions, gameplay }, world, entity } = context
            const plant = definitions.plants[saved.typeId]
            const seed = definitions.seeds[saved.seedId]
            if (!plant || seed?.kind !== 'plant' || seed.id !== saved.typeId) throw new Error(`Unknown saved plant: ${saved.typeId}`)
            gameplay.plantBehaviors.validateState(saved, plant)
            if (!onBoardRow(context) || saved.column >= world.resources.get(LevelStateResource).board.columns) {
                throw new Error(`Saved plant ${entity.entityId} is invalid for the level`)
            }
            // A plant the server animates has its layers, each on a clip of its own; the blink is counted down to with them.
            const layers = Object.entries(saved.animations ?? {})
            if (!plant.animation !== !saved.animations || !plant.animation?.blink !== (saved.blinkTicks === undefined) ||
                layers.some(([layer, state]) => !plant.animation!.clips[state.clip] || layer !== PLANT_BLINK_LAYER && !Object.hasOwn(plant.animation!.layers, layer))) {
                throw new Error(`Saved plant ${entity.entityId} has an invalid animation state`)
            }
            // As its kind: its own fields (a shooter's next shot, a chomper's state, ...).
            if (!restorePlant(saved, context).validSaved()) throw new Error(`Saved plant ${entity.entityId} is invalid for its kind`)
        },
        restore: (saved, context) => restorePlant(saved, context),
    }),
    savedComponent({
        key: 'mowedPlant', component: MowedPlantComponent,
        parse: (value, name): SavedMowedPlant => {
            const mowed = exact(value, ['plant', 'squash'], name, ['left'])
            return { plant: parseSavedPlant(mowed.plant, `${name}.plant`), squash: parseLayer(mowed.squash, `${name}.squash`),
                ...(mowed.left === undefined ? {} : { left: trueFlag(mowed.left, `${name}.left`) }) }
        },
        check: (mowed, context) => {
            if (!onBoardRow(context) || !context.content.definitions.plants[mowed.plant.typeId]) throw new Error(`Unknown saved plant: ${mowed.plant.typeId}`)
            if (mowed.squash.clip !== ZOMBIE_CLIPS.mowered) throw new Error(`Saved entity ${context.entity.entityId} has an invalid squash`)
            restorePlant(mowed.plant, context)
        },
        restore: (mowed, context) => ({ ...mowed, plant: restorePlant(mowed.plant, context) }),
    }),
    savedComponent({
        key: 'zombie', component: ZombieComponent,
        parse: (value, name): SavedZombie => {
            // Every zombie's fields here; its kind takes its own as it is restored (Zombie.restore), kept as they are.
            const fields: readonly string[] = ZOMBIE_FIELDS, all = record(value, name)
            const own = jsonRoundTrip(Object.fromEntries(Object.entries(all).filter(([key]) => !fields.includes(key)))) as JsonObject
            const source = exact(Object.fromEntries(Object.entries(all).filter(([key]) => fields.includes(key))), [
                'typeId', 'health', 'maxHealth', 'state', 'speedPerTick', 'biteTicks', 'deathTicksRemaining',
                'walkClip', 'animations', 'hasHead', 'hasArm',
                'hasTongue', 'groanCounter', 'helmHealth', 'shieldHealth', 'chilledTicks', 'riseTicks',
            ], name, ['behaviorState', 'droppedLoot', 'team', 'mindControlled', 'frozenTicks', 'slowed'])
            const maxHealth = positiveInteger(source.maxHealth, `${name}.maxHealth`)
            const health = nonNegativeInteger(source.health, `${name}.health`)
            if (health > maxHealth) throw new TypeError(`${name}.health must not exceed maxHealth`)
            return {
                ...own,
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
                ...(source.frozenTicks === undefined ? {} : { frozenTicks: positiveInteger(source.frozenTicks, `${name}.frozenTicks`) }),
                riseTicks: nonNegativeInteger(source.riseTicks, `${name}.riseTicks`),
                ...(source.slowed === undefined ? {} : { slowed: trueFlag(source.slowed, `${name}.slowed`) }),
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
            if (!onBoardRow(context) || saved.helmHealth > (zombie.helm?.health ?? 0) || saved.shieldHealth > (zombie.shield?.health ?? 0)) {
                throw new Error(`Saved zombie ${entity.entityId} is invalid for the level`)
            }
            const body = saved.animations[ZOMBIE_BODY_LAYER]
            if (!body || Object.keys(saved.animations).some(layer => !Object.hasOwn(zombie.animation.layers, layer)) || !zombie.animation.clips[saved.walkClip]?.ground ||
                (saved.state === 'mowered') !== (body.clip === ZOMBIE_CLIPS.mowered) || !zombieClip(zombie.animation, body.clip) ||
                saved.state === 'dying' && !zombie.animation.clips[body.clip].marks) {
                throw new Error(`Saved zombie ${entity.entityId} has an invalid animation state`)
            }
            // As its kind: its own fields, none in the air but in its kind's jump, a walk on ground but a dancer's steps or a gasp, ...
            if (!restoreZombie(saved, context).validSaved(zombieClip(zombie.animation, body.clip)!)) {
                throw new Error(`Saved zombie ${entity.entityId} is invalid for its kind`)
            }
        },
        restore: (saved, context) => restoreZombie(saved, context),
    }),
    savedComponent({
        key: 'projectile', component: ProjectileComponent,
        parse: parseSavedProjectile,
        check: (projectile, context) => {
            const { content: { definitions, gameplay }, world, entity } = context
            if (!onBoardRow(context) || !definitions.projectiles[projectile.typeId]) throw new Error(`Unknown saved projectile: ${projectile.typeId}`)
            // Its motion is installed and takes the state it flew with.
            const motion = gameplay.projectileMotions.resolve(projectile.motion)
            if (!motion.parseState && projectile.motionState !== undefined) throw new Error(`Saved projectile ${entity.entityId} has an invalid motion state`)
            motion.parseState?.(projectile.motionState)
            // As its kind: its own fields (a mower's chew).
            if (!restoreProjectile(projectile, context).validSaved(world, entity.position!)) throw new Error(`Saved projectile ${entity.entityId} is invalid for its kind`)
        },
        restore: (saved, context) => restoreProjectile(saved, context),
    }),
    savedComponent({
        key: 'mower', component: MowerComponent,
        parse: (value, name): MowerFields => ({ typeId: nonEmptyString(exact(value, ['typeId'], name).typeId, `${name}.typeId`) }),
        // It waits where every row's does, to set off as the level's mowing projectile.
        check: (mower, context) => {
            const { world, entity } = context, level = world.resources.get(LevelStateResource), position = entity.position!
            if (!onBoardRow(context) || mower.typeId !== level.definition.lawnMower || position.x !== MOWER_READY_X || position.y !== mowerY(level.board, position.row)) {
                throw new Error(`Saved mower ${entity.entityId} is invalid for the level`)
            }
        },
        restore: (saved, { entity }) => {
            const mower = new Mower(saved.typeId)
            mower.restore(saved, `Saved mower ${entity.entityId}`)
            return mower
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
 * domain component (or only a Mod's), each of its components checked against the content and the level.
 */
export function checkSavedEntity(content: ServerContent, world: World, entity: SavedEntity): void {
    if (entity.gridItem) {
        if (Object.keys(entity).some(key => key !== 'entityId' && key !== 'gridItem' && key !== 'extensions')) throw new Error(`Saved grid item ${entity.entityId} must have no other component`)
    } else {
        if (!entity.position) throw new Error(`Saved entity ${entity.entityId} has no position`)
        const kinds = [entity.plant, entity.mowedPlant, entity.zombie, entity.mower, entity.projectile, entity.item].filter(value => value !== undefined).length
        if (kinds !== 1 && !(kinds === 0 && entity.extensions && Object.keys(entity.extensions).length)) throw new Error(`Saved entity ${entity.entityId} must have exactly one domain component`)
    }
    const context = { content, world, entity }
    for (const { key, check } of SAVED_COMPONENTS) {
        const value = entity[key]
        if (value !== undefined) (check as ((value: unknown, context: SavedComponentContext) => void) | undefined)?.(value, context)
    }
}

/** A saved plant: every plant's fields here; its kind takes its own as it is restored (Plant.restore), kept as they are. */
function parseSavedPlant(value: unknown, name: string): SavedPlant {
    const fields: readonly string[] = PLANT_FIELDS, all = record(value, name)
    const own = jsonRoundTrip(Object.fromEntries(Object.entries(all).filter(([key]) => !fields.includes(key)))) as JsonObject
    const source = exact(Object.fromEntries(Object.entries(all).filter(([key]) => fields.includes(key))),
        ['typeId', 'seedId', 'column', 'health', 'maxHealth', 'recentlyEatenCounter', 'chilledTicks'], name,
        ['behaviorState', 'team', 'mindControlled', 'frozenTicks', 'animations', 'blinkTicks'])
    const maxHealth = positiveInteger(source.maxHealth, `${name}.maxHealth`)
    const health = nonNegativeInteger(source.health, `${name}.health`)
    if (health > maxHealth) throw new TypeError(`${name}.health must not exceed maxHealth`)
    return {
        ...own,
        typeId: nonEmptyString(source.typeId, `${name}.typeId`),
        seedId: nonEmptyString(source.seedId, `${name}.seedId`),
        column: nonNegativeInteger(source.column, `${name}.column`),
        health,
        maxHealth,
        recentlyEatenCounter: nonNegativeInteger(source.recentlyEatenCounter, `${name}.recentlyEatenCounter`),
        chilledTicks: nonNegativeInteger(source.chilledTicks, `${name}.chilledTicks`),
        ...(source.frozenTicks === undefined ? {} : { frozenTicks: positiveInteger(source.frozenTicks, `${name}.frozenTicks`) }),
        ...(source.team === undefined ? {} : { team: oneOf(source.team, TEAMS, `${name}.team`) }),
        ...(source.mindControlled === undefined ? {} : { mindControlled: trueFlag(source.mindControlled, `${name}.mindControlled`) }),
        ...(source.animations === undefined ? {} : { animations: parseLayers(source.animations, `${name}.animations`) }),
        ...(source.blinkTicks === undefined ? {} : { blinkTicks: nonNegativeInteger(source.blinkTicks, `${name}.blinkTicks`) }),
        ...parseBehaviorState(source, name),
    }
}

/** A saved projectile: every projectile's fields here; its kind takes its own as it is restored (Projectile.restore), kept as they are. */
function parseSavedProjectile(value: unknown, name: string): SavedProjectile {
    const fields: readonly string[] = PROJECTILE_FIELDS, all = record(value, name)
    const own = jsonRoundTrip(Object.fromEntries(Object.entries(all).filter(([key]) => !fields.includes(key)))) as JsonObject
    const source = exact(Object.fromEntries(Object.entries(all).filter(([key]) => fields.includes(key))),
        ['typeId', 'age', 'definition', 'motion'], name, ['team', 'motionState', 'hits'])
    return {
        ...own,
        typeId: nonEmptyString(source.typeId, `${name}.typeId`),
        age: nonNegativeInteger(source.age, `${name}.age`),
        definition: parseProjectileDefinition(source.definition, `${name}.definition`),
        motion: nonEmptyString(source.motion, `${name}.motion`),
        ...(source.team === undefined ? {} : { team: oneOf(source.team, TEAMS, `${name}.team`) }),
        ...(source.hits === undefined ? {} : { hits: array(source.hits, `${name}.hits`).map(hit => positiveInteger(hit, `${name}.hits[]`)) }),
        // Its motion checks it (check).
        ...(source.motionState === undefined ? {} : { motionState: jsonRoundTrip(record(source.motionState, `${name}.motionState`)) as JsonObject }),
    }
}

/** A saved projectile as its kind: of its type's kind, with its kind's own fields (Projectile.restore). */
function restoreProjectile(saved: SavedProjectile, { world, entity }: SavedComponentContext): Projectile {
    return world.resources.get(ProjectileFactoryResource).restore(saved, `Saved projectile ${entity.entityId}`)
}

/** A saved plant as its kind: of its type's kind, with its kind's own fields (Plant.restore). */
function restorePlant(saved: SavedPlant, { world, entity }: SavedComponentContext): Plant {
    return world.resources.get(PlantFactoryResource).restore(saved, `Saved plant ${entity.entityId}`)
}

/** A saved zombie as its kind: of its type's kind, with its kind's own fields (Zombie.restore). */
function restoreZombie(saved: SavedZombie, { world, entity }: SavedComponentContext): Zombie {
    return world.resources.get(ZombieFactoryResource).restore(saved, `Saved zombie ${entity.entityId}`)
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
