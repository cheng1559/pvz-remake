import type { JsonObject } from '@/shared/protocol/index'
import { BASE_MOD_ID } from '@/shared/mod'
import { LevelStateResource } from '../state/components'
import type { AchievementTrigger, AchievementTriggerRegistry } from './achievements'

/**
 * The base game's achievement triggers, each one condition of the original (1.2.0.1096; see
 * docs/ACHIEVEMENTS.zh-CN.md), with its numbers and content IDs in the achievement's settings.
 */
export function installBuiltinAchievementTriggers(registry: AchievementTriggerRegistry): void {
    for (const [kind, trigger] of Object.entries({
        'pvz:blast': blastTrigger, 'pvz:bowling': bowlingTrigger, 'pvz:coin-streak': coinStreakTrigger,
        'pvz:sun-held': sunHeldTrigger, 'pvz:win-planting': winPlantingTrigger,
    })) if (!registry.has(kind)) registry.register(BASE_MOD_ID, kind, trigger)
}

/** Plant::DoSpecial (SPUDOW!, Explodonator): one of `plants` explodes and takes out at least `kills` zombies. */
const blastTrigger: AchievementTrigger = {
    validate(settings, definitions, name) {
        exact(settings, ['plants', 'kills'], [], name)
        ids(settings.plants, definitions.plants, `${name}.plants`)
        positive(settings.kills, `${name}.kills`)
    },
    observe({ event, settings, grant }) {
        if (event.type === 'plantExploded' && (settings.plants as string[]).includes(String(event.data.typeId)) &&
            Number(event.data.kills) >= (settings.kills as number)) grant()
    },
}

/** Plant::UpdateBowling (Roll Some Heads): a rolling nut of `plants` makes its `hits`th zombie impact, or one after. */
const bowlingTrigger: AchievementTrigger = {
    validate(settings, definitions, name) {
        exact(settings, ['plants', 'hits'], [], name)
        ids(settings.plants, definitions.plants, `${name}.plants`)
        positive(settings.hits, `${name}.hits`)
    },
    observe({ event, settings, grant }) {
        if (event.type === 'bowlingImpact' && (settings.plants as string[]).includes(String(event.data.plantTypeId)) &&
            Number(event.data.hits) >= (settings.hits as number)) grant()
    },
}

/**
 * Coin::ScoreCoin and Coin::UpdateFade (Penny Pincher): exactly `coins` coins of `items` scored in a row; one of them
 * fading uncollected starts the count over.
 */
const coinStreakTrigger: AchievementTrigger = {
    validate(settings, definitions, name) {
        exact(settings, ['items', 'coins'], [], name)
        ids(settings.items, definitions.items, `${name}.items`)
        positive(settings.coins, `${name}.coins`)
    },
    observe({ event, settings, state, grant }) {
        if ((event.type !== 'itemScored' && event.type !== 'itemExpired') || !(settings.items as string[]).includes(String(event.data.typeId))) return
        state.coins = event.type === 'itemExpired' ? 0 : Number(state.coins ?? 0) + 1
        if (state.coins === settings.coins) grant()
    },
}

/** Board::AddSun (Sunny Days): the bank holds at least `sun` once sun is added. */
const sunHeldTrigger: AchievementTrigger = {
    validate(settings, _definitions, name) {
        exact(settings, ['sun'], [], name)
        positive(settings.sun, `${name}.sun`)
    },
    observe({ event, settings, grant }) {
        if (event.type === 'sunAdded' && Number(event.data.sun) >= (settings.sun as number)) grant()
    },
}

interface PlantSelector { nocturnal?: boolean; plants?: string[] }

/**
 * The level-win checks (0x41f200; Don't Pea in the Pool, Grounded, Good Morning, No Fungus Among Us): winning on one of
 * `boards` grants it, for the award page, when every plant the player planted matched `only` and none matched `never`.
 * A selector matches nocturnal plants (Plant::IsFungus) with `nocturnal: true` and the plants it lists. Levels whose rule
 * is in `skipRules` are not checked (Whack-a-Zombie, Vasebreaker, Wall-nut Bowling).
 */
const winPlantingTrigger: AchievementTrigger = {
    validate(settings, definitions, name) {
        exact(settings, ['boards', 'skipRules'], ['only', 'never'], name)
        ids(settings.boards, definitions.boards, `${name}.boards`)
        strings(settings.skipRules, `${name}.skipRules`)
        if (settings.only === undefined && settings.never === undefined) throw new Error(`${name} needs only or never`)
        for (const key of ['only', 'never'] as const) {
            if (settings[key] === undefined) continue
            const selector = exact(settings[key], [], ['nocturnal', 'plants'], `${name}.${key}`)
            if (selector.nocturnal !== undefined && typeof selector.nocturnal !== 'boolean') throw new Error(`${name}.${key}.nocturnal must be boolean`)
            if (selector.plants !== undefined) ids(selector.plants, definitions.plants, `${name}.${key}.plants`)
        }
    },
    observe({ world, definitions, event, settings, state, grant }) {
        // Board::AddPlant: what the player plants, not the level's own plants or the debug command's.
        if (event.type === 'plantPlaced' && event.data.debug !== true) {
            const plant = String(event.data.typeId)
            const matches = (selector: PlantSelector) => selector.nocturnal === true && !!definitions.plants[plant]?.nocturnal || !!selector.plants?.includes(plant)
            const only = settings.only as PlantSelector | undefined, never = settings.never as PlantSelector | undefined
            if (only && !matches(only) || never && matches(never)) state.broken = true
        } else if (event.type === 'levelWon' && state.broken !== true) {
            const level = world.resources.get(LevelStateResource).definition
            if ((settings.boards as string[]).includes(level.board) && !(settings.skipRules as string[]).includes(level.rules?.kind ?? '')) grant(false)
        }
    },
}

function exact(value: unknown, keys: readonly string[], optional: readonly string[], name: string): JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`)
    const source = value as JsonObject
    for (const key of Object.keys(source)) if (!keys.includes(key) && !optional.includes(key)) throw new Error(`${name}.${key} is not supported`)
    for (const key of keys) if (source[key] === undefined) throw new Error(`${name}.${key} is required`)
    return source
}

function strings(value: unknown, name: string): string[] {
    if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string' || !entry)) throw new Error(`${name} must be an array of IDs`)
    return value as string[]
}

function ids(value: unknown, entries: Readonly<Record<string, unknown>>, name: string): void {
    for (const id of strings(value, name)) if (!Object.hasOwn(entries, id)) throw new Error(`${name} references unknown ID ${id}`)
}

function positive(value: unknown, name: string): void {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer`)
}
