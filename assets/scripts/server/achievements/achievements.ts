import { defineResource, type World } from '@/ecs/index'
import type { AchievementDefinition, GameplayDefinitions } from '@/shared/content/gameplay'
import type { JsonObject, ServerEvent } from '@/shared/protocol/index'
import { isModId, isQualifiedId } from '@/shared/mod'
import { emitServerEvent, EventQueueResource } from '../state/events'
import { LevelStateResource } from '../state/components'

/**
 * The installed achievements, the ones the player has (the profile's, from the start packet; not saved), and each
 * achievement's trigger state in this level (`progress`, saved with the level).
 */
export interface AchievementState {
    definitions: Readonly<Record<string, AchievementDefinition>>
    earned: Set<string>
    progress: Record<string, JsonObject>
}

export const AchievementsResource = defineResource<AchievementState>('pvz:achievements')

/**
 * ReportAchievement::GiveAchievement: the first grant reports `achievementEarned`, and the client saves it to the
 * profile. `announce` shows it in the level now, with its sound; otherwise the next award page lists it (the original's
 * end-of-level checks). A level with `achievements: false` grants none. Returns whether the achievement is new.
 */
export function grantAchievement(world: World, id: string, announce = true): boolean {
    const achievements = world.resources.get(AchievementsResource)
    const definition = achievements.definitions[id]
    if (!definition) throw new Error(`Unknown achievement: ${id}`)
    if (achievements.earned.has(id) || world.resources.get(LevelStateResource).definition.achievements === false) return false
    achievements.earned.add(id)
    emitServerEvent(world.resources.get(EventQueueResource), 'achievementEarned', { id, titleKey: definition.titleKey, announce })
    return true
}

export interface AchievementTriggerContext {
    world: World
    definitions: GameplayDefinitions
    event: ServerEvent
    /** The achievement's `trigger` settings, as `validate` accepted them. */
    settings: JsonObject
    /** This achievement's own state in the level, saved with it. */
    state: JsonObject
    /** Grants the achievement; `announce` false leaves it for the award page. */
    grant(announce?: boolean): void
}

/**
 * How an achievement is earned, by the server events of the level: the gameplay only reports what happens, and the
 * trigger decides from its settings. An achievement's `trigger: {kind, ...settings}` picks one by `kind`.
 */
export interface AchievementTrigger {
    /** Throw on settings the trigger does not take or that do not fit the content. */
    validate(settings: JsonObject, definitions: GameplayDefinitions, name: string): void
    /** Sees every event of a level, as it is emitted, until the player has the achievement. */
    observe(context: AchievementTriggerContext): void
}

export class AchievementTriggerRegistry {
    private readonly entries = new Map<string, { ownerId: string; trigger: AchievementTrigger }>()
    private frozen = false

    register(ownerId: string, kind: string, trigger: AchievementTrigger): void {
        if (this.frozen) throw new Error('achievement triggers are frozen')
        if (!isModId(ownerId) || !isQualifiedId(kind) || typeof trigger?.validate !== 'function' || typeof trigger.observe !== 'function') {
            throw new Error(`Invalid achievement trigger: ${kind}`)
        }
        const existing = this.entries.get(kind)
        if (existing) throw new Error(`achievement trigger ${kind} is already registered by ${existing.ownerId}`)
        this.entries.set(kind, { ownerId, trigger: Object.freeze(trigger) })
    }

    has(kind: string): boolean { return this.entries.has(kind) }

    get(kind: string): AchievementTrigger {
        const entry = this.entries.get(kind)
        if (!entry) throw new Error(`achievement trigger is not installed: ${kind}`)
        return entry.trigger
    }

    checkpoint(): () => void {
        const kinds = new Set(this.entries.keys())
        return () => { for (const kind of [...this.entries.keys()]) if (!kinds.has(kind)) this.entries.delete(kind) }
    }

    validate(definitions: GameplayDefinitions): void {
        for (const [id, achievement] of Object.entries(definitions.achievements)) {
            if (!achievement.trigger) continue
            const name = `achievements.${id}.trigger`
            if (!this.entries.has(achievement.trigger.kind)) throw new Error(`${name}: achievement trigger is not installed: ${achievement.trigger.kind}`)
            this.get(achievement.trigger.kind).validate(achievement.trigger.settings, definitions, name)
        }
    }

    freeze(): void { this.frozen = true }
}

/** The session's event observer: every achievement the player lacks sees the event through its trigger. */
export function observeAchievements(world: World, definitions: GameplayDefinitions, triggers: AchievementTriggerRegistry, event: ServerEvent): void {
    if (event.type === 'achievementEarned') return
    const achievements = world.resources.get(AchievementsResource)
    for (const [id, achievement] of Object.entries(achievements.definitions)) {
        if (!achievement.trigger || achievements.earned.has(id)) continue
        triggers.get(achievement.trigger.kind).observe({
            world, definitions, event, settings: achievement.trigger.settings,
            state: achievements.progress[id] ??= {},
            grant: (announce = true) => { grantAchievement(world, id, announce) },
        })
    }
}
