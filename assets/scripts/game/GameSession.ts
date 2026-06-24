import {
    ADVENTURE_1_1,
    DAY_GEOMETRY,
    GAME_TICK_SECONDS,
    PLANT_DEFINITIONS,
    SEED_DEFINITIONS,
    ZOMBIE_DEFINITIONS,
} from './GameDefinitions'
import { SoundEffect } from '@/core/SoundLoader'
import { createItem, Item } from './items/ItemFactory'
import { createPlant, Plant } from './plants/PlantFactory'
import { createProjectile, Projectile } from './projectiles/ProjectileFactory'
import { createZombie, Zombie } from './zombies/ZombieFactory'
import { GameDebugSettings } from './GameDebugSettings'
import type {
    GameCommand,
    ConveyorPacketState,
    GameEntity,
    GameEvent,
    ItemMotion,
    ItemType,
    GameResult,
    LawnMowerEntity,
    LevelAwardKind,
    LevelDefinition,
    LevelOneTutorialPhase,
    LevelTwoTutorialPhase,
    LaterSunflowerTutorialPhase,
    PlantEntity,
    PlantType,
    PlantingReason,
    Rect,
    SeedPacketState,
    SeedType,
    ToolType,
    ZombieType,
} from './GameTypes'

export interface GameSessionOptions {
    firstTimeAdventure?: boolean
    initialMoney?: number
}

const SUN_COUNTDOWN = 425
const SUN_COUNTDOWN_RANGE = 275
const SUN_COUNTDOWN_MAX = 950
const SKY_SUN_START_MIN = 425
const SKY_SUN_START_MAX = 700
const SKY_SUN_X_MIN = 100
const SKY_SUN_X_MAX = 649
const SKY_SUN_Y = 60
const ZOMBIE_COUNTDOWN_FIRST_WAVE = 1800
const ZOMBIE_COUNTDOWN = 2500
const ZOMBIE_COUNTDOWN_RANGE = 600
const ZOMBIE_COUNTDOWN_BEFORE_HUGE_WAVE = 750
const HUGE_WAVE_WARNING_COUNTDOWN = 5
const FINAL_WAVE_SOUND_DELAY = 60
const FLAG_RAISE_TIME = 100
const FLAG_WAVE_EXTRA_NORMAL_ZOMBIES = 4
const MONEY_DROP_ROLL_MAX = 29999
const DIAMOND_DROP_THRESHOLD = 14
const GOLD_DROP_THRESHOLD = 250
const SILVER_DROP_THRESHOLD = 2500
const MONEY_MIN = 0
const MONEY_MAX = 99999
const FIRST_ADVENTURE_MONEY_DROP_LEVEL = 11
const FIRST_ADVENTURE_FIRST_MONEY_WAVE = 5
const FIRST_ADVENTURE_FIRST_MONEY_ROLL = 1000
const LAWN_MOWER_READY_X = -21
const LAWN_MOWER_START_X = -160
const LAWN_MOWER_Y_OFFSET = 23
const LAWN_MOWER_ATTACK_WIDTH = 50
const LAWN_MOWER_ATTACK_HEIGHT = 80
const LAWN_MOWER_SPEED = 3.33
const LAWN_MOWER_CHOMP_READY_COUNTER = 25
const LAWN_MOWER_CHOMP_TRIGGERED_COUNTER = 50
const WAVE_ROW_GOT_LAWN_MOWERED_INITIAL = -100
const CHERRY_BOMB_RADIUS = 115
const CHERRY_BOMB_ROW_RANGE = 1
const SUN_MIN = 0
const SUN_MAX = 9990
const WIDE_BOARD_WIDTH = 800
const SHOOTER_ATTACK_OFFSET_X = 60
const BOARD_EDGE = -100
const HEADLESS_ZOMBIE_EDGE_OFFSET = 70
const HEADLESS_ZOMBIE_EDGE_DAMAGE = 1800
const PLANT_EATEN_FLASH_TICKS = 25
const PLANT_RECENTLY_EATEN_TICKS = 50
const BOWLING_VERTICAL_SPEED = 2
const BOWLING_HIT_DAMAGE = 1800
const BOWLING_HELM_DAMAGE = 900
const BOWLING_ANIM_RATE_MIN = 12
const BOWLING_ANIM_RATE_MAX = 18
const BOWLING_GROUND_X = [
    44.8, 27.6, 8.9, -11.3, -31.5, -50.2, -67.4,
    -84.6, -103.4, -123.6, -143.8, -162.5, -179.8,
]
const BOWLING_GROUND_FRAME_SPAN = BOWLING_GROUND_X.length - 1
const LEVEL_1_ADVICE_PICK_SEED = 'Click on a seed packet to pick it up!'
const LEVEL_1_ADVICE_PLANT_SEED = 'Click on the grass to plant your seed!'
const LEVEL_1_ADVICE_FIRST_PLANT_DONE = 'Nicely done!'
const LEVEL_1_ADVICE_COLLECT_FALLING_SUN = 'Click on the falling sun to collect it!'
const LEVEL_1_ADVICE_CLICKED_SUN = "Keep on collecting sun!\nYou'll need it to grow more plants!"
const LEVEL_1_ADVICE_ENOUGH_SUN = "Excellent! You've collected\nenough for your next plant!"
const LEVEL_1_ADVICE_PLANT_SECOND_PEASHOOTER = 'Click on the peashooter to plant another one!'
const LEVEL_1_ADVICE_ZOMBIES_CAN_START = "Don't let the zombies reach your house!"
const LEVEL_1_ADVICE_CANT_AFFORD = 'You need more sun to do that!'
const LEVEL_1_AFTER_FIRST_PLANT_SUN_DELAY = 400
const LEVEL_1_SECOND_SEED_PROMPT_DELAY = 400
const LEVEL_1_ZOMBIE_COUNTDOWN_AFTER_TUTORIAL = 200
const LEVEL_2_ADVICE_PLANT_SUNFLOWER_1 = 'Sunflowers are an extremely important plant!'
const LEVEL_2_ADVICE_PLANT_SUNFLOWER_2 = 'Try to plant at least 3 of them!'
const LEVEL_2_ADVICE_PLANT_SUNFLOWER_3 = 'Planting at least 3 sunflowers improves your\nchances of surviving a zombie attack!'
const LEVEL_2_ADVICE_MORE_SUNFLOWERS = 'The more sunflowers you have,\nthe faster you can grow plants!'
const LATER_ADVICE_PLANT_SUNFLOWER = 'Try to plant at least 3 sunflowers!'
const LATER_ADVICE_SUNFLOWERS_DONE = 'Planting sunflowers will improve your chances \nof surviving the zombie attack!'
const LEVEL_2_FIRST_ADVICE_DELAY = 500
const LEVEL_2_ZOMBIE_COUNTDOWN_FIRST_WAVE = ZOMBIE_COUNTDOWN * 2
const LEVEL_2_COMPLETED_ZOMBIE_COUNTDOWN = 999
const LEVEL_2_ZOMBIE_WARNING_COUNTDOWN = 750
const LATER_SUNFLOWER_ADVICE_DELAY = 500
const LATER_SUNFLOWER_START_WAVE = 5
const BOWLING_LINE_ADVICE = 'Place your wall-nut to the left of the bowling line'
const READY_SET_PLANT_TICKS = 183
const CONVEYOR_PACKET_SPEED = 0.25
const CONVEYOR_ENTRY_X = 606

interface RowPickState {
    row: number
    weight: number
    lastPicked: number
    secondLastPicked: number
}

function clampMoney(amount: number) {
    return Math.max(MONEY_MIN, Math.min(MONEY_MAX, Math.floor(amount)))
}

export class GameSession {
    readonly level: LevelDefinition
    readonly geometry = DAY_GEOMETRY
    readonly seedPackets: SeedPacketState[]
    readonly conveyorPackets: ConveyorPacketState[] = []
    readonly plants: Plant[] = []
    readonly zombies: Zombie[] = []
    readonly projectiles: Projectile[] = []
    readonly items: Item[] = []
    readonly lawnMowers: LawnMowerEntity[] = []
    readonly events: GameEvent[] = []

    tick = 0
    sun = 0
    money = 0
    result: GameResult = 'playing'
    currentWave = 0
    flagRaiseCounter = 0
    zombieCountDown = ZOMBIE_COUNTDOWN_FIRST_WAVE
    zombieCountDownStart = ZOMBIE_COUNTDOWN_FIRST_WAVE
    progressMeterWidth = 0
    selectedSeed: SeedType | null = null
    selectedConveyorPacketId: number | null = null
    selectedTool: ToolType | null = null
    paused = false
    hasPlantedAtLeastOnce = false
    rechargingEnabled = true
    sunCostEnabled = true
    sunSpawningEnabled = true
    autoCollectEnabled = false

    private readonly _firstTimeAdventure: boolean
    private _nextEntityId = 1
    private _adviceIndex = 0
    private _sunCountDown = 0
    private _numSunsFallen = 0
    private _zombieHealthWaveStart = 0
    private _zombieHealthToNextWave = -1
    private _hugeWaveCountDown = 0
    private _finalWaveSoundCounter = 0
    private _levelWonNotified = false
    private _levelAwardDropped = false
    private _droppedFirstMoney = false
    private _zombiesWithDroppedLoot: Set<number> = new Set()
    private _levelOneTutorialPhase: LevelOneTutorialPhase = 'done'
    private _levelOneTutorialTimer = 0
    private _levelOneClickOnSunAdviceShown = false
    private _levelOneCantAffordAdviceShown = false
    private _levelTwoTutorialPhase: LevelTwoTutorialPhase = 'off'
    private _levelTwoTutorialTimer = -1
    private _levelTwoZombieWarningShown = false
    private _laterSunflowerTutorialPhase: LaterSunflowerTutorialPhase = 'off'
    private _laterSunflowerTutorialTimer = -1
    private _laterSunflowerTutorialShown = false
    private _bowlingLineAdviceShown = false
    private _readySetPlantCounter = 0
    private _nextConveyorPacketId = 1
    private _conveyorCounter = 0
    private _waveRowGotLawnMowered = Array.from({ length: DAY_GEOMETRY.rows }, () => WAVE_ROW_GOT_LAWN_MOWERED_INITIAL)
    private _rowPickState: RowPickState[] = Array.from({ length: DAY_GEOMETRY.rows }, (_, row) => ({
        row,
        weight: 0,
        lastPicked: 0,
        secondLastPicked: 0,
    }))

    constructor(level: LevelDefinition = ADVENTURE_1_1, options: GameSessionOptions = {}) {
        this.level = level
        this._firstTimeAdventure = options.firstTimeAdventure ?? true
        this.rechargingEnabled = GameDebugSettings.rechargingEnabled
        this.sunCostEnabled = GameDebugSettings.sunCostEnabled
        this.autoCollectEnabled = GameDebugSettings.autoCollectEnabled
        if (level.skySunSpawning === false) this.sunSpawningEnabled = false
        this.sun = level.startingSun
        this.money = clampMoney(options.initialMoney ?? 0)
        this.seedPackets = level.seedPackets.map((seedType) => {
            const cooldownTotal = this._initialSeedPacketCooldown(seedType)
            return {
                seedType,
                cooldownRemaining: cooldownTotal,
                cooldownTotal,
                active: cooldownTotal <= 0,
                selected: false,
            }
        })
        this._initConveyor()
        if (level.background === 'day') {
            this._sunCountDown = this._randomInt(SKY_SUN_START_MIN, SKY_SUN_START_MAX)
        }
        if (level.adventureLevel === 1) {
            this._levelOneTutorialPhase = 'pick-first-seed'
        } else if (level.adventureLevel === 2) {
            this._levelTwoTutorialPhase = 'pick-sunflower'
            this._levelTwoTutorialTimer = LEVEL_2_FIRST_ADVICE_DELAY
            this.zombieCountDown = LEVEL_2_ZOMBIE_COUNTDOWN_FIRST_WAVE
            this.zombieCountDownStart = this.zombieCountDown
        } else if (level.adventureLevel >= 3 && !level.suppressReadySetPlant) {
            this._readySetPlantCounter = READY_SET_PLANT_TICKS
            this._setSeedPacketsActive(false)
        }
        if (level.challengeMode === 'wallnut-bowling') {
            this.zombieCountDown = 200
            this.zombieCountDownStart = this.zombieCountDown
        }
        this._initInitialPlants()
        this._initLawnMowers()
        this._pushAdvice()
        if (level.adventureLevel === 2) {
            this._pushLevelTwoTutorialAdvice(LEVEL_2_ADVICE_PLANT_SUNFLOWER_1)
        }
    }

    allEntities(): GameEntity[] {
        return [...this.plants, ...this.zombies, ...this.projectiles, ...this.lawnMowers, ...this.items]
    }

    countZombiesOnScreenForMusic() {
        let count = 0
        for (const zombie of this.zombies) {
            if (!this._isZombieDamageable(zombie)) continue
            const rect = zombie.getBodyRect()
            if (rect.x < this.geometry.width && rect.x + rect.width > 0) count++
        }
        return count
    }

    drainEvents(): GameEvent[] {
        return this.events.splice(0)
    }

    completeReadySetPlantIntro() {
        if (this._readySetPlantCounter <= 0) return

        this._readySetPlantCounter = 0
        this._setSeedPacketsActive(true)
    }

    dispatch(command: GameCommand) {
        if (command.type === 'pause') {
            this.paused = true
            return
        }
        if (command.type === 'resume') {
            this.paused = false
            return
        }
        if (this.result !== 'playing' && command.type !== 'clearCursor') return
        if (this.paused && command.type !== 'clearCursor') return

        switch (command.type) {
            case 'selectSeed':
                this._selectSeed(command.seedType)
                break
            case 'selectConveyorPacket':
                this._selectConveyorPacket(command.packetId)
                break
            case 'selectTool':
                this._selectTool(command.toolType)
                break
            case 'placePlant':
                this._placeSelectedSeed(command.x, command.y)
                break
            case 'useToolAt':
                this._useSelectedTool(command.x, command.y)
                break
            case 'collectItemAt':
                this.collectItemAt(command.x, command.y)
                break
            case 'clearCursor':
                this._refreshSeedPacketFromCursor()
                break
        }
    }

    update() {
        if (this.paused || this.result === 'lost') return

        this.tick++
        this._updateReadySetPlant()
        this._updateConveyor()
        this._updateSeedPackets()
        this._updateLevelOneTutorial()
        this._updateLevelTwoTutorial()
        if (
            this.result === 'playing' &&
            this.sunSpawningEnabled &&
            !this._isLevelOneTutorialBlockingSun() &&
            !this._isReadySetPlantBlockingGameplay()
        ) {
            this._updateSunSpawning()
        }
        if (
            this.result === 'playing' &&
            !this._isLevelOneTutorialBlockingZombies() &&
            !this._isReadySetPlantBlockingGameplay()
        ) {
            this._updateZombieSpawning()
        }
        this._updateLaterSunflowerTutorial()
        this._updatePlants()
        this._updateZombies()
        if (this.result === 'lost') return
        this._updateProjectiles()
        this._updateLawnMowers()
        this._updateItems()
        this._updateProgressMeter()
        this._removeDeadEntities()
        this._checkLevelCompletion()
    }

    collectItemAt(x: number, y: number) {
        const item = this._findItemAt(x, y)
        if (!item) return false

        const isMoney = this._isMoneyItem(item)
        const collected = item.collect(this._createItemUpdateContext(this.events))
        if (collected) this._handleLevelOneTutorialSunClicked(item)
        if (collected && isMoney) this.events.push({ type: 'coinBankShown' })
        return collected
    }

    collectCurrencyItemAt(x: number, y: number) {
        const item = this._findItemAt(x, y)
        if (!item || (!this._isSunItem(item) && !this._isMoneyItem(item))) return false

        const isMoney = this._isMoneyItem(item)
        const collected = item.collect(this._createItemUpdateContext(this.events))
        if (collected && this._isSunItem(item)) this._handleLevelOneTutorialSunClicked(item)
        if (collected && isMoney) this.events.push({ type: 'coinBankShown' })
        return collected
    }

    hasItemAt(x: number, y: number) {
        return this._findItemAt(x, y) !== null
    }

    hasPlantAt(x: number, y: number) {
        return this._findPlantAt(x, y) !== null
    }

    debugAddPlant(type: PlantType, row: number, col: number) {
        const plant = this._createPlant(type, row, col)
        const isFirstPlant = !this.hasPlantedAtLeastOnce
        this.plants.push(plant)
        this.hasPlantedAtLeastOnce = true
        this.events.push({ type: 'entitySpawned', entityId: plant.id })
        this.events.push({ type: 'foleyRequested', sound: SoundEffect.Plant })
        this._handleLevelOneTutorialPlantPlaced(plant, isFirstPlant)
        this._handleLevelTwoTutorialPlantPlaced(plant)
        this._handleLaterSunflowerTutorialPlantPlaced(plant)
        if (plant.type === 'cherrybomb') {
            this.events.push({ type: 'soundRequested', sound: SoundEffect.ReverseExplosion })
        }
        return plant
    }

    debugRemovePlant(row: number, col: number) {
        const plant = this._findPlantAtGrid(row, col)
        if (!plant) return false

        plant.dead = true
        this.events.push({ type: 'foleyRequested', sound: SoundEffect.Plant2 })
        this._removeDeadEntities()
        return true
    }

    debugCompleteLevel() {
        this._completeLevel()
        return this.result === 'won'
    }

    debugLoseLevel() {
        if (this.result !== 'playing') return false

        this._zombiesWon(null)
        return this.result === 'lost'
    }

    debugSpawnNextWave() {
        if (this.currentWave >= this.numWaves) return false

        this._spawnCurrentZombieWaveNow(true)
        return true
    }

    debugSpawnNextFlagWave() {
        for (let waveIndex = this.currentWave; waveIndex < this.numWaves; waveIndex++) {
            if (!this._isFlagWave(waveIndex)) continue

            this.currentWave = waveIndex
            this._spawnCurrentZombieWaveNow(true)
            return true
        }
        return false
    }

    debugDamageAllZombies(damage: number) {
        let damaged = 0
        for (const zombie of this.zombies) {
            if (!this._isZombieDamageable(zombie)) continue

            const wasDying = zombie.state === 'dying'
            zombie.takeDamage(damage, {
                zombieCount: this._countLiveZombies(),
                canUseSuperLongDeath: this._canUseSuperLongDeath(),
            })
            if (!wasDying && zombie.state === 'dying') this._dropZombieLoot(zombie)
            damaged++
        }
        return damaged
    }

    debugKillAllZombies() {
        let killed = 0
        for (const zombie of this.zombies) {
            if (zombie.dead) continue

            zombie.dead = true
            killed++
        }
        if (killed > 0) {
            this._removeDeadEntities()
            this._checkLevelCompletion()
        }
        return killed
    }

    canAffordSeed(seedType: SeedType) {
        return this._canSpendSun(SEED_DEFINITIONS[seedType].cost)
    }

    addZombie(type: ZombieType, row: number, x?: number, fromWave = -1) {
        if (!this.level.activeRows.includes(row)) return null
        return this._addZombieUnchecked(type, row, x, fromWave)
    }

    debugAddZombie(type: ZombieType, row: number, x?: number) {
        return this._addZombieUnchecked(type, row, x)
    }

    debugAddZombieAutoRow(type: ZombieType) {
        return this._addZombieUnchecked(type, this._pickRowForNewZombie(type))
    }

    debugSetLawnMower(row: number, status: 'trigger' | 'reset') {
        return status === 'trigger'
            ? this._debugTriggerLawnMower(row)
            : this._debugResetLawnMower(row)
    }

    debugSetAllLawnMowers(status: 'trigger' | 'reset') {
        let changed = 0
        for (const row of this.level.activeRows) {
            if (this.debugSetLawnMower(row, status)) changed++
        }
        return changed
    }

    debugAddSun(amount: number) {
        this._addSun(amount)
        return this.sun
    }

    debugSetSun(amount: number) {
        this._setSun(amount)
        return this.sun
    }

    debugAddMoney(amount: number) {
        this._addMoney(amount)
        return this.money
    }

    debugSetMoney(amount: number) {
        this._setMoney(amount)
        return this.money
    }

    debugAddItem(type: ItemType, x: number, y: number, awardKind?: LevelAwardKind) {
        const resolvedAwardKind = awardKind ?? this._levelAwardKindForLevel() ?? 'seed'
        const awardSeedType = type === 'final-seed-packet'
            ? this.level.awardSeedType ?? null
            : null
        return this._addItem(type, 'coin', x, y, awardSeedType, resolvedAwardKind)
    }

    debugSetRechargingEnabled(enabled: boolean) {
        this.rechargingEnabled = enabled
        if (!enabled) this._clearSeedPacketCooldowns()
        return this.rechargingEnabled
    }

    debugSetSunCostEnabled(enabled: boolean) {
        this.sunCostEnabled = enabled
        return this.sunCostEnabled
    }

    debugSetSunSpawningEnabled(enabled: boolean) {
        this.sunSpawningEnabled = enabled
        return this.sunSpawningEnabled
    }

    debugSetAutoCollectEnabled(enabled: boolean) {
        this.autoCollectEnabled = enabled
        if (enabled) this._autoCollectAvailableItems()
        return this.autoCollectEnabled
    }

    debugGetPlantBodyRect(plant: PlantEntity): Rect {
        return this._plantRect(plant)
    }

    debugGetLawnMowerAttackRect(mower: LawnMowerEntity): Rect {
        return this._lawnMowerAttackRect(mower)
    }

    private _addZombieUnchecked(type: ZombieType, row: number, x?: number, fromWave = -1) {
        const definition = ZOMBIE_DEFINITIONS[type]
        const zombie = createZombie({
            id: this._allocateId(),
            type,
            fromWave,
            row,
            x,
            y: this.geometry.gridToPixel(0, row).y - 30,
            velocityX: definition.velocityXMin + this._randomFloat(0, definition.velocityXMax - definition.velocityXMin),
            hasTongue: this._zombieCanHaveTongue(type) && this._randomInt(0, 4) === 0,
        })
        this.zombies.push(zombie)
        this.events.push({ type: 'entitySpawned', entityId: zombie.id })
        return zombie
    }

    get numWaves() {
        return this.level.zombieWaves.length
    }

    get hasLevelAwardDropped() {
        return this._levelAwardDropped
    }

    getPlantAt(x: number, y: number) {
        return this._findPlantAt(x, y)
    }

    get levelOneTutorialPhase() {
        return this._levelOneTutorialPhase
    }

    shouldShowTutorialSeedGuide(seedType: SeedType) {
        const packet = this.seedPackets.find((item) => item.seedType === seedType)
        const canFlashPacket = !this.selectedSeed &&
            !!packet &&
            packet.active &&
            packet.cooldownRemaining <= 0 &&
            this.canAffordSeed(seedType)
        return (this.level.adventureLevel === 1 &&
            seedType === 'peashooter' &&
            canFlashPacket &&
            (this._levelOneTutorialPhase === 'pick-first-seed' ||
                this._levelOneTutorialPhase === 'pick-second-seed')) ||
            (this.level.adventureLevel === 2 &&
                seedType === 'sunflower' &&
                canFlashPacket &&
                this._levelTwoTutorialPhase === 'pick-sunflower') ||
            (this._canRunLaterSunflowerTutorial() &&
                seedType === 'sunflower' &&
                canFlashPacket &&
                this._laterSunflowerTutorialPhase === 'pick-sunflower')
    }

    shouldShowTutorialLawnGuide() {
        return this.level.adventureLevel === 1 &&
            this.selectedSeed === 'peashooter' &&
            (this._levelOneTutorialPhase === 'plant-first-seed' ||
                this._levelOneTutorialPhase === 'plant-second-seed')
    }

    canPlant(seedType: SeedType, col: number, row: number) {
        return this.getPlantingReason(seedType, col, row) === 'ok'
    }

    getPlantingReason(seedType: SeedType, col: number, row: number): PlantingReason {
        const seed = SEED_DEFINITIONS[seedType]
        if (this._isWallnutBowlingConveyorSeed(seedType)) {
            if (!seed || !this._selectedConveyorPacket()) return 'not-here'
            if (!this.level.activeRows.includes(row)) return 'not-here'
            if (col < 0 || col >= this.geometry.cols) return 'not-here'
            if (col > (this.level.bowling?.lineColMax ?? 2)) return 'not-here'
            return 'ok'
        }

        const packet = this.seedPackets.find((item) => item.seedType === seedType)
        if (!seed || !packet) return 'not-here'
        if (packet.cooldownRemaining > 0 || (!packet.active && this.selectedSeed !== seedType)) {
            return 'waiting-for-seed'
        }
        if (!this._canSpendSun(seed.cost)) return 'not-enough-sun'
        if (!this.level.activeRows.includes(row)) return 'not-here'
        if (col < 0 || col >= this.geometry.cols) return 'not-here'
        return this.plants.some((plant) => !plant.dead && plant.col === col && plant.row === row)
            ? 'not-here'
            : 'ok'
    }

    private _selectSeed(seedType: SeedType) {
        const packet = this.seedPackets.find((item) => item.seedType === seedType)
        if (!packet) return
        if (packet.cooldownRemaining > 0 || !packet.active) {
            this.events.push({ type: 'soundRequested', sound: SoundEffect.Buzzer })
            return
        }
        if (!this._canSpendSun(SEED_DEFINITIONS[seedType].cost)) {
            this._pushNotEnoughSunFeedback()
            return
        }

        this._clearCursor()
        this.selectedSeed = seedType
        packet.active = false
        for (const item of this.seedPackets) {
            item.selected = item.seedType === this.selectedSeed
        }
        this.events.push({ type: 'soundRequested', sound: SoundEffect.SeedLift })
        this._handleLevelOneTutorialSeedSelected(seedType)
        this._handleLevelTwoTutorialSeedSelected(seedType)
        this._handleLaterSunflowerTutorialSeedSelected(seedType)
    }

    private _selectConveyorPacket(packetId: number) {
        const packet = this.conveyorPackets.find((item) => item.id === packetId)
        if (!packet || !packet.active || packet.selected) return
        if (!this._isWallnutBowlingConveyorSeed(packet.seedType)) return

        this._clearCursor()
        this.selectedSeed = packet.seedType
        this.selectedConveyorPacketId = packet.id
        packet.active = false
        packet.selected = true
        this.events.push({ type: 'soundRequested', sound: SoundEffect.SeedLift })
        this._retargetConveyorPackets()
    }

    private _selectTool(toolType: ToolType) {
        this._refreshSeedPacketFromCursor()
        this.selectedTool = toolType
        this.events.push({ type: 'foleyRequested', sound: SoundEffect.Shovel, pitchRange: 5 })
    }

    private _placeSelectedSeed(x: number, y: number) {
        if (!this.selectedSeed) return
        const seedType = this.selectedSeed
        const grid = this.geometry.plantingPixelToGrid(x, y, seedType)
        if (!grid) {
            this._refreshSeedPacketFromCursor()
            this.events.push({ type: 'soundRequested', sound: SoundEffect.Drop })
            return
        }

        const reason = this.getPlantingReason(seedType, grid.col, grid.row)
        if (reason !== 'ok') {
            if (this._isWallnutBowlingConveyorSeed(seedType) &&
                grid.col > (this.level.bowling?.lineColMax ?? 2) &&
                !this._bowlingLineAdviceShown) {
                this._bowlingLineAdviceShown = true
                this.events.push({ type: 'advice', message: BOWLING_LINE_ADVICE, style: 'hint' })
            } else if (reason === 'not-enough-sun') {
                this._pushNotEnoughSunFeedback()
            } else if (reason === 'waiting-for-seed') {
                this.events.push({ type: 'soundRequested', sound: SoundEffect.Buzzer })
            }
            return
        }

        if (this._isWallnutBowlingConveyorSeed(seedType)) {
            this._placeSelectedConveyorSeed(seedType, grid.row, grid.col)
            return
        }

        const seed = SEED_DEFINITIONS[seedType]
        const plant = this._createPlant(seed.plantType, grid.row, grid.col)
        const isFirstPlant = !this.hasPlantedAtLeastOnce
        this.plants.push(plant)
        this.hasPlantedAtLeastOnce = true
        if (this.sunCostEnabled) {
            this.sun = Math.max(SUN_MIN, this.sun - seed.cost)
        }

        const packet = this.seedPackets.find((item) => item.seedType === seedType)
        if (packet) {
            packet.cooldownTotal = this.rechargingEnabled ? seed.cooldownTicks : 0
            packet.cooldownRemaining = packet.cooldownTotal
        }
        this._clearCursor()
        if (packet && !this.rechargingEnabled) packet.active = true
        this.events.push({ type: 'entitySpawned', entityId: plant.id })
        this.events.push({ type: 'foleyRequested', sound: SoundEffect.Plant })
        this._handleLevelOneTutorialPlantPlaced(plant, isFirstPlant)
        this._handleLevelTwoTutorialPlantPlaced(plant)
        this._handleLaterSunflowerTutorialPlantPlaced(plant)
        if (plant.type === 'cherrybomb') {
            this.events.push({ type: 'soundRequested', sound: SoundEffect.ReverseExplosion })
        }
    }

    private _placeSelectedConveyorSeed(seedType: SeedType, row: number, col: number) {
        const packet = this._selectedConveyorPacket()
        if (!packet || packet.seedType !== seedType) return

        const seed = SEED_DEFINITIONS[seedType]
        const plant = this._createPlant(seed.plantType, row, col)
        plant.isBowling = true
        plant.bowlingAnimRate = this._randomFloat(BOWLING_ANIM_RATE_MIN, BOWLING_ANIM_RATE_MAX)
        plant.bowlingAnimationTime = 0
        plant.bowlingHitCount = 0
        const index = this.conveyorPackets.findIndex((item) => item.id === packet.id)
        if (index >= 0) this.conveyorPackets.splice(index, 1)
        this.selectedConveyorPacketId = null
        this.plants.push(plant)
        this.hasPlantedAtLeastOnce = true
        this._clearCursor()
        this._retargetConveyorPackets()
        this.events.push({ type: 'entitySpawned', entityId: plant.id })
        this.events.push({ type: 'soundRequested', sound: SoundEffect.Bowling })
        this.events.push({ type: 'foleyRequested', sound: SoundEffect.Plant })
    }

    private _createPlant(type: PlantType, row: number, col: number) {
        const pixel = this.geometry.gridToPixel(col, row)
        return createPlant({
            id: this._allocateId(),
            type,
            col,
            row,
            x: pixel.x,
            y: pixel.y,
        })
    }

    private _initInitialPlants() {
        for (const plant of this.level.initialPlants ?? []) {
            if (!this.level.activeRows.includes(plant.row)) continue
            if (plant.col < 0 || plant.col >= this.geometry.cols) continue
            if (this.plants.some((item) => !item.dead && item.row === plant.row && item.col === plant.col)) continue
            this.plants.push(this._createPlant(plant.type, plant.row, plant.col))
        }
        if (this.plants.length > 0) this.hasPlantedAtLeastOnce = true
    }

    private _clearCursor() {
        const conveyorPacket = this._selectedConveyorPacket()
        if (conveyorPacket) {
            conveyorPacket.selected = false
            conveyorPacket.active = true
            this.selectedConveyorPacketId = null
            this._retargetConveyorPackets()
        }
        this.selectedSeed = null
        this.selectedTool = null
        for (const item of this.seedPackets) item.selected = false
    }

    private _useSelectedTool(x: number, y: number) {
        if (this.selectedTool !== 'shovel') return

        const plant = this._findPlantAt(x, y)
        if (!plant) {
            this._clearCursor()
            this.events.push({ type: 'soundRequested', sound: SoundEffect.Drop })
            return
        }

        plant.dead = true
        this.events.push({ type: 'foleyRequested', sound: SoundEffect.Plant2 })
        this._clearCursor()
        this._removeDeadEntities()
    }

    private _refreshSeedPacketFromCursor() {
        if (this.selectedConveyorPacketId !== null) {
            this._clearCursor()
            return
        }

        const selectedSeed = this.selectedSeed
        this._clearCursor()
        if (!selectedSeed) return

        const packet = this.seedPackets.find((item) => item.seedType === selectedSeed)
        if (packet && packet.cooldownRemaining <= 0) packet.active = true
        this._handleLevelOneTutorialSeedCanceled(selectedSeed)
        this._handleLevelTwoTutorialSeedCanceled(selectedSeed)
        this._handleLaterSunflowerTutorialSeedCanceled(selectedSeed)
    }

    private _initConveyor() {
        const conveyor = this.level.conveyor
        if (!conveyor?.enabled) return

        this._conveyorCounter = conveyor.initialDelayTicks
        const seedType = this._pickConveyorSeed()
        if (seedType) this._addConveyorPacket(seedType)
    }

    private _updateConveyor() {
        const conveyor = this.level.conveyor
        if (!conveyor?.enabled || this._levelAwardDropped) return

        this._moveConveyorPackets()
        if (this._isReadySetPlantBlockingPackets()) return

        this._conveyorCounter--
        if (this._conveyorCounter > 0) return

        if (this._activeConveyorPacketCount() < conveyor.maxPackets) {
            const seedType = this._pickConveyorSeed()
            if (seedType) this._addConveyorPacket(seedType)
        }
        this._conveyorCounter = this._nextConveyorDelay()
    }

    private _addConveyorPacket(seedType: SeedType) {
        const packet: ConveyorPacketState = {
            id: this._nextConveyorPacketId++,
            seedType,
            x: CONVEYOR_ENTRY_X,
            targetX: CONVEYOR_ENTRY_X,
            active: true,
            selected: false,
            entering: true,
        }
        this.conveyorPackets.push(packet)
        this._retargetConveyorPackets()
    }

    private _moveConveyorPackets() {
        for (const packet of this.conveyorPackets) {
            const delta = packet.targetX - packet.x
            if (Math.abs(delta) <= CONVEYOR_PACKET_SPEED) {
                packet.x = packet.targetX
                packet.entering = false
            } else {
                packet.x += Math.sign(delta) * CONVEYOR_PACKET_SPEED
            }
        }
    }

    private _retargetConveyorPackets() {
        let index = 0
        for (const packet of this.conveyorPackets) {
            packet.targetX = this._conveyorPacketSlotX(index)
            index++
        }
    }

    private _conveyorPacketSlotX(index: number) {
        return index * 50 + 91
    }

    private _nextConveyorDelay() {
        const count = this._activeConveyorPacketCount()
        if (count > 8) return 1000
        if (count > 6) return 500
        if (count > 4) return 425
        return 400
    }

    private _activeConveyorPacketCount() {
        return this.conveyorPackets.length
    }

    private _pickConveyorSeed(): SeedType | null {
        const seedPool = this.level.conveyor?.seedPool ?? []
        let totalWeight = 0
        for (const entry of seedPool) {
            if (!SEED_DEFINITIONS[entry.seedType] || entry.weight <= 0) continue
            totalWeight += entry.weight
        }
        if (totalWeight <= 0) return null

        let roll = this._randomInt(1, totalWeight)
        let fallback: SeedType | null = null
        for (const entry of seedPool) {
            if (!SEED_DEFINITIONS[entry.seedType] || entry.weight <= 0) continue
            fallback = entry.seedType
            roll -= entry.weight
            if (roll <= 0) return entry.seedType
        }
        return fallback
    }

    private _selectedConveyorPacket() {
        const packetId = this.selectedConveyorPacketId
        if (packetId === null) return null
        return this.conveyorPackets.find((packet) => packet.id === packetId) ?? null
    }

    private _isWallnutBowlingConveyorSeed(seedType: SeedType) {
        return this.level.challengeMode === 'wallnut-bowling' &&
            this.level.conveyor?.enabled === true &&
            seedType === 'wallnut'
    }

    private _updateSeedPackets() {
        if (this._isReadySetPlantBlockingPackets()) return

        if (!this.rechargingEnabled) {
            this._clearSeedPacketCooldowns()
            return
        }

        for (const packet of this.seedPackets) {
            const wasReady = packet.cooldownRemaining <= 0 && packet.active
            if (packet.cooldownRemaining > 0) packet.cooldownRemaining--
            if (packet.cooldownRemaining <= 0) {
                packet.cooldownTotal = 0
                if (!packet.selected) packet.active = true
            }
            if (!wasReady && packet.active && packet.cooldownRemaining <= 0) {
                this._handleLevelTwoTutorialSeedPacketReady(packet.seedType)
                this._handleLaterSunflowerTutorialSeedPacketReady(packet.seedType)
            }
        }
    }

    private _clearSeedPacketCooldowns() {
        if (this._isReadySetPlantBlockingPackets()) return

        for (const packet of this.seedPackets) {
            const wasReady = packet.cooldownRemaining <= 0 && packet.active
            packet.cooldownRemaining = 0
            packet.cooldownTotal = 0
            if (!packet.selected) packet.active = true
            if (!wasReady && packet.active) {
                this._handleLevelTwoTutorialSeedPacketReady(packet.seedType)
                this._handleLaterSunflowerTutorialSeedPacketReady(packet.seedType)
            }
        }
    }

    private _initialSeedPacketCooldown(seedType: SeedType) {
        if (!this.rechargingEnabled) return 0

        const cooldownTicks = SEED_DEFINITIONS[seedType].cooldownTicks
        if (cooldownTicks === 5000) return 3500
        if (cooldownTicks === 3000) return 2000
        return 0
    }

    private _updatePlants() {
        const plantEvents: GameEvent[] = []
        const context = {
            events: plantEvents,
            hasTargetInRow: (row: number, plant: Plant) => this._hasTargetInRow(row, plant),
            hasTargetInPlantAttackRect: (plant: Plant) => this._hasTargetInPlantAttackRect(plant),
            canProduceSun: () => !this._levelAwardDropped && this.result === 'playing',
            randomInt: (minInclusive: number, maxInclusive: number) =>
                this._randomInt(minInclusive, maxInclusive),
        }
        for (const plant of this.plants) {
            if (plant.isBowling) {
                this._updateBowlingPlant(plant)
                continue
            }
            plant.update(context)
        }
        this._handlePlantEvents(plantEvents)
    }

    private _updateBowlingPlant(plant: Plant) {
        if (plant.dead) return

        this._advanceBowlingPlant(plant)
        if (plant.x > this.geometry.width) {
            plant.dead = true
            return
        }

        if (plant.state === 'bowling-up') {
            plant.y -= BOWLING_VERTICAL_SPEED
        } else if (plant.state === 'bowling-down') {
            plant.y += BOWLING_VERTICAL_SPEED
        }

        const rowY = this.geometry.gridToPixel(0, plant.row).y
        if (Math.abs(rowY - plant.y) > BOWLING_VERTICAL_SPEED) return

        let nextDirection = plant.state
        if (plant.state === 'bowling-up' && plant.row <= 0) {
            nextDirection = 'bowling-down'
        } else if (plant.state === 'bowling-down' && plant.row >= this.geometry.rows - 1) {
            nextDirection = 'bowling-up'
        }

        const zombie = this._findBowlingCollisionTarget(plant)
        if (zombie) {
            this._hitZombieWithBowlingPlant(plant, zombie)
            if (plant.row >= this.geometry.rows - 1 || plant.state === 'bowling-down') {
                nextDirection = 'bowling-up'
            } else if (plant.row <= 0 || plant.state === 'bowling-up') {
                nextDirection = 'bowling-down'
            } else {
                nextDirection = this._randomInt(0, 1) === 0 ? 'bowling-up' : 'bowling-down'
            }
        }

        if (nextDirection === 'bowling-up') {
            plant.row--
            plant.state = 'bowling-up'
        } else if (nextDirection === 'bowling-down') {
            plant.row++
            plant.state = 'bowling-down'
        }
    }

    private _advanceBowlingPlant(plant: Plant) {
        const previousTime = plant.bowlingAnimationTime
        const frameAdvance = plant.bowlingAnimRate * GAME_TICK_SECONDS
        let nextTime = previousTime + frameAdvance
        const previousX = this._sampleBowlingGroundX(previousTime)
        let groundDistance = 0

        if (nextTime < BOWLING_GROUND_FRAME_SPAN) {
            groundDistance = this._sampleBowlingGroundX(nextTime) - previousX
        } else {
            groundDistance = BOWLING_GROUND_X[BOWLING_GROUND_X.length - 1] - previousX
            nextTime -= BOWLING_GROUND_FRAME_SPAN
            while (nextTime >= BOWLING_GROUND_FRAME_SPAN) {
                groundDistance += BOWLING_GROUND_X[BOWLING_GROUND_X.length - 1] - BOWLING_GROUND_X[0]
                nextTime -= BOWLING_GROUND_FRAME_SPAN
            }
            groundDistance += this._sampleBowlingGroundX(nextTime) - BOWLING_GROUND_X[0]
        }

        plant.x -= groundDistance
        plant.bowlingAnimationTime = nextTime
    }

    private _sampleBowlingGroundX(time: number) {
        const leftIndex = Math.max(0, Math.min(BOWLING_GROUND_X.length - 1, Math.floor(time)))
        const rightIndex = Math.min(BOWLING_GROUND_X.length - 1, leftIndex + 1)
        const t = time - leftIndex
        return BOWLING_GROUND_X[leftIndex] +
            (BOWLING_GROUND_X[rightIndex] - BOWLING_GROUND_X[leftIndex]) * t
    }

    private _findBowlingCollisionTarget(plant: Plant) {
        const attackRect: Rect = {
            x: plant.x,
            y: plant.y,
            width: 60,
            height: 80,
        }
        let target: Zombie | null = null
        for (const zombie of this.zombies) {
            if (zombie.row !== plant.row || !this._isZombieDamageable(zombie)) continue
            if (this._rectOverlap(attackRect, zombie.getBodyRect()) <= 0) continue
            if (!target || zombie.x < target.x) target = zombie
        }
        return target
    }

    private _hitZombieWithBowlingPlant(plant: Plant, zombie: Zombie) {
        this.events.push({ type: 'foleyRequested', sound: SoundEffect.BowlingImpact })
        this.events.push({ type: 'boardShake', amountX: 1, amountY: -2 })

        const deathContext = {
            zombieCount: this._countLiveZombies(),
            canUseSuperLongDeath: this._canUseSuperLongDeath(),
        }
        if (zombie.helmHealth > 0) {
            this.events.push({
                type: 'foleyRequested',
                sound: zombie.helmType === 'bucket' ? SoundEffect.ShieldHit : SoundEffect.PlasticHit,
            })
            zombie.takeHelmDamage(BOWLING_HELM_DAMAGE)
        } else {
            const damageResult = zombie.takeBodyDamage(BOWLING_HIT_DAMAGE, deathContext)
            if (damageResult.droppedHead || damageResult.startedDying) this._dropZombieLoot(zombie)
            if (this._levelAwardDropped) zombie.finishAfterLevelAwardDropped(deathContext)
        }
        plant.bowlingHitCount++
    }

    private _handlePlantEvents(events: GameEvent[]) {
        for (const event of events) {
            if (event.type === 'sunProduced') {
                if (this._levelAwardDropped || this.result !== 'playing') continue
                this._addItem('sun', 'from-plant', event.x, event.y)
            } else if (event.type === 'projectileFired') {
                this._addProjectile(event.projectileType, event.x, event.y, event.row)
                this.events.push(event)
            } else if (event.type === 'cherryBombDetonated') {
                this._detonateCherryBomb(event.x, event.y, event.row)
                this.events.push(event)
                this.events.push({ type: 'boardShake', amountX: 3, amountY: -4 })
            } else {
                this.events.push(event)
            }
        }
    }

    private _detonateCherryBomb(x: number, y: number, row: number) {
        for (const zombie of this.zombies) {
            if (!this._isZombieDamageable(zombie)) continue
            if (Math.abs(zombie.row - row) > CHERRY_BOMB_ROW_RANGE) continue
            if (!this._circleRectOverlap(x, y, CHERRY_BOMB_RADIUS, zombie.getBodyRect())) continue

            const burned = zombie.applyBurn()
            if (!burned) continue

            this._dropZombieLoot(zombie)
        }
    }

    private _addProjectile(type: Projectile['type'], x: number, y: number, row: number) {
        const projectile = createProjectile({
            id: this._allocateId(),
            type,
            x,
            y,
            row,
            shadowY: this.geometry.gridToPixel(0, row).y + 67,
        })
        this.projectiles.push(projectile)
        this.events.push({ type: 'entitySpawned', entityId: projectile.id })
        return projectile
    }

    private _updateProjectiles() {
        const context = {
            events: this.events,
            findCollisionTarget: (projectile: Projectile) => this._findProjectileCollisionTarget(projectile),
            damageTarget: (target: Zombie, projectile: Projectile) => {
                const wasDying = target.state === 'dying'
                this._playProjectileImpactSound(target)
                if (projectile.type === 'snowpea') target.applyChill(this.events)
                const deathContext = {
                    zombieCount: this._countLiveZombies(),
                    canUseSuperLongDeath: this._canUseSuperLongDeath(),
                }
                const damageResult = target.takeDamage(projectile.damage, deathContext)
                if (damageResult.droppedHead) {
                    this._dropZombieLoot(target)
                    if (this._levelAwardDropped) target.finishAfterLevelAwardDropped(deathContext)
                }
                if (!wasDying && target.state === 'dying') this._dropZombieLoot(target)
                return true
            },
        }

        for (const projectile of this.projectiles) {
            projectile.update(context)
        }
    }

    private _playProjectileImpactSound(target: Zombie) {
        if (target.helmHealth > 0 && target.helmType === 'bucket') {
            this.events.push({ type: 'foleyRequested', sound: SoundEffect.ShieldHit })
            return
        }
        if (target.helmHealth > 0 && target.helmType === 'traffic-cone') {
            this.events.push({ type: 'foleyRequested', sound: SoundEffect.PlasticHit })
        }
        this.events.push({ type: 'foleyRequested', sound: SoundEffect.Splat, pitchRange: 10 })
    }

    private _updateItems() {
        const context = this._createItemUpdateContext(this.events)
        for (const item of this.items) {
            item.update(context)
        }
        if (this.autoCollectEnabled) this._autoCollectAvailableItems()
    }

    private _autoCollectAvailableItems() {
        const context = this._createItemUpdateContext(this.events)
        for (const item of this.items) {
            if (!this._isAutoCollectableItem(item)) continue

            const collected = item.collect(context)
            if (collected && this._isSunItem(item)) this._handleLevelOneTutorialSunClicked(item)
        }
    }

    private _isAutoCollectableItem(item: Item) {
        return !item.dead && !item.beingCollected && (this._isSunItem(item) || this._isMoneyItem(item))
    }

    private _isSunItem(item: Item) {
        return item.type === 'sun' || item.type === 'small-sun' || item.type === 'large-sun'
    }

    private _isMoneyItem(item: Item) {
        return item.type === 'silver-coin' || item.type === 'gold-coin' || item.type === 'diamond'
    }

    private _updateZombies() {
        const context = {
            events: this.events,
            zombieCount: this._countLiveZombies(),
            canUseSuperLongDeath: this._canUseSuperLongDeath(),
            findPlantTarget: (zombie: Zombie) => this._findZombiePlantTarget(zombie),
            canChewPlant: (plant: PlantEntity) => this._canZombieChewPlant(plant),
            damagePlant: (plant: PlantEntity, damage: number) => {
                plant.recentlyEatenCounter = PLANT_RECENTLY_EATEN_TICKS
                if (plant instanceof Plant) {
                    plant.takeChewDamage(damage)
                    return
                }

                plant.health = Math.max(0, plant.health - damage)
                if (plant.health <= 0) plant.dead = true
            },
            flashChewedPlant: (plant: PlantEntity) => {
                plant.eatenFlashCounter = Math.max(plant.eatenFlashCounter, PLANT_EATEN_FLASH_TICKS)
            },
            checkBoardEdge: (zombie: Zombie) => this._checkZombieBoardEdge(zombie),
            randomInt: (minInclusive: number, maxInclusive: number) =>
                this._randomInt(minInclusive, maxInclusive),
            randomFloat: (minInclusive: number, maxExclusive: number) =>
                this._randomFloat(minInclusive, maxExclusive),
        }

        for (const zombie of this.zombies) {
            const wasDying = zombie.state === 'dying'
            zombie.update(context)
            if (!wasDying && zombie.state === 'dying') this._dropZombieLoot(zombie)
            if (this.result === 'lost') break
        }
    }

    private _canZombieChewPlant(plant: PlantEntity) {
        if (plant.type === 'cherrybomb') return false
        if (plant.type === 'potatomine' && plant.state !== 'not-ready') return false
        return true
    }

    private _initLawnMowers() {
        if (this.level.hasLawnMowers === false) return

        for (const row of this.level.activeRows) {
            const mower = this._createLawnMower(row)
            mower.x = LAWN_MOWER_READY_X
            this.lawnMowers.push(mower)
            this.events.push({ type: 'entitySpawned', entityId: mower.id })
        }
    }

    private _createLawnMower(row: number): LawnMowerEntity {
        return {
            id: this._allocateId(),
            kind: 'lawnmower',
            row,
            x: LAWN_MOWER_START_X,
            y: this.geometry.gridToPixel(0, row).y + LAWN_MOWER_Y_OFFSET,
            state: 'ready',
            chompCounter: 0,
            dead: false,
        }
    }

    private _debugTriggerLawnMower(row: number) {
        const mower = this._findLawnMower(row)
        if (!mower || mower.dead || mower.state === 'triggered') return false

        this._startLawnMower(mower)
        return true
    }

    private _debugResetLawnMower(row: number) {
        const mower = this._findLawnMower(row)
        if (mower && !mower.dead && mower.state === 'ready') return false

        if (mower) {
            mower.dead = false
            mower.state = 'ready'
            mower.x = LAWN_MOWER_READY_X
            mower.y = this.geometry.gridToPixel(0, row).y + LAWN_MOWER_Y_OFFSET
            mower.chompCounter = 0
            this._waveRowGotLawnMowered[row] = WAVE_ROW_GOT_LAWN_MOWERED_INITIAL
            return true
        }

        if (!this.level.activeRows.includes(row)) return false

        const newMower = this._createLawnMower(row)
        newMower.x = LAWN_MOWER_READY_X
        this.lawnMowers.push(newMower)
        this.events.push({ type: 'entitySpawned', entityId: newMower.id })
        return true
    }

    private _findLawnMower(row: number) {
        return this.lawnMowers.find((mower) => mower.row === row) ?? null
    }

    private _updateLawnMowers() {
        for (const mower of this.lawnMowers) {
            if (mower.dead) continue
            this._mowOverlappingZombies(mower)
            if (mower.state !== 'triggered') continue

            let speed = LAWN_MOWER_SPEED
            if (mower.chompCounter > 0) {
                mower.chompCounter--
                speed = this._animateBounceSlowMiddle(
                    LAWN_MOWER_CHOMP_TRIGGERED_COUNTER,
                    0,
                    mower.chompCounter,
                    LAWN_MOWER_SPEED,
                    1,
                )
            }
            mower.x += speed
            mower.y = this.geometry.gridToPixel(0, mower.row).y + LAWN_MOWER_Y_OFFSET
            if (mower.x > WIDE_BOARD_WIDTH) mower.dead = true
        }
    }

    private _mowOverlappingZombies(mower: LawnMowerEntity) {
        const attackRect = this._lawnMowerAttackRect(mower)
        for (const zombie of this.zombies) {
            if (zombie.dead || zombie.row !== mower.row) continue
            if (zombie.state === 'dying') continue
            if (zombie.state === 'mowered') continue
            if (zombie.state === 'charred') continue
            if (this._rectOverlap(attackRect, zombie.getBodyRect()) <= 0) continue
            if (mower.state === 'ready' && !zombie.hasHead) continue

            this._mowZombie(mower, zombie)
        }
    }

    private _mowZombie(mower: LawnMowerEntity, zombie: Zombie) {
        if (mower.state === 'ready') {
            this._startLawnMower(mower)
            mower.chompCounter = LAWN_MOWER_CHOMP_READY_COUNTER
        } else {
            mower.chompCounter = LAWN_MOWER_CHOMP_TRIGGERED_COUNTER
        }
        this.events.push({ type: 'foleyRequested', sound: SoundEffect.Splat })
        zombie.mowDown()
        this._dropZombieLoot(zombie)
    }

    private _startLawnMower(mower: LawnMowerEntity) {
        if (mower.state === 'triggered') return

        this._waveRowGotLawnMowered[mower.row] = this.currentWave
        mower.state = 'triggered'
        this.events.push({ type: 'foleyRequested', sound: SoundEffect.Lawnmower })
    }

    private _lawnMowerAttackRect(mower: LawnMowerEntity): Rect {
        return {
            x: mower.x,
            y: mower.y,
            width: LAWN_MOWER_ATTACK_WIDTH,
            height: LAWN_MOWER_ATTACK_HEIGHT,
        }
    }

    private _createItemUpdateContext(events: GameEvent[]) {
        return {
            events,
            addSun: (amount: number) => {
                this._addSun(amount)
            },
            addMoney: (amount: number) => {
                this._addMoney(amount)
            },
            completeLevelAward: (_item: Item) => {
                this._completeLevel()
            },
            randomInt: (minInclusive: number, maxInclusive: number) =>
                this._randomInt(minInclusive, maxInclusive),
            randomFloat: (minInclusive: number, maxExclusive: number) =>
                this._randomFloat(minInclusive, maxExclusive),
        }
    }

    private _addSun(amount: number) {
        this._setSun(this.sun + amount)
        if (amount > 0) this._handleLevelOneTutorialSunBanked()
    }

    private _setSun(amount: number) {
        this.sun = Math.max(SUN_MIN, Math.min(SUN_MAX, amount))
    }

    private _addMoney(amount: number) {
        this._setMoney(this.money + amount)
    }

    private _setMoney(amount: number) {
        const nextMoney = clampMoney(amount)
        if (this.money === nextMoney) return

        this.money = nextMoney
        this.events.push({ type: 'moneyChanged', amount: this.money })
    }

    private _updateLevelOneTutorial() {
        if (this.level.adventureLevel !== 1) return

        switch (this._levelOneTutorialPhase) {
            case 'first-plant-done':
            case 'collect-more-sun':
                if (this._levelOnePeashooterPacketReady()) {
                    this._enterLevelOneEnoughSunPhase()
                }
                break
            case 'enough-sun':
                this._levelOneTutorialTimer--
                if (this._levelOneTutorialTimer <= 0) {
                    if (!this._levelOnePeashooterPacketReady()) {
                        this._levelOneTutorialPhase = 'collect-more-sun'
                        return
                    }
                    this._levelOneTutorialPhase = 'pick-second-seed'
                    this._pushLevelOneTutorialAdvice(LEVEL_1_ADVICE_PLANT_SECOND_PEASHOOTER)
                }
                break
        }
    }

    private _handleLevelOneTutorialSeedSelected(seedType: SeedType) {
        if (this.level.adventureLevel !== 1 || seedType !== 'peashooter') return

        if (this._levelOneTutorialPhase === 'pick-first-seed') {
            this._levelOneTutorialPhase = 'plant-first-seed'
            this._pushLevelOneTutorialAdvice(LEVEL_1_ADVICE_PLANT_SEED)
            return
        }

        if (this._levelOneTutorialPhase === 'enough-sun' || this._levelOneTutorialPhase === 'pick-second-seed') {
            this._levelOneTutorialPhase = 'plant-second-seed'
            this._clearAdvice()
        }
    }

    private _handleLevelOneTutorialSeedCanceled(seedType: SeedType) {
        if (this.level.adventureLevel !== 1 || seedType !== 'peashooter') return

        if (this._levelOneTutorialPhase === 'plant-first-seed') {
            this._levelOneTutorialPhase = 'pick-first-seed'
            this._pushLevelOneTutorialAdvice(LEVEL_1_ADVICE_PICK_SEED)
            return
        }

        if (this._levelOneTutorialPhase === 'plant-second-seed') {
            this._levelOneTutorialPhase = 'enough-sun'
            this._levelOneTutorialTimer = LEVEL_1_SECOND_SEED_PROMPT_DELAY
            this._pushLevelOneTutorialAdvice(LEVEL_1_ADVICE_ENOUGH_SUN)
        }
    }

    private _handleLevelOneTutorialPlantPlaced(plant: Plant, isFirstPlant: boolean) {
        if (this.level.adventureLevel !== 1 || plant.type !== 'peashooter') return

        if (
            isFirstPlant ||
            this._levelOneTutorialPhase === 'pick-first-seed' ||
            this._levelOneTutorialPhase === 'plant-first-seed'
        ) {
            this._levelOneTutorialPhase = 'first-plant-done'
            this._sunCountDown = LEVEL_1_AFTER_FIRST_PLANT_SUN_DELAY
            this._pushLevelOneTutorialAdvice(LEVEL_1_ADVICE_FIRST_PLANT_DONE)
            return
        }

        if (this._levelOneTutorialPhase === 'plant-second-seed') {
            this._levelOneTutorialPhase = 'done'
            this.zombieCountDown = LEVEL_1_ZOMBIE_COUNTDOWN_AFTER_TUTORIAL
            this.zombieCountDownStart = this.zombieCountDown
            this._pushLevelOneTutorialAdvice(LEVEL_1_ADVICE_ZOMBIES_CAN_START, 'tutorial-level1')
        }
    }

    private _handleLevelOneTutorialSunClicked(item: Item) {
        if (this.level.adventureLevel !== 1 || item.type !== 'sun') return

        if (this._levelOneTutorialPhase === 'first-plant-done') {
            this._levelOneTutorialPhase = 'collect-more-sun'
            this._pushLevelOneTutorialAdvice(LEVEL_1_ADVICE_CLICKED_SUN)
            return
        }

        if (this._levelOneTutorialPhase === 'collect-more-sun' && this._levelOnePeashooterPacketReady()) {
            this._enterLevelOneEnoughSunPhase()
            return
        }
    }

    private _handleLevelOneTutorialSunBanked() {
        if (this.level.adventureLevel !== 1) return
        if (this._levelOneTutorialPhase !== 'first-plant-done' &&
            this._levelOneTutorialPhase !== 'collect-more-sun') return
        if (!this._levelOnePeashooterPacketReady()) return

        this._enterLevelOneEnoughSunPhase()
    }

    private _enterLevelOneEnoughSunPhase() {
        if (this._levelOneTutorialPhase === 'enough-sun' ||
            this._levelOneTutorialPhase === 'pick-second-seed' ||
            this._levelOneTutorialPhase === 'plant-second-seed' ||
            this._levelOneTutorialPhase === 'done') {
            return
        }

        this._levelOneTutorialPhase = 'enough-sun'
        this._levelOneTutorialTimer = LEVEL_1_SECOND_SEED_PROMPT_DELAY
        this._pushLevelOneTutorialAdvice(LEVEL_1_ADVICE_ENOUGH_SUN)
    }

    private _levelOnePeashooterPacketReady() {
        const packet = this.seedPackets.find((item) => item.seedType === 'peashooter')
        if (!packet || packet.cooldownRemaining > 0 || !packet.active) return false

        return this._canSpendSun(SEED_DEFINITIONS.peashooter.cost)
    }

    private _isLevelOneTutorialBlockingSun() {
        if (this.level.adventureLevel !== 1) return false
        if (this._levelOneTutorialPhase !== 'pick-first-seed' && this._levelOneTutorialPhase !== 'plant-first-seed') {
            return false
        }
        return this.plants.length === 0
    }

    private _isLevelOneTutorialBlockingZombies() {
        return this.level.adventureLevel === 1 && this._levelOneTutorialPhase !== 'done'
    }

    private _updateLevelTwoTutorial() {
        if (this.level.adventureLevel !== 2) return

        if (this._levelTwoTutorialTimer > 0) {
            this._levelTwoTutorialTimer--
            if (this._levelTwoTutorialTimer === 0 &&
                this._levelTwoTutorialPhase !== 'off' &&
                this._levelTwoTutorialPhase !== 'completed') {
                this._pushLevelTwoTutorialAdvice(LEVEL_2_ADVICE_PLANT_SUNFLOWER_2)
                this._levelTwoTutorialTimer = -1
            }
        }

        if (this._levelTwoTutorialPhase === 'refresh-sunflower' && this._levelTwoSunflowerPacketReady()) {
            this._levelTwoTutorialPhase = 'pick-sunflower'
        }

        if (!this._levelTwoZombieWarningShown &&
            this.currentWave === 0 &&
            this.zombieCountDown === LEVEL_2_ZOMBIE_WARNING_COUNTDOWN &&
            this._levelTwoTutorialPhase !== 'off' &&
            this._levelTwoTutorialPhase !== 'completed') {
            this._levelTwoZombieWarningShown = true
            this._pushLevelTwoTutorialAdvice(LEVEL_2_ADVICE_PLANT_SUNFLOWER_3)
        }
    }

    private _updateLaterSunflowerTutorial() {
        if (!this._canRunLaterSunflowerTutorial()) return

        if (this._laterSunflowerTutorialTimer > 0) {
            this._laterSunflowerTutorialTimer--
            if (this._laterSunflowerTutorialTimer === 0 &&
                this._isLaterSunflowerTutorialActive()) {
                this._pushLaterSunflowerTutorialAdvice(LATER_ADVICE_SUNFLOWERS_DONE)
                this._laterSunflowerTutorialTimer = -1
            }
        }

        if (this._laterSunflowerTutorialPhase === 'refresh-sunflower' && this._sunflowerPacketReady()) {
            this._laterSunflowerTutorialPhase = 'pick-sunflower'
        }

        if (this._shouldStartLaterSunflowerTutorial()) {
            this._laterSunflowerTutorialShown = true
            this._laterSunflowerTutorialPhase = 'pick-sunflower'
            this._laterSunflowerTutorialTimer = LATER_SUNFLOWER_ADVICE_DELAY
            this._pushLaterSunflowerTutorialAdvice(LATER_ADVICE_PLANT_SUNFLOWER, true)
        }
    }

    private _canRunLaterSunflowerTutorial() {
        return this._firstTimeAdventure &&
            this.level.adventureLevel >= 3 &&
            this.level.adventureLevel !== 5 &&
            this.level.adventureLevel <= 7
    }

    private _shouldStartLaterSunflowerTutorial() {
        return this._canRunLaterSunflowerTutorial() &&
            this._laterSunflowerTutorialPhase === 'off' &&
            !this._laterSunflowerTutorialShown &&
            this.currentWave >= LATER_SUNFLOWER_START_WAVE &&
            this._sunflowerPacketReady() &&
            this._countSunflowers() < 3
    }

    private _isLaterSunflowerTutorialActive() {
        return this._laterSunflowerTutorialPhase === 'pick-sunflower' ||
            this._laterSunflowerTutorialPhase === 'plant-sunflower' ||
            this._laterSunflowerTutorialPhase === 'refresh-sunflower'
    }

    private _updateReadySetPlant() {
        if (this._readySetPlantCounter <= 0) return

        this._readySetPlantCounter--
        if (this._readySetPlantCounter === 0) {
            this._setSeedPacketsActive(true)
        }
    }

    private _isReadySetPlantBlockingGameplay() {
        return this._readySetPlantCounter > 0
    }

    private _isReadySetPlantBlockingPackets() {
        return this._readySetPlantCounter > 0
    }

    private _setSeedPacketsActive(active: boolean) {
        for (const packet of this.seedPackets) {
            if (!packet.selected) packet.active = active && packet.cooldownRemaining <= 0
        }
    }

    private _handleLevelTwoTutorialSeedSelected(seedType: SeedType) {
        if (this.level.adventureLevel !== 2) return

        if (this._levelTwoTutorialPhase === 'pick-sunflower') {
            this._levelTwoTutorialPhase = seedType === 'sunflower' ? 'plant-sunflower' : 'refresh-sunflower'
        }
    }

    private _handleLaterSunflowerTutorialSeedSelected(seedType: SeedType) {
        if (!this._canRunLaterSunflowerTutorial()) return

        if (this._laterSunflowerTutorialPhase === 'pick-sunflower') {
            this._laterSunflowerTutorialPhase = seedType === 'sunflower' ? 'plant-sunflower' : 'refresh-sunflower'
        }
    }

    private _handleLevelTwoTutorialSeedCanceled(seedType: SeedType) {
        if (this.level.adventureLevel !== 2) return
        if (seedType === 'sunflower' && this._levelTwoTutorialPhase === 'plant-sunflower') {
            this._levelTwoTutorialPhase = this._levelTwoSunflowerPacketReady()
                ? 'pick-sunflower'
                : 'refresh-sunflower'
        } else if (this._levelTwoTutorialPhase === 'refresh-sunflower' && this._levelTwoSunflowerPacketReady()) {
            this._levelTwoTutorialPhase = 'pick-sunflower'
        }
    }

    private _handleLaterSunflowerTutorialSeedCanceled(seedType: SeedType) {
        if (!this._canRunLaterSunflowerTutorial()) return
        if (seedType === 'sunflower' && this._laterSunflowerTutorialPhase === 'plant-sunflower') {
            this._laterSunflowerTutorialPhase = this._sunflowerPacketReady()
                ? 'pick-sunflower'
                : 'refresh-sunflower'
        } else if (this._laterSunflowerTutorialPhase === 'refresh-sunflower' && this._sunflowerPacketReady()) {
            this._laterSunflowerTutorialPhase = 'pick-sunflower'
        }
    }

    private _handleLevelTwoTutorialSeedPacketReady(seedType: SeedType) {
        if (this.level.adventureLevel !== 2 || seedType !== 'sunflower') return
        if (this._levelTwoTutorialPhase === 'refresh-sunflower') {
            this._levelTwoTutorialPhase = 'pick-sunflower'
        }
    }

    private _handleLaterSunflowerTutorialSeedPacketReady(seedType: SeedType) {
        if (!this._canRunLaterSunflowerTutorial() || seedType !== 'sunflower') return
        if (this._laterSunflowerTutorialPhase === 'refresh-sunflower') {
            this._laterSunflowerTutorialPhase = 'pick-sunflower'
        }
    }

    private _handleLevelTwoTutorialPlantPlaced(plant: Plant) {
        if (this.level.adventureLevel !== 2) return
        if (this._levelTwoTutorialPhase === 'off' || this._levelTwoTutorialPhase === 'completed') return

        const sunflowerCount = this._countSunflowers()
        if (plant.type === 'sunflower' && sunflowerCount === 2) {
            this._pushLevelTwoTutorialAdvice(LEVEL_2_ADVICE_MORE_SUNFLOWERS)
        }

        if (sunflowerCount >= 3) {
            this._levelTwoTutorialPhase = 'completed'
            if (this.currentWave === 0) {
                this.zombieCountDown = LEVEL_2_COMPLETED_ZOMBIE_COUNTDOWN
                this.zombieCountDownStart = this.zombieCountDown
            }
            return
        }

        this._levelTwoTutorialPhase = this._levelTwoSunflowerPacketReady()
            ? 'pick-sunflower'
            : 'refresh-sunflower'
    }

    private _handleLaterSunflowerTutorialPlantPlaced(plant: Plant) {
        if (!this._canRunLaterSunflowerTutorial() || !this._isLaterSunflowerTutorialActive()) return

        const sunflowerCount = this._countSunflowers()
        if (sunflowerCount >= 3) {
            const shouldShowCompletionAdvice = this._laterSunflowerTutorialTimer > 0
            this._laterSunflowerTutorialPhase = 'completed'
            this._laterSunflowerTutorialTimer = -1
            if (shouldShowCompletionAdvice) {
                this._pushLaterSunflowerTutorialAdvice(LATER_ADVICE_SUNFLOWERS_DONE)
            }
            return
        }

        if (plant.type === 'sunflower') {
            this._laterSunflowerTutorialPhase = this._sunflowerPacketReady()
                ? 'pick-sunflower'
                : 'refresh-sunflower'
        }
    }

    private _levelTwoSunflowerPacketReady() {
        return this._sunflowerPacketReady()
    }

    private _sunflowerPacketReady() {
        const packet = this.seedPackets.find((item) => item.seedType === 'sunflower')
        if (!packet || packet.cooldownRemaining > 0 || !packet.active) return false

        return this._canSpendSun(SEED_DEFINITIONS.sunflower.cost)
    }

    private _countSunflowers() {
        return this.plants.filter((plant) => !plant.dead && plant.type === 'sunflower').length
    }

    private _clearAdvice() {
        this.events.push({ type: 'adviceCleared' })
    }

    private _updateSunSpawning() {
        if (this.level.background !== 'day') return

        this._sunCountDown--
        if (this._sunCountDown !== 0) return

        this._numSunsFallen++
        this._sunCountDown =
            Math.min(SUN_COUNTDOWN_MAX, SUN_COUNTDOWN + this._numSunsFallen * 10) +
            this._randomInt(0, SUN_COUNTDOWN_RANGE - 1)
        this._addItem('sun', 'from-sky', this._randomInt(SKY_SUN_X_MIN, SKY_SUN_X_MAX), SKY_SUN_Y)
    }

    private _updateZombieSpawning() {
        this._updateFinalWaveSound()
        if (this._updateHugeWaveWarning()) return
        if (this.currentWave >= this.numWaves) return

        this.zombieCountDown--
        const currentWaveHealth = this._totalZombiesHealthInWave(this.currentWave - 1)
        const isCurrentWaveWeakerThanNext = currentWaveHealth <= this._zombieHealthToNextWave
        const isNextWaveFlag = this._isFlagWave(this.currentWave)
        const canSkipWave = (
            isCurrentWaveWeakerThanNext &&
            !isNextWaveFlag &&
            this.currentWave !== 0
        ) || currentWaveHealth <= 0
        if (this.zombieCountDown > 200 &&
            this.zombieCountDownStart - this.zombieCountDown > 400 &&
            canSkipWave) {
            this.zombieCountDown = 200
        }
        if (this.zombieCountDown === HUGE_WAVE_WARNING_COUNTDOWN && this._isFlagWave(this.currentWave)) {
            this.events.push({ type: 'hugeWave' })
            this._hugeWaveCountDown = ZOMBIE_COUNTDOWN_BEFORE_HUGE_WAVE
            return
        }
        if (this.zombieCountDown > 0) {
            if (this.zombieCountDown === HUGE_WAVE_WARNING_COUNTDOWN) this._nextWaveComing()
            return
        }

        this._spawnCurrentZombieWaveNow()
    }

    private _spawnCurrentZombieWaveNow(forceAnnouncements = false) {
        const waveIndex = this.currentWave
        this._hugeWaveCountDown = 0
        if (forceAnnouncements) this._pushZombieWaveIncomingEvents(waveIndex)
        this._spawnZombieWave(waveIndex)
        this._zombieHealthWaveStart = this._totalZombiesHealthInWave(waveIndex)
        this._zombieHealthToNextWave = this._randomFloat(0.5, 0.65) * this._zombieHealthWaveStart
        if (this._isFlagWave(waveIndex)) this.flagRaiseCounter = FLAG_RAISE_TIME
        this.currentWave++
        this.zombieCountDown = ZOMBIE_COUNTDOWN + this._randomInt(0, ZOMBIE_COUNTDOWN_RANGE - 1)
        this.zombieCountDownStart = this.zombieCountDown
    }

    private _pushZombieWaveIncomingEvents(waveIndex: number) {
        if (this._isFlagWave(waveIndex)) {
            this.events.push({ type: 'hugeWave' })
            this.events.push({ type: 'soundRequested', sound: SoundEffect.HugeWave })
        }
        if (waveIndex + 1 === this.numWaves) {
            this.events.push({ type: 'finalWave' })
            this.events.push({ type: 'soundRequested', sound: SoundEffect.FinalWave })
        }
        if (waveIndex === 0) {
            this.events.push({ type: 'soundRequested', sound: SoundEffect.Awooga })
        }
    }

    private _spawnZombieWave(waveIndex: number) {
        const wave = this.level.zombieWaves[waveIndex]
        if (!wave) return

        const zombies = this._waveZombies(waveIndex)
        for (let i = 0; i < zombies.length; i++) {
            const zombieType = zombies[i]
            const row = this._pickRowForNewZombie(zombieType)
            const x = 780 + this._randomInt(0, 39)
            this.addZombie(zombieType, row, x, waveIndex)
        }
    }

    private _totalZombiesHealthInWave(waveIndex: number) {
        if (waveIndex < 0) return Number.POSITIVE_INFINITY

        let totalHealth = 0
        for (const zombie of this.zombies) {
            if (zombie.fromWave !== waveIndex || zombie.dead || zombie.state === 'dying' || zombie.state === 'charred') continue
            totalHealth += zombie.health + zombie.helmHealth + zombie.shieldHealth * 0.2
        }
        return totalHealth
    }

    private _waveZombies(waveIndex: number) {
        const wave = this.level.zombieWaves[waveIndex]
        if (!wave) return []

        const plainZombieCount = wave.flagNormalCount ??
            Math.min(FLAG_WAVE_EXTRA_NORMAL_ZOMBIES, Math.max(1, wave.zombies.length))
        const zombies = wave.flagWave
            ? [
                ...Array.from({ length: plainZombieCount }, () => 'normal' as ZombieType),
                'flag' as ZombieType,
                ...wave.zombies,
            ]
            : [...wave.zombies]

        let points = wave.zombiePoints ?? 0
        for (const zombieType of wave.requiredZombies ?? []) {
            if (zombies.includes(zombieType)) continue

            const entry = wave.zombiePointPool?.find((item) => item.zombieType === zombieType)
            zombies.push(zombieType)
            points -= entry?.pointCost ?? 0
        }

        while (points > 0) {
            const candidates = (wave.zombiePointPool ?? []).filter((entry) =>
                entry.pointCost > 0 &&
                entry.pointCost <= points &&
                entry.weight > 0)
            const totalWeight = candidates.reduce((total, entry) => total + entry.weight, 0)
            if (totalWeight <= 0) break

            let roll = this._randomInt(1, totalWeight)
            let picked = candidates[candidates.length - 1]
            for (const entry of candidates) {
                roll -= entry.weight
                if (roll <= 0) {
                    picked = entry
                    break
                }
            }
            zombies.push(picked.zombieType)
            points -= picked.pointCost
        }

        return zombies
    }

    private _updateHugeWaveWarning() {
        if (this._hugeWaveCountDown <= 0) return false

        this._hugeWaveCountDown--
        if (this._hugeWaveCountDown === 0) {
            this._nextWaveComing()
            this.zombieCountDown = 1
        } else if (this._hugeWaveCountDown === 725) {
            this.events.push({ type: 'soundRequested', sound: SoundEffect.HugeWave })
        } else if (this._hugeWaveCountDown === 400) {
            this.events.push({ type: 'musicBurstRequested' })
        }
        return true
    }

    private _nextWaveComing() {
        if (this.currentWave + 1 === this.numWaves) {
            this.events.push({ type: 'finalWave' })
            this._finalWaveSoundCounter = FINAL_WAVE_SOUND_DELAY
        }
        if (this.currentWave === 0) {
            this.events.push({ type: 'soundRequested', sound: SoundEffect.Awooga })
        }
    }

    private _updateFinalWaveSound() {
        if (this._finalWaveSoundCounter <= 0) return

        this._finalWaveSoundCounter--
        if (this._finalWaveSoundCounter === 0) {
            this.events.push({ type: 'soundRequested', sound: SoundEffect.FinalWave })
        }
    }

    private _updateProgressMeter() {
        if (this.currentWave === 0) return

        if (this.flagRaiseCounter > 0) this.flagRaiseCounter--

        const wavesPerFlag = this._numWavesPerFlag()
        const flagCount = this._progressMeterFlagCount(wavesPerFlag)
        const hasFlags = flagCount > 0
        const totalWidth = 150 - (hasFlags ? 12 * flagCount : 0)
        const denominator = Math.max(1, this.numWaves - 1)
        const waveLength = totalWidth / denominator
        let currentWaveLength = (this.currentWave - 1) * totalWidth / denominator
        let nextWaveLength = this.currentWave * totalWidth / denominator
        if (hasFlags) {
            const extraLength = Math.floor(this.currentWave / wavesPerFlag) * 12
            currentWaveLength += extraLength
            nextWaveLength += extraLength
        }
        let fraction = this.zombieCountDownStart > 0
            ? (this.zombieCountDownStart - this.zombieCountDown) / this.zombieCountDownStart
            : 1

        if (this._zombieHealthToNextWave !== -1) {
            const healthCurrent = this._totalZombiesHealthInWave(this.currentWave - 1)
            const damageTarget = Math.max(1, this._zombieHealthWaveStart - this._zombieHealthToNextWave)
            const healthFraction = (damageTarget - healthCurrent + this._zombieHealthToNextWave) / damageTarget
            fraction = Math.max(healthFraction, fraction)
        }

        const targetLength = Math.max(
            1,
            Math.min(150, Math.round(currentWaveLength + (nextWaveLength - currentWaveLength) * fraction)),
        )
        const delta = targetLength - this.progressMeterWidth
        if ((delta > waveLength && this.tick % 5 === 0) || (delta > 0 && this.tick % 20 === 0)) {
            this.progressMeterWidth++
        }
    }

    private _isFlagWave(waveIndex: number) {
        return this.level.zombieWaves[waveIndex]?.flagWave === true
    }

    private _numWavesPerFlag() {
        return this.numWaves < 10 ? this.numWaves : 10
    }

    private _progressMeterFlagCount(wavesPerFlag: number) {
        if (this.level.adventureLevel === 1) return 0
        return Math.floor(this.numWaves / wavesPerFlag)
    }

    private _pickRowForNewZombie(_zombieType: ZombieType) {
        if (this.level.activeRows.length === 0) return 0

        for (const state of this._rowPickState) {
            state.weight = this.level.activeRows.includes(state.row)
                ? this._rowPickWeight(state.row)
                : 0
        }
        const totalWeight = this._rowPickState.reduce((total, item) => total + item.weight, 0)
        if (totalWeight <= 0) {
            const fallbackRow = this.level.activeRows[this._randomInt(0, this.level.activeRows.length - 1)]
            this._updateRowPickState(fallbackRow)
            return fallbackRow
        }

        let adjustedTotalWeight = 0
        for (const state of this._rowPickState) {
            adjustedTotalWeight += this._smoothRowPickWeight(state.weight / totalWeight, state.lastPicked, state.secondLastPicked)
        }
        let pick = this._randomFloat(0, adjustedTotalWeight)
        for (const state of this._rowPickState) {
            pick -= this._smoothRowPickWeight(state.weight / totalWeight, state.lastPicked, state.secondLastPicked)
            if (pick <= 0) {
                this._updateRowPickState(state.row)
                return state.row
            }
        }
        const fallbackRow = this.level.activeRows[this.level.activeRows.length - 1]
        this._updateRowPickState(fallbackRow)
        return fallbackRow
    }

    private _rowPickWeight(row: number) {
        const wavesMowered = this.currentWave - (this._waveRowGotLawnMowered[row] ?? WAVE_ROW_GOT_LAWN_MOWERED_INITIAL)
        if (wavesMowered <= 1) return 0.01
        if (wavesMowered <= 2) return 0.5
        return 1.0
    }

    private _smoothRowPickWeight(weight: number, lastPicked: number, secondLastPicked: number) {
        if (weight <= 0) return 0

        const expectedLength = 1 / weight
        const expectedSecondLength = expectedLength * 2
        const advancedLength = lastPicked + 1 - expectedLength
        const advancedSecondLength = secondLastPicked + 1 - expectedSecondLength
        const factor = Math.max(0.01, Math.min(100,
            (1 + advancedLength / expectedLength * 2) * 0.75 +
            (1 + advancedSecondLength / expectedSecondLength * 2) * 0.25,
        ))
        return weight * factor
    }

    private _updateRowPickState(row: number) {
        for (const state of this._rowPickState) {
            if (state.weight > 0) {
                state.lastPicked++
                state.secondLastPicked++
            }
        }

        const picked = this._rowPickState[row]
        if (!picked) return

        picked.secondLastPicked = picked.lastPicked
        picked.lastPicked = 0
    }

    private _addItem(
        type: ItemType,
        motion: ItemMotion,
        x: number,
        y: number,
        awardSeedType: SeedType | null = null,
        awardKind: LevelAwardKind = 'seed',
    ) {
        const item = createItem({
            id: this._allocateId(),
            type,
            motion,
            x,
            y,
            awardKind,
            awardSeedType,
        }, this._createItemUpdateContext(this.events))
        this.items.push(item)
        this.events.push({ type: 'entitySpawned', entityId: item.id })
        if (this.level.adventureLevel === 1 &&
            (this._levelOneTutorialPhase === 'first-plant-done' ||
                this._levelOneTutorialPhase === 'collect-more-sun') &&
            type === 'sun') {
            this._pushLevelOneClickOnSunAdvice()
        }
        return item
    }

    private _pushLevelOneClickOnSunAdvice() {
        if (this._levelOneClickOnSunAdviceShown) return

        this._levelOneClickOnSunAdviceShown = true
        this._pushLevelOneTutorialAdvice(LEVEL_1_ADVICE_COLLECT_FALLING_SUN)
    }

    private _pushNotEnoughSunFeedback() {
        this.events.push({ type: 'soundRequested', sound: SoundEffect.Buzzer })
        this.events.push({ type: 'sunFlash' })
        if (this.level.adventureLevel !== 1 || this._levelOneCantAffordAdviceShown) return

        this._levelOneCantAffordAdviceShown = true
        this.events.push({ type: 'advice', message: LEVEL_1_ADVICE_CANT_AFFORD, style: 'tutorial-level1' })
    }

    private _canSpendSun(amount: number) {
        if (!this.sunCostEnabled) return true
        return amount <= this.sun + this._countSunBeingCollected()
    }

    private _countSunBeingCollected() {
        return this.items.reduce((total, item) => {
            if (!item.beingCollected || item.dead) return total
            if (item.type === 'small-sun') return total + 15
            if (item.type === 'large-sun') return total + 50
            if (item.type === 'sun') return total + 25
            return total
        }, 0)
    }

    private _findItemAt(x: number, y: number) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i]
            if (item.hitTest(x, y)) return item
        }
        return null
    }

    private _hasTargetInRow(row: number, plant: Plant) {
        const attackRect = this._plantAttackRect(plant)
        return this.zombies.some((zombie) => {
            if (zombie.row !== row) return false
            if (!this._isZombieTargetableByPlant(zombie)) return false
            return this._rectOverlapX(attackRect, zombie.getBodyRect()) >= 0
        })
    }

    private _plantAttackRect(plant: Plant): Rect {
        return {
            x: plant.x + SHOOTER_ATTACK_OFFSET_X,
            y: plant.y,
            width: WIDE_BOARD_WIDTH,
            height: PLANT_DEFINITIONS[plant.type].bodyRect.height,
        }
    }

    private _hasTargetInPlantAttackRect(plant: Plant) {
        const attackRect = {
            x: plant.x + 20,
            y: plant.y - 75,
            width: 100,
            height: 75,
        }
        return this.zombies.some((zombie) =>
            zombie.row === plant.row &&
            this._isZombieTargetableByPlant(zombie) &&
            this._rectOverlapX(attackRect, zombie.getBodyRect()) > 0)
    }

    private _findPlantAt(x: number, y: number) {
        const grid = this.geometry.pixelToGrid(x, y)
        if (!grid) return null

        return this._findPlantAtGrid(grid.row, grid.col)
    }

    private _findPlantAtGrid(row: number, col: number) {
        for (let i = this.plants.length - 1; i >= 0; i--) {
            const plant = this.plants[i]
            if (!plant.dead && plant.col === col && plant.row === row) return plant
        }
        return null
    }

    private _removeDeadEntities() {
        this._removeDead(this.plants)
        this._removeDead(this.zombies)
        this._removeDead(this.projectiles)
        this._removeDead(this.items)
        this._removeDead(this.lawnMowers)
    }

    private _removeDead<T extends { id: number, dead: boolean }>(items: T[]) {
        for (let i = items.length - 1; i >= 0; i--) {
            if (!items[i].dead) continue
            this.events.push({ type: 'entityRemoved', entityId: items[i].id })
            items.splice(i, 1)
        }
    }

    private _checkLevelCompletion() {
        if (this.result !== 'playing' || this._levelWonNotified) return
        if (this.currentWave < this.numWaves) return
        if (this.zombies.some((zombie) => !zombie.dead)) return
        if (this._levelAwardKindForLevel() && !this._levelAwardDropped) {
            const row = this.level.activeRows[Math.floor(this.level.activeRows.length / 2)] ?? 2
            this._dropLevelAward(WIDE_BOARD_WIDTH / 2, this.geometry.gridToPixel(0, row).y)
            return
        }
        if (this._levelAwardKindForLevel() && this.items.some((item) => item.type === 'final-seed-packet' && !item.dead)) {
            return
        }

        this._completeLevel()
    }

    private _autoCollectRemainingSun() {
        const context = this._createItemUpdateContext(this.events)
        for (const item of this.items) {
            if (!this._isSunItem(item) || item.dead || item.beingCollected) continue
            item.collect(context)
        }
    }

    private _completeLevel() {
        if (this._levelWonNotified) return

        this._levelWonNotified = true
        this.sunSpawningEnabled = false
        this._autoCollectRemainingSun()
        this.result = 'won'
        this.events.push({ type: 'levelWon' })
    }

    private _checkZombieBoardEdge(zombie: Zombie) {
        if (this.result !== 'playing') return false
        if (zombie.dead || zombie.state === 'dying' || zombie.state === 'mowered' || zombie.state === 'charred') return false

        const edgeX = this._zombieBoardEdgeX(zombie)
        const zombieX = zombie.getBoardX()
        if (zombie.hasHead && zombieX <= edgeX) {
            this._zombiesWon(zombie)
            return true
        }
        if (!zombie.hasHead && zombieX <= edgeX + HEADLESS_ZOMBIE_EDGE_OFFSET) {
            zombie.takeDamage(HEADLESS_ZOMBIE_EDGE_DAMAGE, {
                zombieCount: this._countLiveZombies(),
                canUseSuperLongDeath: this._canUseSuperLongDeath(),
            })
            return true
        }

        return false
    }

    private _zombieBoardEdgeX(_zombie: Zombie) {
        return BOARD_EDGE
    }

    private _zombiesWon(winner: Zombie | null) {
        if (this.result === 'lost') return

        this.result = 'lost'
        winner?.walkIntoHouse()
        this.events.push({ type: 'levelLost', zombieId: winner?.id ?? null })
    }

    private _pushAdvice() {
        if (this._adviceIndex >= this.level.tutorialAdvice.length) return
        this.events.push({ type: 'advice', message: this.level.tutorialAdvice[this._adviceIndex], style: 'tutorial-level1-stay' })
        this._adviceIndex++
    }

    private _pushLevelOneTutorialAdvice(message: string, style: 'tutorial-level1' | 'tutorial-level1-stay' = 'tutorial-level1-stay') {
        this.events.push({ type: 'advice', message, style })
    }

    private _pushLevelTwoTutorialAdvice(message: string) {
        this.events.push({ type: 'advice', message, style: 'tutorial-level2' })
    }

    private _pushLaterSunflowerTutorialAdvice(message: string, stay = false) {
        this.events.push({ type: 'advice', message, style: stay ? 'tutorial-later-stay' : 'tutorial-later' })
    }

    private _allocateId() {
        return this._nextEntityId++
    }

    private _findZombiePlantTarget(zombie: Zombie) {
        if (this.level.challengeMode === 'wallnut-bowling') return null

        const attackRect = zombie.getAttackRect()
        for (const plant of this.plants) {
            if (plant.dead || plant.row !== zombie.row) continue
            if (this._rectOverlapX(attackRect, this._plantRect(plant)) >= 20) return plant
        }
        return null
    }

    private _plantRect(plant: PlantEntity): Rect {
        const rect = PLANT_DEFINITIONS[plant.type].bodyRect
        return {
            x: plant.x + rect.x,
            y: plant.y + rect.y,
            width: rect.width,
            height: rect.height,
        }
    }

    private _rectOverlapX(rectA: Rect, rectB: Rect) {
        const left = Math.max(rectA.x, rectB.x)
        const right = Math.min(rectA.x + rectA.width, rectB.x + rectB.width)
        return right - left
    }

    private _rectOverlap(rectA: Rect, rectB: Rect) {
        const overlapX = this._rectOverlapX(rectA, rectB)
        if (overlapX <= 0) return overlapX

        const top = Math.max(rectA.y, rectB.y)
        const bottom = Math.min(rectA.y + rectA.height, rectB.y + rectB.height)
        const overlapY = bottom - top
        if (overlapY <= 0) return overlapY

        return Math.min(overlapX, overlapY)
    }

    private _circleRectOverlap(circleX: number, circleY: number, radius: number, rect: Rect) {
        const closestX = Math.max(rect.x, Math.min(circleX, rect.x + rect.width))
        const closestY = Math.max(rect.y, Math.min(circleY, rect.y + rect.height))
        const dx = circleX - closestX
        const dy = circleY - closestY
        return dx * dx + dy * dy <= radius * radius
    }

    private _animateBounceSlowMiddle(
        timeStart: number,
        timeEnd: number,
        timeAge: number,
        positionStart: number,
        positionEnd: number,
    ) {
        const warpedAge = (timeAge - timeStart) / (timeEnd - timeStart)
        if (warpedAge <= 0 || warpedAge >= 1) return positionStart

        const bounce = 1 - Math.abs(2 * warpedAge - 1)
        const invQuad = 2 * bounce - bounce * bounce
        return (positionEnd - positionStart) * invQuad + positionStart
    }

    private _findProjectileCollisionTarget(projectile: Projectile) {
        const projectileRect = projectile.getProjectileRect()
        let target: Zombie | null = null
        for (const zombie of this.zombies) {
            if (zombie.row !== projectile.row) continue
            if (!this._isZombieDamageableForProjectileCollision(zombie)) continue
            if (this._rectOverlap(projectileRect, zombie.getBodyRect()) <= 0) continue
            if (!target || zombie.x < target.x) target = zombie
        }
        return target
    }

    private _countLiveZombies() {
        return this.zombies.filter((zombie) => !zombie.dead).length
    }

    private _canUseSuperLongDeath() {
        return this.level.adventureLevel > 5
    }

    private _isZombieVisibleForPlantTarget(zombie: Zombie) {
        return zombie.getBodyRect().x < this.geometry.width
    }

    private _isZombieVisibleForProjectileCollision(zombie: Zombie) {
        return zombie.getBoardX() < this.geometry.width
    }

    private _isZombieDamageable(zombie: Zombie) {
        if (zombie.dead || zombie.state === 'dying' || zombie.state === 'mowered' || zombie.state === 'charred') return false
        return true
    }

    private _isZombieTargetableByPlant(zombie: Zombie) {
        if (!this._isZombieDamageable(zombie)) return false
        return this._isZombieVisibleForPlantTarget(zombie)
    }

    private _isZombieDamageableForProjectileCollision(zombie: Zombie) {
        if (!this._isZombieDamageable(zombie)) return false
        return this._isZombieVisibleForProjectileCollision(zombie)
    }

    private _dropZombieLoot(zombie: Zombie) {
        const rect = zombie.getBodyRect()
        const centerX = rect.x + rect.width / 2
        const centerY = rect.y + rect.height / 4
        if (this._shouldDropLevelAwardFromZombie(zombie)) {
            this._dropLevelAward(centerX, centerY)
            return
        }
        if (this._zombiesWithDroppedLoot.has(zombie.id)) return
        if (this._levelAwardDropped || !this._canDropMoneyLoot()) return

        this._zombiesWithDroppedLoot.add(zombie.id)
        this._dropMoneyLootPiece(centerX, centerY, this._zombieLootDropFactor(zombie.type))
    }

    private _canDropMoneyLoot() {
        return !this._firstTimeAdventure || this.level.adventureLevel >= FIRST_ADVENTURE_MONEY_DROP_LEVEL
    }

    private _levelAwardKindForLevel(): LevelAwardKind | null {
        return this.level.awardKind ?? (this.level.awardSeedType ? 'seed' : null)
    }

    private _shouldDropLevelAwardFromZombie(zombie: Zombie) {
        if (!this._levelAwardKindForLevel() || this._levelAwardDropped) return false
        if (this.currentWave < this.numWaves) return false
        if (this._isHeadedEnemyZombie(zombie)) return false

        return this.zombies.every((item) =>
            item.id === zombie.id ||
            !this._isHeadedEnemyZombie(item))
    }

    private _isHeadedEnemyZombie(zombie: Zombie) {
        return zombie.hasHead &&
            !zombie.dead &&
            zombie.state !== 'dying' &&
            zombie.state !== 'mowered' &&
            zombie.state !== 'charred'
    }

    private _dropLevelAward(x: number, y: number) {
        const awardKind = this._levelAwardKindForLevel()
        if (!awardKind || this._levelAwardDropped) return

        this._levelAwardDropped = true
        this._stopPostAwardBoardActivity()
        this.events.push({ type: 'foleyRequested', sound: SoundEffect.Throw, pitchRange: 10 })
        this._addItem('final-seed-packet', 'coin', x, y, this.level.awardSeedType ?? null, awardKind)
    }

    private _stopPostAwardBoardActivity() {
        this.sunSpawningEnabled = false
        for (const zombie of this.zombies) {
            if (zombie.state === 'charred') continue
            zombie.dead = true
        }
    }

    private _dropMoneyLootPiece(x: number, y: number, dropFactor: number) {
        const roll = this._moneyDropRoll()
        let type: ItemType | null = null
        if (roll < DIAMOND_DROP_THRESHOLD * dropFactor) {
            type = 'diamond'
        } else if (roll < GOLD_DROP_THRESHOLD * dropFactor) {
            type = 'gold-coin'
        } else if (roll < SILVER_DROP_THRESHOLD * dropFactor) {
            type = 'silver-coin'
        }
        if (!type) return

        this.events.push({ type: 'foleyRequested', sound: SoundEffect.Throw, pitchRange: 10 })
        this._addItem(type, 'coin', x - 40, y)
        this._droppedFirstMoney = true
    }

    private _moneyDropRoll() {
        if (this._firstTimeAdventure &&
            this.level.adventureLevel === FIRST_ADVENTURE_MONEY_DROP_LEVEL &&
            !this._droppedFirstMoney &&
            this.currentWave > FIRST_ADVENTURE_FIRST_MONEY_WAVE) {
            return FIRST_ADVENTURE_FIRST_MONEY_ROLL
        }

        return this._randomInt(0, MONEY_DROP_ROLL_MAX)
    }

    private _zombieLootDropFactor(type: ZombieType) {
        if (type === 'traffic-cone') return 2
        if (type === 'bucket') return 4
        return 1
    }

    private _randomInt(minInclusive: number, maxInclusive: number) {
        const min = Math.ceil(minInclusive)
        const max = Math.floor(maxInclusive)
        if (max <= min) return min
        return min + Math.floor(Math.random() * (max - min + 1))
    }

    private _randomFloat(minInclusive: number, maxExclusive: number) {
        return minInclusive + Math.random() * (maxExclusive - minInclusive)
    }

    private _zombieCanHaveTongue(type: ZombieType) {
        return type === 'normal' || type === 'flag' || type === 'traffic-cone' || type === 'bucket'
    }
}
