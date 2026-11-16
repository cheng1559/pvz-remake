import { defineResource, type World } from '@/ecs/index'
import type { GameplayDefinitions, GameplayLevels, LevelDefinition, ToolDefinition } from '@/shared/content/gameplay'
import { BASE_MOD_ID, isModId, isQualifiedId, Registry } from '@/shared/mod'
import type { DialogQuestion } from '@/shared/protocol'
import { LevelStateResource } from '../state/components'
import { TutorialResource } from '../state/levelState'
import { plantingTutorial } from './plantingTutorial'
import { sunflowerTutorial } from './sunflowerTutorial'
import { moreSunTutorial } from './moreSunTutorial'
import { shovelTutorial } from './shovelTutorial'
import { introDialog } from './introDialog'
import { packetUpgradeOffer, packetUpgradeOffers } from './packetUpgradeOffer'
import { coinAdvice } from './coinAdvice'
import { whackTutorial } from './whackTutorial'

/**
 * A level's scripted flow, registered by ID and named by the level's `tutorial`. What only one level does lives in its
 * script, as the original's CutScene, Board and Challenge code checks the level number.
 */
export interface TutorialScript {
    readonly blocksStart?: boolean
    readonly blocksIntro?: boolean
    readonly alwaysActive?: boolean
    /** Crazy Dave comes for the intro's dialogue. */
    readonly dave?: true
    /** The shovel is up during the intro (CutScene::StartLevelIntro on Wall-nut Bowling). */
    readonly toolsInIntro?: true
    /** Plants on a first adventure's lawn when the level starts. */
    readonly introPlants?: ReadonlyArray<{ seedId: string; row: number; column: number }>
    /** Plant::Update: the plants on the lawn go on through the intro (Wall-nut Bowling's), where others wait for play. */
    readonly plantsLiveInIntro?: true
    /**
     * Board::DropLootPiece on a first adventure: `firstCoinAfterWave` guarantees a coin once that many waves have
     * spawned, and no drop brings the money (with the mowers' coins) to `savingsCap`.
     */
    readonly loot?: { firstCoinAfterWave?: number; savingsCap?: number }
    /**
     * SeedChooserScreen::OnStartButton on a first adventure: warn first when `seed` is not picked, and use
     * `sunWarning` instead of SEED_CHOOSER_SUN_WARNING when no sun producer is.
     */
    readonly chooserWarnings?: { seed?: { id: string; warning: string }; sunWarning?: string }
    advanceDialog?(world: World): void
    /** The Yes/No question the current line asks, with what the client's dialog shows (the snapshot's `dialog.question`). */
    dialogQuestion?(world: World, definitions: GameplayDefinitions): DialogQuestion | undefined
    /** The player's Yes or No to the question the current line asks. */
    answerDialog?(world: World, accept: boolean): void
    toolSelected?(world: World): void
    /** Whether the tool can be picked up before play, as the shovel during its tutorial. */
    canSelectTool?(world: World, tool: ToolDefinition): boolean
    plantRemoved?(world: World): void
    initialize?(world: World, firstAdventure: boolean): void
    beforeSun?(world: World, tick: number): void
    sunSpawned?(world: World): void
    update?(world: World, definitions: GameplayDefinitions, tick: number): void
    seedSelected?(world: World, seedId: string): void
    seedCanceled?(world: World, definitions: GameplayDefinitions, tick: number): void
    seedReady?(world: World, definitions: GameplayDefinitions, tick: number, seedId: string): void
    seedRejected?(world: World, reason: 'seed-not-ready' | 'not-enough-sun'): void
    /** `seedId`: what was planted. */
    plantPlaced?(world: World, definitions: GameplayDefinitions, tick: number, seedId: string): void
    sunCollected?(world: World, tick: number, seedId: string, canAfford: boolean): void
    /** A coin or diamond is picked up. */
    moneyCollected?(world: World, typeId: string): void
}

/** The scripts by ID: the base game's (installBuiltinTutorials) and the Mods' (`registry.tutorials.register`). */
export class TutorialRegistry {
    private readonly scripts = new Registry<TutorialScript>('tutorial')

    register(ownerId: string, id: string, script: TutorialScript): void {
        if (!isModId(ownerId) || !isQualifiedId(id) || typeof script !== 'object' || script === null) throw new Error(`Invalid tutorial: ${id}`)
        this.scripts.register(id, script, ownerId)
    }

    has(id: string): boolean { return this.scripts.has(id) }

    /** The level's script; undefined for a level without one. */
    get(level: LevelDefinition): TutorialScript | undefined {
        if (level.tutorial === undefined) return undefined
        const script = this.scripts.get(level.tutorial)
        if (!script) throw new Error(`tutorial is not installed: ${level.tutorial}`)
        return script
    }

    checkpoint(): () => void { return this.scripts.checkpoint() }

    validate(levels: GameplayLevels): void {
        for (const [id, level] of Object.entries(levels.levels)) {
            if (level.tutorial !== undefined && !this.scripts.has(level.tutorial)) throw new Error(`${id}.tutorial: tutorial is not installed: ${level.tutorial}`)
        }
    }

    freeze(): void { this.scripts.freeze() }
}

/** The base game's scripts; a Mod registers its own through the same registry. */
export function installBuiltinTutorials(registry: TutorialRegistry): void {
    const scripts: Record<string, TutorialScript> = {
        'pvz:adventure-1-1': plantingTutorial,
        'pvz:adventure-1-2': sunflowerTutorial,
        'pvz:more-sun': moreSunTutorial,
        'pvz:adventure-1-5': shovelTutorial,
        // CutScene::StartLevelIntro: 201 on level 11 and 1401 on level 12. 2-1 holds the first coin back, explains coins
        // and keeps the seed-slot upgrade out of reach until 2-2's lines about it.
        'pvz:adventure-2-1': { ...introDialog(201, 207), loot: { firstCoinAfterWave: 5, savingsCap: 75 }, moneyCollected: coinAdvice,
            chooserWarnings: { seed: { id: 'pvz:puffshroom', warning: 'SEED_CHOOSER_PUFFSHROOM_WARNING' }, sunWarning: 'SEED_CHOOSER_NIGHT_SUN_WARNING' } },
        'pvz:adventure-2-2': introDialog(1401, 1402),
        // CutScene::StartLevelIntro offers the first seed-slot upgrade on levels 13-24 except 15, 20 and 21, and the
        // second on levels 16-24 except 20 and 21.
        'pvz:adventure-2-3': packetUpgradeOffer,
        'pvz:adventure-2-4': packetUpgradeOffer,
        'pvz:adventure-2-5': whackTutorial,
        'pvz:adventure-2-6': packetUpgradeOffers(2),
        'pvz:adventure-2-7': packetUpgradeOffers(2),
    }
    for (const [id, script] of Object.entries(scripts)) if (!registry.has(id)) registry.register(BASE_MOD_ID, id, script)
}

/** The game's tutorial registry (createWorld), from which the level's script is looked up. */
export const TutorialsResource = defineResource<TutorialRegistry>('pvz:tutorials')

/** The level's script, whether it plays this time or not. */
export function levelTutorial(world: World): TutorialScript | undefined {
    return world.resources.get(TutorialsResource).get(world.resources.get(LevelStateResource).definition)
}

/** The level's script when it plays: on a first adventure, or always for one that is `alwaysActive`. */
export function getActiveTutorial(world: World): TutorialScript | undefined {
    const script = levelTutorial(world)
    return world.resources.get(TutorialResource).firstAdventure || script?.alwaysActive ? script : undefined
}
