import {
    assertQualifiedName,
    type GamePhase,
    type GameSystem,
    type SystemContext,
    type World,
} from '@/ecs/index'
import { isQualifiedId } from '@/shared/mod'
import type { GameplayDefinitionsV2 } from '@/shared/content/gameplay'
import type { JsonObject } from '@/shared/protocol'
import {
    EconomyStateResource,
    LawnMowerComponent,
    LevelStateResource,
    PlantAttackComponent,
    PlantComponent,
    PositionComponent,
    ProjectileComponent,
    RandomResource,
    SeedBankResource,
    ZombieComponent,
} from './gameplay'
import { ItemComponent, TutorialResource, WaveResource } from './levelOne'
import { EventQueueResource, emitServerEvent } from './events'

export interface GameplaySystemBindings {
    readonly definitions: Readonly<GameplayDefinitionsV2>
    readonly emitEvent: (world: World, type: string, data: JsonObject) => void
    readonly components: Readonly<{
        position: typeof PositionComponent
        lawnMower: typeof LawnMowerComponent
        plant: typeof PlantComponent
        plantAttack: typeof PlantAttackComponent
        zombie: typeof ZombieComponent
        projectile: typeof ProjectileComponent
        item: typeof ItemComponent
    }>
    readonly resources: Readonly<{
        level: typeof LevelStateResource
        economy: typeof EconomyStateResource
        random: typeof RandomResource
        seedBank: typeof SeedBankResource
        tutorial: typeof TutorialResource
        wave: typeof WaveResource
        events: typeof EventQueueResource
    }>
}

export type GameplaySystemRunner = (
    context: SystemContext,
    bindings: GameplaySystemBindings,
) => void
export type GameplaySystemEnhancer = (
    context: SystemContext,
    next: () => void,
    bindings: GameplaySystemBindings,
) => void
export type GameplaySystemModMode = 'enhance' | 'replace'
export type GameplaySystemModRegistration =
    | { ownerId: string, targetId: string, mode: 'enhance', apply: GameplaySystemEnhancer }
    | { ownerId: string, targetId: string, mode: 'replace', apply: GameplaySystemRunner }

export interface PlantUpgradeRegistration {
    readonly seedId: string
    readonly targetPlantId: string
    readonly resultSeedId: string
}

export interface RegisterGameplaySystemMod {
    (ownerId: string, targetId: string, mode: 'enhance', apply: GameplaySystemEnhancer): void
    (ownerId: string, targetId: string, mode: 'replace', apply: GameplaySystemRunner): void
}

export interface GameplaySystemModApi {
    enhanceSystem(systemId: string, enhancer: GameplaySystemEnhancer): void
    replaceSystem(systemId: string, replacement: GameplaySystemRunner): void
    registerPlantUpgrade(upgrade: PlantUpgradeRegistration): void
}

export interface ScheduledGameplaySystem {
    readonly phase: GamePhase
    readonly system: GameSystem
}

interface Enhancement {
    readonly modId: string
    readonly run: GameplaySystemEnhancer
}

interface Replacement {
    readonly modId: string
    readonly run: GameplaySystemRunner
}

export class GameplaySystemMods {
    private readonly enhancements = new Map<string, Enhancement[]>()
    private readonly replacements = new Map<string, Replacement>()
    private readonly plantUpgrades = new Map<string, PlantUpgradeRegistration & { ownerId: string }>()
    private frozen = false

    forMod(modId: string): GameplaySystemModApi {
        if (!isQualifiedId(modId)) throw new Error(`Invalid Mod owner ID: ${modId}`)
        return Object.freeze({
            enhanceSystem: (systemId: string, enhancer: GameplaySystemEnhancer) =>
                this.register(modId, systemId, 'enhance', enhancer),
            replaceSystem: (systemId: string, replacement: GameplaySystemRunner) =>
                this.register(modId, systemId, 'replace', replacement),
            registerPlantUpgrade: (upgrade: PlantUpgradeRegistration) =>
                this.registerPlantUpgrade(modId, upgrade),
        })
    }

    registerPlantUpgrade(ownerId: string, upgrade: PlantUpgradeRegistration): void {
        this.assertMutable()
        if (!isQualifiedId(ownerId)) throw new Error(`Invalid Mod owner ID: ${ownerId}`)
        if (!upgrade || !isQualifiedId(upgrade.seedId) || !isQualifiedId(upgrade.targetPlantId) ||
            !isQualifiedId(upgrade.resultSeedId)) {
            throw new Error('Invalid plant upgrade registration')
        }
        const key = plantUpgradeKey(upgrade.seedId, upgrade.targetPlantId)
        const existing = this.plantUpgrades.get(key)
        if (existing) {
            throw new Error(
                `Plant upgrade ${upgrade.seedId} + ${upgrade.targetPlantId} is already registered by ${existing.ownerId}`,
            )
        }
        this.plantUpgrades.set(key, { ownerId, ...upgrade })
    }

    resolvePlantUpgrade(seedId: string, targetPlantId: string): string | undefined {
        return this.plantUpgrades.get(plantUpgradeKey(seedId, targetPlantId))?.resultSeedId
    }

    register(ownerId: string, targetId: string, mode: 'enhance', apply: GameplaySystemEnhancer): void
    register(ownerId: string, targetId: string, mode: 'replace', apply: GameplaySystemRunner): void
    register(
        ownerId: string,
        targetId: string,
        mode: GameplaySystemModMode,
        apply: GameplaySystemEnhancer | GameplaySystemRunner,
    ): void {
        this.assertMutable()
        if (!isQualifiedId(ownerId)) throw new Error(`Invalid Mod owner ID: ${ownerId}`)
        assertQualifiedName(targetId)
        if (typeof apply !== 'function') throw new Error('Gameplay system Mod apply must be a function')
        if (mode === 'enhance') {
            const entries = this.enhancements.get(targetId) ?? []
            entries.push({ modId: ownerId, run: apply as GameplaySystemEnhancer })
            this.enhancements.set(targetId, entries)
            return
        }
        if (mode !== 'replace') throw new Error(`Invalid gameplay system Mod mode: ${String(mode)}`)
        const existing = this.replacements.get(targetId)
        if (existing) {
            throw new Error(
                `System ${targetId} is already replaced by ${existing.modId}; ${ownerId} cannot replace it`,
            )
        }
        this.replacements.set(targetId, { modId: ownerId, run: apply as GameplaySystemRunner })
    }

    apply(
        systems: readonly ScheduledGameplaySystem[],
        bindings: GameplaySystemBindings,
    ): ScheduledGameplaySystem[] {
        const ids = new Set(systems.map(entry => entry.system.id))
        const targets = new Set([...this.enhancements.keys(), ...this.replacements.keys()])
        for (const target of targets) {
            if (!ids.has(target)) throw new Error(`Mod targets unknown gameplay system: ${target}`)
        }
        for (const upgrade of this.plantUpgrades.values()) {
            const seed = bindings.definitions.seeds[upgrade.seedId]
            const resultSeed = bindings.definitions.seeds[upgrade.resultSeedId]
            if (!seed || !bindings.definitions.plants[upgrade.targetPlantId] || !resultSeed) {
                throw new Error(`Plant upgrade from ${upgrade.ownerId} references unknown content`)
            }
        }
        this.frozen = true

        return systems.map(entry => {
            const enhancements = this.enhancements.get(entry.system.id) ?? []
            const replacement = this.replacements.get(entry.system.id)?.run
            if (enhancements.length === 0 && !replacement) return entry
            const base: GameplaySystemRunner = replacement ?? (context => entry.system.run(context))
            return {
                phase: entry.phase,
                system: {
                    id: entry.system.id,
                    run: context => runEnhancement(enhancements, base, context, bindings),
                },
            }
        })
    }

    private assertMutable(): void {
        if (this.frozen) throw new Error('Gameplay system Mods are frozen')
    }
}

function plantUpgradeKey(seedId: string, targetPlantId: string): string {
    return `${seedId}\0${targetPlantId}`
}

export function createGameplaySystemBindings(definitions: GameplayDefinitionsV2): GameplaySystemBindings {
    return Object.freeze({
        definitions,
        emitEvent: (world: World, type: string, data: JsonObject) =>
            emitServerEvent(world.resources.get(EventQueueResource), type, data),
        components: Object.freeze({
            position: PositionComponent,
            lawnMower: LawnMowerComponent,
            plant: PlantComponent,
            plantAttack: PlantAttackComponent,
            zombie: ZombieComponent,
            projectile: ProjectileComponent,
            item: ItemComponent,
        }),
        resources: Object.freeze({
            level: LevelStateResource,
            economy: EconomyStateResource,
            random: RandomResource,
            seedBank: SeedBankResource,
            tutorial: TutorialResource,
            wave: WaveResource,
            events: EventQueueResource,
        }),
    })
}

function runEnhancement(
    enhancements: readonly Enhancement[],
    base: GameplaySystemRunner,
    context: SystemContext,
    bindings: GameplaySystemBindings,
    index = 0,
): void {
    const enhancement = enhancements[index]
    if (!enhancement) {
        base(context, bindings)
        return
    }

    let nextCalls = 0
    let active = true
    try {
        enhancement.run(context, () => {
            if (!active) throw new Error(`System enhancer from ${enhancement.modId} called next outside its run`)
            nextCalls++
            if (nextCalls > 1) {
                throw new Error(`System enhancer from ${enhancement.modId} called next more than once`)
            }
            runEnhancement(enhancements, base, context, bindings, index + 1)
        }, bindings)
    } finally {
        active = false
    }
    if (nextCalls === 0) {
        throw new Error(`System enhancer from ${enhancement.modId} did not call next`)
    }
}
