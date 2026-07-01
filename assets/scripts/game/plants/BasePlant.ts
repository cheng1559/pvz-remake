import { PLANT_DEFINITIONS } from '../GameDefinitions'
import type { GameEvent, PlantBodyAnimationState, PlantEntity, PlantState, PlantSubclass, PlantType } from '../GameTypes'

export interface PlantUpdateContext {
    events: GameEvent[]
    hasTargetInRow(row: number, plant: Plant): boolean
    hasTargetInPlantAttackRect(plant: Plant): boolean
    biteChomperTarget(plant: Plant): 'ate' | 'bit' | 'missed'
    canProduceSun(): boolean
    randomInt(minInclusive: number, maxInclusive: number): number
}

const BLINK_COUNTDOWN_MIN = 400
const BLINK_COUNTDOWN_RANGE = 400
const NUT_BLINK_COUNTDOWN_MIN = 1000
const NUT_BLINK_COUNTDOWN_RANGE = 1000
const NUT_BLINK_TWITCH_CHANCE = 1
const NUT_BLINK_TWICE_CHANCE = 7

export interface PlantCreateArgs {
    id: number
    type: PlantType
    col: number
    row: number
    x: number
    y: number
    bowlingAnimRate?: number
}

export abstract class Plant implements PlantEntity {
    readonly id: number
    readonly kind = 'plant' as const
    readonly type: PlantType
    readonly subclass: PlantSubclass
    readonly col: number
    row: number
    x: number
    y: number
    readonly maxHealth: number
    readonly launchRate: number

    health: number
    launchCounter: number
    attackCounter: number
    shootingCounter = 0
    specialCounter = 0
    animationSpeed = 0
    animationTime = 0
    bodyAnimation: PlantBodyAnimationState | null = null
    eatenFlashCounter = 0
    recentlyEatenCounter = 0
    isBowling: boolean
    bowlingAnimRate: number
    bowlingAnimationTime = 0
    bowlingHitCount = 0
    state: PlantState = 'not-ready'
    stateCountdown = 0
    closestZombieDistance = 1000
    dead = false
    protected blinkCountdown: number

    protected constructor(args: PlantCreateArgs, subclass: PlantSubclass) {
        const definition = PLANT_DEFINITIONS[args.type]
        this.id = args.id
        this.type = args.type
        this.subclass = subclass
        this.col = args.col
        this.row = args.row
        this.x = args.x
        this.y = args.y
        this.isBowling = args.bowlingAnimRate != null
        this.bowlingAnimRate = args.bowlingAnimRate ?? 0
        this.maxHealth = definition.maxHealth
        this.health = definition.maxHealth
        this.launchRate = definition.attackCadenceTicks
        this.launchCounter = definition.firstAttackDelayTicks
        this.attackCounter = this.launchCounter
        this.blinkCountdown = this.initialBlinkCountdown()
    }

    update(context: PlantUpdateContext) {
        if (this.dead) return
        this.updateShooting(context)
        if (this.stateCountdown > 0) this.stateCountdown--
        this.updateAbilities(context)
        this.updateBlink(context)
        if (this.eatenFlashCounter > 0) this.eatenFlashCounter--
        if (this.recentlyEatenCounter > 0) this.recentlyEatenCounter--
        this.attackCounter = this.launchCounter
    }

    takeChewDamage(damage: number, context?: PlantUpdateContext) {
        const previousState = this.state
        this.health = Math.max(0, this.health - damage)
        this.updateDamageState()
        if (context && this.state !== previousState) this.onDamageStateChanged(context)
        if (this.health <= 0) this.dead = true
    }

    protected onDamageStateChanged(_context: PlantUpdateContext) {
    }

    protected updateAbilities(_context: PlantUpdateContext) {
    }

    protected updateDamageState() {
    }

    protected updateShooting(_context: PlantUpdateContext) {
        if (this.shootingCounter > 0) this.shootingCounter--
    }

    handleAnimationFinished(_animation: string, _context: PlantUpdateContext) {
    }

    protected canBlink() {
        return this.type !== 'cherrybomb' && this.shootingCounter === 0
    }

    private updateBlink(context: PlantUpdateContext) {
        if (this.blinkCountdown <= 0) return

        this.blinkCountdown--
        if (this.blinkCountdown !== 0) return

        this.doBlink(context)
    }

    private doBlink(context: PlantUpdateContext) {
        this.blinkCountdown = this.nextBlinkCountdown(context)
        if (!this.canBlink()) return

        context.events.push({
            type: 'animationRequested',
            entityId: this.id,
            animation: this.pickBlinkAnimation(context),
        })
    }

    private initialBlinkCountdown() {
        if (this.usesNutBlinkTiming()) {
            return NUT_BLINK_COUNTDOWN_MIN + Math.floor(Math.random() * NUT_BLINK_COUNTDOWN_RANGE)
        }

        return BLINK_COUNTDOWN_MIN + Math.floor(Math.random() * BLINK_COUNTDOWN_RANGE)
    }

    private nextBlinkCountdown(context: PlantUpdateContext) {
        if (this.usesNutBlinkTiming()) {
            return context.randomInt(NUT_BLINK_COUNTDOWN_MIN, NUT_BLINK_COUNTDOWN_MIN + NUT_BLINK_COUNTDOWN_RANGE - 1)
        }

        return context.randomInt(BLINK_COUNTDOWN_MIN, BLINK_COUNTDOWN_MIN + BLINK_COUNTDOWN_RANGE - 1)
    }

    private pickBlinkAnimation(context: PlantUpdateContext) {
        if (this.type === 'wallnut' || this.type === 'explodenut') {
            const hit = context.randomInt(0, 9)
            if (hit < NUT_BLINK_TWITCH_CHANCE) return 'anim_blink_twitch'
            return hit < NUT_BLINK_TWICE_CHANCE ? 'anim_blink_twice' : 'anim_blink_thrice'
        }

        return 'anim_blink'
    }

    private usesNutBlinkTiming() {
        return this.type === 'wallnut' || this.type === 'explodenut'
    }
}
