import {
    ADVENTURE_1_1,
    DAY_GEOMETRY,
    PLANT_DEFINITIONS,
    SEED_DEFINITIONS,
} from './GameDefinitions'
import type {
    GameCommand,
    GameEntity,
    GameEvent,
    GameResult,
    LevelDefinition,
    PlantEntity,
    SeedPacketState,
    SeedType,
} from './GameTypes'

export class GameSession {
    readonly level: LevelDefinition
    readonly geometry = DAY_GEOMETRY
    readonly seedPackets: SeedPacketState[]
    readonly plants: PlantEntity[] = []
    readonly events: GameEvent[] = []

    tick = 0
    sun = 0
    result: GameResult = 'playing'
    selectedSeed: SeedType | null = null

    private _nextEntityId = 1
    private _adviceIndex = 0

    constructor(level: LevelDefinition = ADVENTURE_1_1) {
        this.level = level
        this.sun = level.startingSun
        this.seedPackets = level.seedPackets.map((seedType) => ({
            seedType,
            cooldownRemaining: 0,
            selected: false,
        }))
        this._pushAdvice()
    }

    allEntities(): GameEntity[] {
        return [...this.plants]
    }

    drainEvents(): GameEvent[] {
        return this.events.splice(0)
    }

    dispatch(command: GameCommand) {
        if (command.type === 'pause') return
        if (command.type === 'resume') return
        if (this.result !== 'playing' && command.type !== 'clearCursor') return

        switch (command.type) {
            case 'selectSeed':
                this._selectSeed(command.seedType)
                break
            case 'placePlant':
                this._placeSelectedSeed(command.x, command.y)
                break
            case 'clearCursor':
                this._clearCursor()
                break
        }
    }

    update() {
        if (this.result !== 'playing') return

        this.tick++
        this._updateSeedPackets()
        this._updatePlants()
        this._removeDeadEntities()
    }

    canPlant(seedType: SeedType, col: number, row: number) {
        const seed = SEED_DEFINITIONS[seedType]
        const packet = this.seedPackets.find((item) => item.seedType === seedType)
        if (!seed || !packet) return false
        if (!this.level.activeRows.includes(row)) return false
        if (col < 0 || col >= this.geometry.cols) return false
        if (this.sun < seed.cost || packet.cooldownRemaining > 0) return false
        return !this.plants.some((plant) => !plant.dead && plant.col === col && plant.row === row)
    }

    private _selectSeed(seedType: SeedType) {
        const packet = this.seedPackets.find((item) => item.seedType === seedType)
        if (!packet || packet.cooldownRemaining > 0) return
        if (this.sun < SEED_DEFINITIONS[seedType].cost) return

        this.selectedSeed = this.selectedSeed === seedType ? null : seedType
        for (const item of this.seedPackets) {
            item.selected = item.seedType === this.selectedSeed
        }
        this.events.push({ type: 'soundRequested', sound: 'seedlift' })
    }

    private _placeSelectedSeed(x: number, y: number) {
        if (!this.selectedSeed) return
        const grid = this.geometry.pixelToGrid(x, y)
        if (!grid || !this.canPlant(this.selectedSeed, grid.col, grid.row)) return

        const seed = SEED_DEFINITIONS[this.selectedSeed]
        const plantDef = PLANT_DEFINITIONS[seed.plantType]
        const pixel = this.geometry.gridToPixel(grid.col, grid.row)
        const plant: PlantEntity = {
            id: this._allocateId(),
            kind: 'plant',
            type: seed.plantType,
            col: grid.col,
            row: grid.row,
            x: pixel.x,
            y: pixel.y + 90,
            health: plantDef.maxHealth,
            attackCounter: plantDef.firstAttackDelayTicks,
            shootingCounter: 0,
            dead: false,
        }
        this.plants.push(plant)
        this.sun -= seed.cost

        const packet = this.seedPackets.find((item) => item.seedType === this.selectedSeed)
        if (packet) packet.cooldownRemaining = seed.cooldownTicks
        this._clearCursor()
        this.events.push({ type: 'entitySpawned', entityId: plant.id })
        this.events.push({ type: 'soundRequested', sound: 'plant' })
    }

    private _clearCursor() {
        this.selectedSeed = null
        for (const item of this.seedPackets) item.selected = false
    }

    private _updateSeedPackets() {
        for (const packet of this.seedPackets) {
            if (packet.cooldownRemaining > 0) packet.cooldownRemaining--
        }
    }

    private _updatePlants() {
        for (const plant of this.plants) {
            if (plant.dead) continue
            if (plant.shootingCounter > 0) plant.shootingCounter--
        }
    }

    private _removeDeadEntities() {
        this._removeDead(this.plants)
    }

    private _removeDead<T extends { id: number, dead: boolean }>(items: T[]) {
        for (let i = items.length - 1; i >= 0; i--) {
            if (!items[i].dead) continue
            this.events.push({ type: 'entityRemoved', entityId: items[i].id })
            items.splice(i, 1)
        }
    }

    private _pushAdvice() {
        if (this._adviceIndex >= this.level.tutorialAdvice.length) return
        this.events.push({ type: 'advice', message: this.level.tutorialAdvice[this._adviceIndex] })
        this._adviceIndex++
    }

    private _allocateId() {
        return this._nextEntityId++
    }
}
