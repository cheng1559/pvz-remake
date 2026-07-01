import { createItem } from './items/ItemFactory'
import type { ItemUpdateContext } from './items/BaseItem'
import { createPlant } from './plants/PlantFactory'
import { createProjectile } from './projectiles/ProjectileFactory'
import { createZombie } from './zombies/ZombieFactory'
import { GameSession, type GameSessionOptions } from './GameSession'
import type {
    ConveyorPacketState,
    ItemEntity,
    LawnMowerEntity,
    LevelDefinition,
    PlantEntity,
    ProjectileEntity,
    SeedPacketState,
    ZombieEntity,
} from './GameTypes'
import type { AdviceWidgetSnapshot } from '@/ui/AdviceWidget'
import type { CrazyDaveDialogPhase } from './screen/CrazyDaveDialogConfig'
import type { MusicPlaybackSnapshot } from './music/MusicSystem'

const GAME_SESSION_SNAPSHOT_VERSION = 1

export interface GameParticleSnapshot {
    effect: string
    ageTicks: number
    x: number
    y: number
    z: number
    renderOrder: number
    parentEntityId?: number
    tint?: { r: number, g: number, b: number }
}

export interface GameSessionSnapshot {
    version: 1
    levelId: string
    state: Record<string, unknown> & {
        particles?: GameParticleSnapshot[]
        advice?: AdviceWidgetSnapshot | null
        crazyDave?: {
            hidden: boolean
            messageIndex: number
            dialogPhase: CrazyDaveDialogPhase
            dialogStarted: boolean
            shovelDugPlant: boolean
        }
        bowlingStripeRevealed?: boolean
        music?: MusicPlaybackSnapshot | null
    }
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

export function createGameSessionSnapshot(session: GameSession): GameSessionSnapshot {
    return {
        version: GAME_SESSION_SNAPSHOT_VERSION,
        levelId: session.level.id,
        state: clone({
            tick: session.tick,
            sun: session.sun,
            money: session.money,
            result: session.result,
            currentWave: session.currentWave,
            flagRaiseCounter: session.flagRaiseCounter,
            zombieCountDown: session.zombieCountDown,
            zombieCountDownStart: session.zombieCountDownStart,
            progressMeterWidth: session.progressMeterWidth,
            selectedSeed: session.selectedSeed,
            selectedConveyorPacketId: session.selectedConveyorPacketId,
            selectedTool: session.selectedTool,
            paused: false,
            hasPlantedAtLeastOnce: session.hasPlantedAtLeastOnce,
            rechargingEnabled: session.rechargingEnabled,
            sunCostEnabled: session.sunCostEnabled,
            sunSpawningEnabled: session.sunSpawningEnabled,
            collectMode: session.collectMode,
            seedPackets: session.seedPackets,
            conveyorPackets: session.conveyorPackets,
            plants: session.plants,
            zombies: session.zombies,
            projectiles: session.projectiles,
            items: session.items,
            lawnMowers: session.lawnMowers,
            runtime: exportRuntimeState(session),
        }),
    }
}

export function restoreGameSessionSnapshot(
    level: LevelDefinition,
    snapshot: GameSessionSnapshot,
    options: GameSessionOptions = {},
) {
    const session = new GameSession(level, options)
    if (snapshot.version !== GAME_SESSION_SNAPSHOT_VERSION || snapshot.levelId !== level.id) return session

    const state = snapshot.state
    Object.assign(session, {
        tick: state.tick,
        sun: state.sun,
        money: state.money,
        result: state.result,
        currentWave: state.currentWave,
        flagRaiseCounter: state.flagRaiseCounter,
        zombieCountDown: state.zombieCountDown,
        zombieCountDownStart: state.zombieCountDownStart,
        progressMeterWidth: state.progressMeterWidth,
        selectedSeed: state.selectedSeed,
        selectedConveyorPacketId: state.selectedConveyorPacketId,
        selectedTool: state.selectedTool,
        paused: false,
        hasPlantedAtLeastOnce: state.hasPlantedAtLeastOnce,
        rechargingEnabled: state.rechargingEnabled,
        sunCostEnabled: state.sunCostEnabled,
        sunSpawningEnabled: state.sunSpawningEnabled,
        collectMode: state.collectMode,
    })
    session.paused = false
    session.events.length = 0
    session.seedPackets.splice(0, session.seedPackets.length, ...(state.seedPackets as SeedPacketState[] ?? []))
    session.conveyorPackets.splice(0, session.conveyorPackets.length, ...(state.conveyorPackets as ConveyorPacketState[] ?? []))
    session.plants.splice(0, session.plants.length, ...restorePlants(state.plants as PlantEntity[] ?? []))
    session.zombies.splice(0, session.zombies.length, ...restoreZombies(state.zombies as ZombieEntity[] ?? []))
    session.projectiles.splice(0, session.projectiles.length, ...restoreProjectiles(state.projectiles as ProjectileEntity[] ?? []))
    session.items.splice(0, session.items.length, ...restoreItems(session, state.items as ItemEntity[] ?? []))
    session.lawnMowers.splice(0, session.lawnMowers.length, ...(state.lawnMowers as LawnMowerEntity[] ?? []))
    importRuntimeState(session, state.runtime as Record<string, unknown> ?? {})
    return session
}

function restorePlants(plants: PlantEntity[]) {
    return plants.map((plant) => Object.assign(createPlant({
        id: plant.id,
        type: plant.type,
        row: plant.row,
        col: plant.col,
        x: plant.x,
        y: plant.y,
        bowlingAnimRate: plant.isBowling ? plant.bowlingAnimRate : undefined,
    }), plant))
}

function restoreZombies(zombies: ZombieEntity[]) {
    return zombies.map((zombie) => Object.assign(createZombie({
        id: zombie.id,
        type: zombie.type,
        fromWave: zombie.fromWave,
        row: zombie.row,
        x: zombie.x,
        y: zombie.y,
        velocityX: zombie.velocityX,
        hasTongue: zombie.hasTongue,
        inPool: zombie.inPool,
    }), zombie))
}

function restoreProjectiles(projectiles: ProjectileEntity[]) {
    return projectiles.map((projectile) => Object.assign(createProjectile({
        id: projectile.id,
        type: projectile.type,
        row: projectile.row,
        x: projectile.x,
        y: projectile.y,
        shadowY: projectile.shadowY,
    }), projectile))
}

function restoreItems(session: GameSession, items: ItemEntity[]) {
    const context = (session as unknown as {
        _createItemUpdateContext(events: unknown[]): ItemUpdateContext
        events: unknown[]
    })._createItemUpdateContext(session.events)
    return items.map((item) => Object.assign(createItem({
        id: item.id,
        type: item.type,
        motion: item.motion,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        awardKind: item.awardKind,
        awardSeedType: item.awardSeedType,
    }, context), item))
}

function exportRuntimeState(session: GameSession) {
    const s = session as unknown as Record<string, unknown>
    return {
        _nextEntityId: s._nextEntityId,
        _adviceIndex: s._adviceIndex,
        _sunCountDown: s._sunCountDown,
        _numSunsFallen: s._numSunsFallen,
        _zombieHealthWaveStart: s._zombieHealthWaveStart,
        _zombieHealthToNextWave: s._zombieHealthToNextWave,
        _hugeWaveCountDown: s._hugeWaveCountDown,
        _finalWaveSoundCounter: s._finalWaveSoundCounter,
        _levelWonNotified: s._levelWonNotified,
        _levelAwardDropped: s._levelAwardDropped,
        _droppedFirstMoney: s._droppedFirstMoney,
        _zombiesWithDroppedLoot: [...(s._zombiesWithDroppedLoot as Set<number> ?? new Set<number>())],
        _levelOneTutorialPhase: s._levelOneTutorialPhase,
        _levelOneTutorialTimer: s._levelOneTutorialTimer,
        _levelOneClickOnSunAdviceShown: s._levelOneClickOnSunAdviceShown,
        _levelOneCantAffordAdviceShown: s._levelOneCantAffordAdviceShown,
        _levelTwoTutorialPhase: s._levelTwoTutorialPhase,
        _levelTwoTutorialTimer: s._levelTwoTutorialTimer,
        _levelTwoZombieWarningShown: s._levelTwoZombieWarningShown,
        _laterSunflowerTutorialPhase: s._laterSunflowerTutorialPhase,
        _laterSunflowerTutorialTimer: s._laterSunflowerTutorialTimer,
        _laterSunflowerTutorialShown: s._laterSunflowerTutorialShown,
        _bowlingLineAdviceShown: s._bowlingLineAdviceShown,
        _readySetPlantCounter: s._readySetPlantCounter,
        _nextConveyorPacketId: s._nextConveyorPacketId,
        _conveyorCounter: s._conveyorCounter,
        _lastConveyorSeedType: s._lastConveyorSeedType,
        _zombiesInWaves: s._zombiesInWaves,
        _waveRowGotLawnMowered: s._waveRowGotLawnMowered,
        _rowPickState: s._rowPickState,
    }
}

function importRuntimeState(session: GameSession, state: Record<string, unknown>) {
    Object.assign(session, state)
    session.events.length = 0
    session.paused = false
    const writableSession = session as unknown as { _zombiesWithDroppedLoot: Set<number> }
    writableSession._zombiesWithDroppedLoot = new Set(state._zombiesWithDroppedLoot as number[] ?? [])
}
