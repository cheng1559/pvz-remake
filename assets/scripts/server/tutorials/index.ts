import type { World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import type { JsonObject } from '@/shared/protocol'
import { LevelStateResource } from '../state/components'
import { TutorialResource } from '../state/levelState'
import { plantingTutorial } from './plantingTutorial'
import { sunflowerTutorial } from './sunflowerTutorial'
import { moreSunTutorial } from './moreSunTutorial'
import { shovelTutorial } from './shovelTutorial'
import { introDialog } from './introDialog'
import { packetUpgradeOffer } from './packetUpgradeOffer'
import { coinAdvice } from './coinAdvice'
import { whackTutorial } from './whackTutorial'

/**
 * A level's scripted flow, by its `tutorial` ID. What only one level does lives in its script, as the original's
 * CutScene, Board and Challenge code checks the level number.
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
    /** The Yes/No question the current line asks, with what the client's dialog shows (`pvz:dialog`'s `question`). */
    dialogQuestion?(world: World, definitions: GameplayDefinitions): JsonObject | undefined
    /** The player's Yes or No to the question the current line asks. */
    answerDialog?(world: World, accept: boolean): void
    toolSelected?(world: World): void
    canSelectTool?(world: World, toolId: string): boolean
    plantRemoved?(world: World): void
    initialize?(world: World, firstAdventure: boolean): void
    beforeSun?(world: World, tick: number): void
    sunSpawned?(world: World): void
    update?(world: World, tick: number): void
    seedSelected?(world: World, seedId: string): void
    seedCanceled?(world: World, tick: number): void
    seedReady?(world: World, tick: number, seedId: string): void
    seedRejected?(world: World, reason: 'seed-not-ready' | 'not-enough-sun'): void
    plantPlaced?(world: World, tick: number, plantId: string, upgraded: boolean): void
    sunCollected?(world: World, tick: number, seedId: string, canAfford: boolean): void
    /** A coin or diamond is picked up. */
    moneyCollected?(world: World, typeId: string): void
}

export const TUTORIALS: Readonly<Record<string, TutorialScript>> = {
    'pvz:adventure-1-1': plantingTutorial,
    'pvz:adventure-1-2': sunflowerTutorial,
    'pvz:more-sun': moreSunTutorial,
    'pvz:adventure-1-5': shovelTutorial,
    // CutScene::StartLevelIntro: 201 on level 11 and 1401 on level 12. 2-1 holds the first coin back, explains coins
    // and keeps the seed-slot upgrade out of reach until 2-2's lines about it.
    'pvz:adventure-2-1': { ...introDialog(201, 207), loot: { firstCoinAfterWave: 5, savingsCap: 75 }, moneyCollected: coinAdvice,
        chooserWarnings: { seed: { id: 'pvz:puffshroom', warning: 'SEED_CHOOSER_PUFFSHROOM_WARNING' }, sunWarning: 'SEED_CHOOSER_NIGHT_SUN_WARNING' } },
    'pvz:adventure-2-2': introDialog(1401, 1402),
    // CutScene::StartLevelIntro offers the first seed-slot upgrade on levels 13-24 except 15, 20 and 21.
    'pvz:adventure-2-3': packetUpgradeOffer,
    'pvz:adventure-2-4': packetUpgradeOffer,
    'pvz:adventure-2-5': whackTutorial,
}

export function getActiveTutorial(world: World): TutorialScript | undefined {
    const script = TUTORIALS[world.resources.get(LevelStateResource).definition.tutorial]
    return world.resources.get(TutorialResource).firstAdventure || script?.alwaysActive ? script : undefined
}
