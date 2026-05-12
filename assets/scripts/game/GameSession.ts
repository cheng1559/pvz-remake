import {
    ADVENTURE_1_1,
    DAY_GEOMETRY,
    PLANT_DEFINITIONS,
    SEED_DEFINITIONS,
    ZOMBIE_DEFINITIONS,
} from './GameDefinitions'
import { SoundEffect } from '@/core/SoundLoader'
import { createItem, Item } from './items/ItemFactory'
import { createPlant, Plant } from './plants/PlantFactory'
import { createProjectile, Projectile } from './projectiles/ProjectileFactory'
import { createZombie, Zombie } from './zombies/ZombieFactory'
import type {
    GameCommand,
    GameEntity,
    GameEvent,
    ItemMotion,
    ItemType,
    GameResult,
    LawnMowerEntity,
    LevelDefinition,
    LevelOneTutorialPhase,
    LevelTwoTutorialPhase,
    PlantEntity,
    PlantType,
    PlantingReason,
    Rect,
    SeedPacketState,
    SeedType,
    ToolType,
    ZombieType,
} from './GameTypes'

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
const ZOMBIE_WAVE_SPAWN_X_SPACING = 40
const ZOMBIE_COUNTDOWN_BEFORE_HUGE_WAVE = 750
const HUGE_WAVE_WARNING_COUNTDOWN = 5
const FINAL_WAVE_SOUND_DELAY = 60
const FLAG_RAISE_TIME = 100
const FLAG_WAVE_EXTRA_NORMAL_ZOMBIES = 4
const MONEY_DROP_ROLL_MAX = 29999
const DIAMOND_DROP_THRESHOLD = 14
const GOLD_DROP_THRESHOLD = 250
const SILVER_DROP_THRESHOLD = 2500
const LAWN_MOWER_READY_X = -21
const LAWN_MOWER_START_X = -160
const LAWN_MOWER_Y_OFFSET = 23
const LAWN_MOWER_ATTACK_WIDTH = 50
const LAWN_MOWER_ATTACK_HEIGHT = 80
const LAWN_MOWER_SPEED = 3.33
const LAWN_MOWER_CHOMP_READY_COUNTER = 25
const LAWN_MOWER_CHOMP_TRIGGERED_COUNTER = 50
const CHERRY_BOMB_RADIUS = 115
const CHERRY_BOMB_ROW_RANGE = 1
const SUN_MIN = 0
const SUN_MAX = 9990
const WIDE_BOARD_WIDTH = 800
const BOARD_EDGE = -100
const HEADLESS_ZOMBIE_EDGE_OFFSET = 70
const HEADLESS_ZOMBIE_EDGE_DAMAGE = 1800
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
const LEVEL_2_FIRST_ADVICE_DELAY = 500
const LEVEL_2_ZOMBIE_COUNTDOWN_FIRST_WAVE = ZOMBIE_COUNTDOWN * 2
const LEVEL_2_COMPLETED_ZOMBIE_COUNTDOWN = 999
const LEVEL_2_ZOMBIE_WARNING_COUNTDOWN = 750
const READY_SET_PLANT_TICKS = 183

export class GameSession {
    readonly level: LevelDefinition
    readonly geometry = DAY_GEOMETRY
    readonly seedPackets: SeedPacketState[]
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
    selectedTool: ToolType | null = null
    paused = false
    hasPlantedAtLeastOnce = false
    rechargingEnabled = true
    sunSpawningEnabled = true
    autoCollectEnabled = false

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
    private _zombiesWithDroppedLoot: Set<number> = new Set()
    private _levelOneTutorialPhase: LevelOneTutorialPhase = 'done'
    private _levelOneTutorialTimer = 0
    private _levelOneClickOnSunAdviceShown = false
    private _levelOneCantAffordAdviceShown = false
    private _levelTwoTutorialPhase: LevelTwoTutorialPhase = 'off'
    private _levelTwoTutorialTimer = -1
    private _levelTwoZombieWarningShown = false
    private _readySetPlantCounter = 0

    constructor(level: LevelDefinition = ADVENTURE_1_1) {
        this.level = level
        this.sun = level.startingSun
        this.seedPackets = level.seedPackets.map((seedType) => ({
            seedType,
            cooldownRemaining: 0,
            active: true,
            selected: false,
        }))
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
        } else if (level.adventureLevel >= 3) {
            this._readySetPlantCounter = READY_SET_PLANT_TICKS
            this._setSeedPacketsActive(false)
        }
        this._initLawnMowers()
        this._pushAdvice()
        if (level.adventureLevel === 2) {
            this._pushLevelTwoTutorialAdvice(LEVEL_2_ADVICE_PLANT_SUNFLOWER_1)
        }
    }

    allEntities(): GameEntity[] {
        return [...this.plants, ...this.zombies, ...this.projectiles, ...this.lawnMowers, ...this.items]
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
        if (this.result !== 'playing') {
            if (this.result === 'won' && !this.paused) {
                this._updateItems()
                this._removeDeadEntities()
            }
            return
        }
        if (this.paused) return

        this.tick++
        this._updateReadySetPlant()
        this._updateSeedPackets()
        this._updateLevelOneTutorial()
        this._updateLevelTwoTutorial()
        if (this.sunSpawningEnabled && !this._isLevelOneTutorialBlockingSun() && !this._isReadySetPlantBlockingGameplay()) {
            this._updateSunSpawning()
        }
        if (!this._isLevelOneTutorialBlockingZombies() && !this._isReadySetPlantBlockingGameplay()) {
            this._updateZombieSpawning()
        }
        this._updatePlants()
        this._updateZombies()
        if (this.result !== 'playing') return
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

        const collected = item.collect(this._createItemUpdateContext(this.events))
        if (collected) this._handleLevelOneTutorialSunClicked(item)
        return collected
    }

    collectCurrencyItemAt(x: number, y: number) {
        const item = this._findItemAt(x, y)
        if (!item || (!this._isSunItem(item) && !this._isMoneyItem(item))) return false

        const collected = item.collect(this._createItemUpdateContext(this.events))
        if (collected && this._isSunItem(item)) this._handleLevelOneTutorialSunClicked(item)
        return collected
    }

    hasItemAt(x: number, y: number) {
        return this._findItemAt(x, y) !== null
    }

    hasPlantAt(x: number, y: number) {
        return this._findPlantAt(x, y) !== null
    }

    debugAddPlant(type: PlantType, row: number, col: number) {
        const pixel = this.geometry.gridToPixel(col, row)
        const plant = createPlant({
            id: this._allocateId(),
            type,
            col,
            row,
            x: pixel.x,
            y: pixel.y,
        })
        const isFirstPlant = !this.hasPlantedAtLeastOnce
        this.plants.push(plant)
        this.hasPlantedAtLeastOnce = true
        this.events.push({ type: 'entitySpawned', entityId: plant.id })
        this.events.push({ type: 'soundRequested', sound: SoundEffect.Plant })
        this._handleLevelOneTutorialPlantPlaced(plant, isFirstPlant)
        this._handleLevelTwoTutorialPlantPlaced(plant)
        if (plant.type === 'cherrybomb') {
            this.events.push({ type: 'soundRequested', sound: SoundEffect.ReverseExplosion })
        }
        return plant
    }

    debugRemovePlant(row: number, col: number) {
        const plant = this._findPlantAtGrid(row, col)
        if (!plant) return false

        plant.dead = true
        this.events.push({ type: 'soundRequested', sound: SoundEffect.Plant2 })
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

    debugSetRechargingEnabled(enabled: boolean) {
        this.rechargingEnabled = enabled
        if (!enabled) this._clearSeedPacketCooldowns()
        return this.rechargingEnabled
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

    getPlantAt(x: number, y: number) {
        return this._findPlantAt(x, y)
    }

    get levelOneTutorialPhase() {
        return this._levelOneTutorialPhase
    }

    shouldShowTutorialSeedGuide(seedType: SeedType) {
        const packet = this.seedPackets.find((item) => item.seedType === seedType)
        return (this.level.adventureLevel === 1 &&
            seedType === 'peashooter' &&
            !this.selectedSeed &&
            !!packet &&
            packet.active &&
            packet.cooldownRemaining <= 0 &&
            this.canAffordSeed(seedType) &&
            (this._levelOneTutorialPhase === 'pick-first-seed' ||
                this._levelOneTutorialPhase === 'pick-second-seed')) ||
            (this.level.adventureLevel === 2 &&
                seedType === 'sunflower' &&
                !this.selectedSeed &&
                !!packet &&
                packet.active &&
                packet.cooldownRemaining <= 0 &&
                this.canAffordSeed(seedType) &&
                this._levelTwoTutorialPhase === 'pick-sunflower')
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
            if (reason === 'not-enough-sun') {
                this._pushNotEnoughSunFeedback()
            } else if (reason === 'waiting-for-seed') {
                this.events.push({ type: 'soundRequested', sound: SoundEffect.Buzzer })
            }
            return
        }

        const seed = SEED_DEFINITIONS[seedType]
        const pixel = this.geometry.gridToPixel(grid.col, grid.row)
        const plant = createPlant({
            id: this._allocateId(),
            type: seed.plantType,
            col: grid.col,
            row: grid.row,
            x: pixel.x,
            y: pixel.y,
        })
        const isFirstPlant = !this.hasPlantedAtLeastOnce
        this.plants.push(plant)
        this.hasPlantedAtLeastOnce = true
        this.sun = Math.max(SUN_MIN, this.sun - seed.cost)

        const packet = this.seedPackets.find((item) => item.seedType === seedType)
        if (packet) packet.cooldownRemaining = this.rechargingEnabled ? seed.cooldownTicks : 0
        this._clearCursor()
        if (packet && !this.rechargingEnabled) packet.active = true
        this.events.push({ type: 'entitySpawned', entityId: plant.id })
        this.events.push({ type: 'soundRequested', sound: SoundEffect.Plant })
        this._handleLevelOneTutorialPlantPlaced(plant, isFirstPlant)
        this._handleLevelTwoTutorialPlantPlaced(plant)
        if (plant.type === 'cherrybomb') {
            this.events.push({ type: 'soundRequested', sound: SoundEffect.ReverseExplosion })
        }
    }

    private _clearCursor() {
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
        this.events.push({ type: 'soundRequested', sound: SoundEffect.Plant2 })
        this._clearCursor()
        this._removeDeadEntities()
    }

    private _refreshSeedPacketFromCursor() {
        const selectedSeed = this.selectedSeed
        this._clearCursor()
        if (!selectedSeed) return

        const packet = this.seedPackets.find((item) => item.seedType === selectedSeed)
        if (packet && packet.cooldownRemaining <= 0) packet.active = true
        this._handleLevelOneTutorialSeedCanceled(selectedSeed)
        this._handleLevelTwoTutorialSeedCanceled(selectedSeed)
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
            if (packet.cooldownRemaining <= 0 && !packet.selected) packet.active = true
            if (!wasReady && packet.active && packet.cooldownRemaining <= 0) {
                this._handleLevelTwoTutorialSeedPacketReady(packet.seedType)
            }
        }
    }

    private _clearSeedPacketCooldowns() {
        if (this._isReadySetPlantBlockingPackets()) return

        for (const packet of this.seedPackets) {
            const wasReady = packet.cooldownRemaining <= 0 && packet.active
            packet.cooldownRemaining = 0
            if (!packet.selected) packet.active = true
            if (!wasReady && packet.active) this._handleLevelTwoTutorialSeedPacketReady(packet.seedType)
        }
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
            plant.update(context)
        }
        this._handlePlantEvents(plantEvents)
    }

    private _handlePlantEvents(events: GameEvent[]) {
        for (const event of events) {
            if (event.type === 'sunProduced') {
                if (this._levelAwardDropped) continue
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
                plant.health = Math.max(0, plant.health - damage)
                if (plant.health <= 0) plant.dead = true
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
            if (this.result !== 'playing') break
        }
    }

    private _canZombieChewPlant(plant: PlantEntity) {
        if (plant.type === 'cherrybomb') return false
        if (plant.type === 'potatomine' && plant.state !== 'not-ready') return false
        return true
    }

    private _initLawnMowers() {
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
        this.money += amount
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
            if (!packet.selected) packet.active = active
        }
    }

    private _handleLevelTwoTutorialSeedSelected(seedType: SeedType) {
        if (this.level.adventureLevel !== 2) return

        if (this._levelTwoTutorialPhase === 'pick-sunflower') {
            this._levelTwoTutorialPhase = seedType === 'sunflower' ? 'plant-sunflower' : 'refresh-sunflower'
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

    private _handleLevelTwoTutorialSeedPacketReady(seedType: SeedType) {
        if (this.level.adventureLevel !== 2 || seedType !== 'sunflower') return
        if (this._levelTwoTutorialPhase === 'refresh-sunflower') {
            this._levelTwoTutorialPhase = 'pick-sunflower'
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

    private _levelTwoSunflowerPacketReady() {
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
        if (this.zombieCountDown > 200 &&
            this.zombieCountDownStart - this.zombieCountDown > 400 &&
            this._totalZombiesHealthInWave(this.currentWave - 1) <= this._zombieHealthToNextWave) {
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
            const x = 780 + i * ZOMBIE_WAVE_SPAWN_X_SPACING + this._randomInt(0, 39)
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
        if (!wave?.flagWave) return wave?.zombies ?? []

        const plainZombieCount = Math.min(FLAG_WAVE_EXTRA_NORMAL_ZOMBIES, Math.max(1, wave.zombies.length))
        return [
            ...Array.from({ length: plainZombieCount }, () => 'normal' as ZombieType),
            'flag' as ZombieType,
            ...wave.zombies,
        ]
    }

    private _updateHugeWaveWarning() {
        if (this._hugeWaveCountDown <= 0) return false

        this._hugeWaveCountDown--
        if (this._hugeWaveCountDown === 0) {
            this._nextWaveComing()
            this.zombieCountDown = 1
        } else if (this._hugeWaveCountDown === 725) {
            this.events.push({ type: 'soundRequested', sound: SoundEffect.HugeWave })
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
        return this.level.activeRows[this._randomInt(0, this.level.activeRows.length - 1)]
    }

    private _addItem(type: ItemType, motion: ItemMotion, x: number, y: number, awardSeedType: SeedType | null = null) {
        const item = createItem({
            id: this._allocateId(),
            type,
            motion,
            x,
            y,
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
        return this.zombies.some((zombie) => {
            if (zombie.row !== row) return false
            if (!this._isZombieTargetableByPlant(zombie)) return false
            const zombieRect = zombie.getBodyRect()
            return zombieRect.x + zombieRect.width > plant.x
        })
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

        if (this.level.awardSeedType && !this._levelAwardDropped) {
            this._dropLevelAward(WIDE_BOARD_WIDTH / 2, this.geometry.gridToPixel(0, this.level.activeRows[0] ?? 2).y + 20)
            return
        }
        if (this.level.awardSeedType && this.items.some((item) => item.type === 'final-seed-packet' && !item.dead)) {
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

    private _allocateId() {
        return this._nextEntityId++
    }

    private _findZombiePlantTarget(zombie: Zombie) {
        const attackRect = zombie.getAttackRect()
        for (const plant of this.plants) {
            if (plant.dead || plant.row !== zombie.row) continue
            if (this._rectOverlapX(attackRect, this._plantRect(plant)) >= 20) return plant
        }
        return null
    }

    private _plantRect(plant: Plant): Rect {
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
        return this.level.adventureLevel > 1
    }

    private _shouldDropLevelAwardFromZombie(zombie: Zombie) {
        if (!this.level.awardSeedType || this._levelAwardDropped) return false
        if (this.currentWave < this.numWaves) return false

        return this.zombies.every((item) =>
            item.id === zombie.id ||
            item.dead ||
            item.state === 'dying' ||
            item.state === 'mowered' ||
            item.state === 'charred')
    }

    private _dropLevelAward(x: number, y: number) {
        if (!this.level.awardSeedType || this._levelAwardDropped) return

        this._levelAwardDropped = true
        this._stopPostAwardBoardActivity()
        this.events.push({ type: 'foleyRequested', sound: SoundEffect.Throw, pitchRange: 10 })
        this._addItem('final-seed-packet', 'coin', x, y, this.level.awardSeedType)
    }

    private _stopPostAwardBoardActivity() {
        this.sunSpawningEnabled = false
        for (const zombie of this.zombies) {
            zombie.dead = true
        }
    }

    private _dropMoneyLootPiece(x: number, y: number, dropFactor: number) {
        const roll = this._randomInt(0, MONEY_DROP_ROLL_MAX)
        let type: ItemType | null = null
        if (roll < DIAMOND_DROP_THRESHOLD * dropFactor) {
            type = 'diamond'
        } else if (roll < GOLD_DROP_THRESHOLD * dropFactor) {
            type = 'gold-coin'
        } else if (roll < SILVER_DROP_THRESHOLD * dropFactor) {
            type = 'silver-coin'
        }
        if (!type) return

        if (type === 'diamond') this.events.push({ type: 'soundRequested', sound: SoundEffect.Chime })
        this.events.push({ type: 'foleyRequested', sound: SoundEffect.Throw, pitchRange: 10 })
        this._addItem(type, 'coin', x - 40, y)
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
