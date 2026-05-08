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
    PlantEntity,
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
const FLAG_WAVE_EXTRA_NORMAL_ZOMBIES = 4
const LAWN_MOWER_READY_X = -21
const LAWN_MOWER_START_X = -160
const LAWN_MOWER_Y_OFFSET = 23
const LAWN_MOWER_ATTACK_WIDTH = 50
const LAWN_MOWER_ATTACK_HEIGHT = 80
const LAWN_MOWER_SPEED = 3.33
const LAWN_MOWER_CHOMP_READY_COUNTER = 25
const LAWN_MOWER_CHOMP_TRIGGERED_COUNTER = 50
const WIDE_BOARD_WIDTH = 800
const LEVEL_1_ADVICE_PICK_SEED = 'Click on a seed packet to pick it up!'
const LEVEL_1_ADVICE_PLANT_SEED = 'Click on the grass to plant your seed!'
const LEVEL_1_ADVICE_FIRST_PLANT_DONE = 'Nicely done!'
const LEVEL_1_ADVICE_COLLECT_FALLING_SUN = 'Click on the falling sun to collect it!'
const LEVEL_1_ADVICE_CLICKED_SUN = "Keep on collecting sun!\nYou'll need it to grow more plants!"
const LEVEL_1_ADVICE_ENOUGH_SUN = "Excellent! You've collected\nenough for your next plant!"
const LEVEL_1_ADVICE_PLANT_SECOND_PEASHOOTER = 'Click on the peashooter to plant another one!'
const LEVEL_1_ADVICE_ZOMBIES_CAN_START = "Don't let the zombies reach your house!"
const LEVEL_1_AFTER_FIRST_PLANT_SUN_DELAY = 400
const LEVEL_1_SECOND_SEED_PROMPT_DELAY = 400
const LEVEL_1_ZOMBIE_COUNTDOWN_AFTER_TUTORIAL = 200
const ZOMBIE_REACHED_HOUSE_X = -50

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
    result: GameResult = 'playing'
    currentWave = 0
    zombieCountDown = ZOMBIE_COUNTDOWN_FIRST_WAVE
    zombieCountDownStart = ZOMBIE_COUNTDOWN_FIRST_WAVE
    selectedSeed: SeedType | null = null
    selectedTool: ToolType | null = null
    paused = false
    hasPlantedAtLeastOnce = false

    private _nextEntityId = 1
    private _adviceIndex = 0
    private _sunCountDown = 0
    private _numSunsFallen = 0
    private _zombieHealthWaveStart = 0
    private _zombieHealthToNextWave = -1
    private _hugeWaveCountDown = 0
    private _finalWaveSoundCounter = 0
    private _levelWonNotified = false
    private _levelOneTutorialPhase: LevelOneTutorialPhase = 'done'
    private _levelOneTutorialTimer = 0
    private _levelOneClickOnSunAdviceShown = false

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
        }
        this._initLawnMowers()
        this._pushAdvice()
    }

    allEntities(): GameEntity[] {
        return [...this.plants, ...this.zombies, ...this.projectiles, ...this.lawnMowers, ...this.items]
    }

    drainEvents(): GameEvent[] {
        return this.events.splice(0)
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
        if (this.result !== 'playing') return
        if (this.paused) return

        this.tick++
        this._updateSeedPackets()
        this._updateLevelOneTutorial()
        if (!this._isLevelOneTutorialBlockingSun()) {
            this._updateSunSpawning()
        }
        if (!this._isLevelOneTutorialBlockingZombies()) {
            this._updateZombieSpawning()
        }
        this._updatePlants()
        this._updateZombies()
        this._updateProjectiles()
        this._updateLawnMowers()
        this._updateItems()
        this._checkZombieReachedHouse()
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

    hasItemAt(x: number, y: number) {
        return this._findItemAt(x, y) !== null
    }

    hasPlantAt(x: number, y: number) {
        return this._findPlantAt(x, y) !== null
    }

    canAffordSeed(seedType: SeedType) {
        return this._canSpendSun(SEED_DEFINITIONS[seedType].cost)
    }

    addZombie(type: ZombieType, row: number, x?: number, fromWave = -1) {
        if (!this.level.activeRows.includes(row)) return null
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
        return this.level.adventureLevel === 1 &&
            seedType === 'peashooter' &&
            !this.selectedSeed &&
            !!packet &&
            packet.active &&
            packet.cooldownRemaining <= 0 &&
            this.canAffordSeed(seedType) &&
            (this._levelOneTutorialPhase === 'pick-first-seed' ||
                this._levelOneTutorialPhase === 'pick-second-seed')
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
            this.events.push({ type: 'soundRequested', sound: SoundEffect.Buzzer })
            this.events.push({ type: 'advice', message: 'You need more sun to do that!', style: 'hint' })
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
                this.events.push({ type: 'advice', message: 'You need more sun to do that!', style: 'hint' })
                this.events.push({ type: 'soundRequested', sound: SoundEffect.Buzzer })
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
        this.sun -= seed.cost

        const packet = this.seedPackets.find((item) => item.seedType === seedType)
        if (packet) packet.cooldownRemaining = seed.cooldownTicks
        this._clearCursor()
        this.events.push({ type: 'entitySpawned', entityId: plant.id })
        this.events.push({ type: 'soundRequested', sound: SoundEffect.Plant })
        this._handleLevelOneTutorialPlantPlaced(plant, isFirstPlant)
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
    }

    private _updateSeedPackets() {
        for (const packet of this.seedPackets) {
            if (packet.cooldownRemaining > 0) packet.cooldownRemaining--
            if (packet.cooldownRemaining <= 0 && !packet.selected) packet.active = true
        }
    }

    private _updatePlants() {
        const plantEvents: GameEvent[] = []
        const context = {
            events: plantEvents,
            hasTargetInRow: (row: number, plant: Plant) => this._hasTargetInRow(row, plant),
            hasTargetInPlantAttackRect: (plant: Plant) => this._hasTargetInPlantAttackRect(plant),
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
                this._addItem('sun', 'from-plant', event.x, event.y)
            } else if (event.type === 'projectileFired') {
                this._addProjectile(event.projectileType, event.x, event.y, event.row)
                this.events.push(event)
            } else {
                this.events.push(event)
            }
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
                if (projectile.type === 'snowpea') target.applyChill(this.events)
                target.takeDamage(projectile.damage, {
                    zombieCount: this._countLiveZombies(),
                    canUseSuperLongDeath: this._canUseSuperLongDeath(),
                })
            },
        }

        for (const projectile of this.projectiles) {
            projectile.update(context)
        }
    }

    private _updateItems() {
        const context = this._createItemUpdateContext(this.events)
        for (const item of this.items) {
            item.update(context)
        }
    }

    private _updateZombies() {
        const context = {
            events: this.events,
            zombieCount: this._countLiveZombies(),
            canUseSuperLongDeath: this._canUseSuperLongDeath(),
            findPlantTarget: (zombie: Zombie) => this._findZombiePlantTarget(zombie),
            damagePlant: (plant: PlantEntity, damage: number) => {
                plant.health = Math.max(0, plant.health - damage)
                if (plant.health <= 0) plant.dead = true
            },
            randomInt: (minInclusive: number, maxInclusive: number) =>
                this._randomInt(minInclusive, maxInclusive),
            randomFloat: (minInclusive: number, maxExclusive: number) =>
                this._randomFloat(minInclusive, maxExclusive),
        }

        for (const zombie of this.zombies) {
            zombie.update(context)
        }
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
            if (zombie.state === 'mowered') continue
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
            randomInt: (minInclusive: number, maxInclusive: number) =>
                this._randomInt(minInclusive, maxInclusive),
            randomFloat: (minInclusive: number, maxExclusive: number) =>
                this._randomFloat(minInclusive, maxExclusive),
        }
    }

    private _addSun(amount: number) {
        this.sun += amount
        this._handleLevelOneTutorialSunBanked()
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

        if (isFirstPlant) {
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
            this.events.push({ type: 'advice', message: 'A HUGE WAVE OF ZOMBIES IS APPROACHING!', style: 'huge-wave' })
            this._hugeWaveCountDown = ZOMBIE_COUNTDOWN_BEFORE_HUGE_WAVE
            return
        }
        if (this.zombieCountDown > 0) {
            if (this.zombieCountDown === HUGE_WAVE_WARNING_COUNTDOWN) this._nextWaveComing()
            return
        }

        this._spawnZombieWave(this.currentWave)
        this._zombieHealthWaveStart = this._totalZombiesHealthInWave(this.currentWave)
        this._zombieHealthToNextWave = this._randomFloat(0.5, 0.65) * this._zombieHealthWaveStart
        this.currentWave++
        this.zombieCountDown = ZOMBIE_COUNTDOWN + this._randomInt(0, ZOMBIE_COUNTDOWN_RANGE - 1)
        this.zombieCountDownStart = this.zombieCountDown
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
            if (zombie.fromWave !== waveIndex || zombie.dead || zombie.state === 'dying') continue
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
        }
        return true
    }

    private _nextWaveComing() {
        if (this.currentWave + 1 === this.numWaves) {
            this.events.push({ type: 'advice', message: 'FINAL WAVE', style: 'big-middle' })
            this._finalWaveSoundCounter = FINAL_WAVE_SOUND_DELAY
        }
    }

    private _updateFinalWaveSound() {
        if (this._finalWaveSoundCounter <= 0) return

        this._finalWaveSoundCounter--
        if (this._finalWaveSoundCounter === 0) {
            this.events.push({ type: 'soundRequested', sound: SoundEffect.FinalWave })
        }
    }

    private _isFlagWave(waveIndex: number) {
        return this.level.zombieWaves[waveIndex]?.flagWave === true
    }

    private _pickRowForNewZombie(_zombieType: ZombieType) {
        if (this.level.activeRows.length === 0) return 0
        return this.level.activeRows[this._randomInt(0, this.level.activeRows.length - 1)]
    }

    private _addItem(type: ItemType, motion: ItemMotion, x: number, y: number) {
        const item = createItem({
            id: this._allocateId(),
            type,
            motion,
            x,
            y,
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
            if (!this._isZombieDamageableForProjectile(zombie)) return false
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
            this._isZombieDamageableForProjectile(zombie) &&
            this._rectOverlapX(attackRect, zombie.getBodyRect()) > 0)
    }

    private _findPlantAt(x: number, y: number) {
        const grid = this.geometry.pixelToGrid(x, y)
        if (!grid) return null

        for (let i = this.plants.length - 1; i >= 0; i--) {
            const plant = this.plants[i]
            if (!plant.dead && plant.col === grid.col && plant.row === grid.row) return plant
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

        this._levelWonNotified = true
        this.events.push({ type: 'levelWon' })
    }

    private _checkZombieReachedHouse() {
        if (this.result !== 'playing') return
        if (!this.zombies.some((zombie) => !zombie.dead && zombie.x < ZOMBIE_REACHED_HOUSE_X)) return

        this.result = 'lost'
        this.events.push({ type: 'levelLost' })
    }

    private _pushAdvice() {
        if (this._adviceIndex >= this.level.tutorialAdvice.length) return
        this.events.push({ type: 'advice', message: this.level.tutorialAdvice[this._adviceIndex], style: 'tutorial-level1-stay' })
        this._adviceIndex++
    }

    private _pushLevelOneTutorialAdvice(message: string, style: 'tutorial-level1' | 'tutorial-level1-stay' = 'tutorial-level1-stay') {
        this.events.push({ type: 'advice', message, style })
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
            if (!this._isZombieDamageableForProjectile(zombie)) continue
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

    private _isZombieDamageableForProjectile(zombie: Zombie) {
        if (zombie.dead || zombie.state === 'dying' || zombie.state === 'mowered') return false
        return this._isZombieVisibleForPlantTarget(zombie)
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
