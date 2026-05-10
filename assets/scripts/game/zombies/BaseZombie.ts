import { ZOMBIE_DEFINITIONS } from '../GameDefinitions'
import { SoundEffect } from '@/core/SoundLoader'
import type { GameEvent, PlantEntity, Rect, ZombieEntity, ZombieState, ZombieSubclass, ZombieType } from '../GameTypes'

const ZOMBIE_START_X = 780
const ZOMBIE_START_RANDOM_OFFSET = 40
const TICKS_BETWEEN_EATS = 4
const DAMAGE_PER_EAT = TICKS_BETWEEN_EATS
const CHEW_SOUND_INTERVAL = 50
const GROAN_COUNTDOWN_MIN = 300
const GROAN_COUNTDOWN_MAX = 400
const GROAN_REPEAT_MIN = 500
const GROAN_REPEAT_MAX = 1499
const ARM_DROP_HEALTH = 180
const HEAD_DROP_HEALTH = 90
const HEADLESS_DECAY_CHANCE = 5
const HEADLESS_DECAY_DAMAGE = 1
const CHILLED_TICKS = 1000
const CHILLED_SPEED_FACTOR = 0.5
const ZOMBIE_WALK_ASSET_FPS = 12
const GAME_TICKS_PER_SECOND = 100
const ZOMBIE_EAT_ANIM_RATE = 36
const ZOMBIE_EAT_FRAME_SPAN = 39
const ZOMBIE_DEATH_ANIM_RATE_MIN = 24
const ZOMBIE_DEATH_ANIM_RATE_MAX = 30
const ZOMBIE_SUPER_LONG_DEATH_ANIM_RATE = 14
const ZOMBIE_SUPER_LONG_DEATH_HIT = 99
const ZOMBIE_DEATH2_HIT_MIN = 51
const ZOMBIE_DEATH_FRAME_SPAN = 38
const ZOMBIE_DEATH2_FRAME_SPAN = 32
const ZOMBIE_SUPER_LONG_DEATH_FRAME_SPAN = 136
const ZOMBIE_WATER_DEATH_FRAME_SPAN = 24
const ZOMBIE_DEATH_HOLD_TICKS = 40
const ZOMBIE_MOWERED_ANIM_RATE = 16
const ZOMBIE_MOWERED_FRAME_COUNT = 8
const ZOMBIE_MOWERED_FRAME_SPAN = ZOMBIE_MOWERED_FRAME_COUNT - 1
const ZOMBIE_MOWERED_TICKS = Math.ceil(
    ZOMBIE_MOWERED_FRAME_COUNT / ZOMBIE_MOWERED_ANIM_RATE * GAME_TICKS_PER_SECOND,
)
const ZOMBIE_DEATH_FALL_TIME = 0.77
const ZOMBIE_DEATH2_FALL_TIME = 0.71
const ZOMBIE_SUPER_LONG_DEATH_FALL_TIME = 0.788
const ZOMBIE_REANIM_WALK_RATE_FACTOR = 47
const SECONDS_PER_UPDATE = 0.01
const ZOMBIE_WALK_GROUND_X = [
    -9.8, -8.4, -7.0, -5.6, -4.1, -2.7, -1.3, 0.0, 1.4, 2.8, 4.2, 5.7,
    7.1, 7.9, 8.8, 9.7, 10.5, 10.6, 10.8, 10.9, 11.0, 11.0, 11.0, 11.0,
    11.0, 13.4, 15.8, 18.1, 20.5, 22.8, 25.2, 27.6, 29.9, 31.1, 32.3,
    33.5, 34.6, 35.9, 37.0, 38.2, 39.4, 39.5, 39.6, 39.7, 39.8, 39.9, 40.0,
]
const ZOMBIE_WALK_FRAME_SPAN = ZOMBIE_WALK_GROUND_X.length - 1
const ZOMBIE_WALK_FRAME_COUNT = ZOMBIE_WALK_GROUND_X.length
const ZOMBIE_WALK_GROUND_DISTANCE = ZOMBIE_WALK_GROUND_X[ZOMBIE_WALK_GROUND_X.length - 1] - ZOMBIE_WALK_GROUND_X[0]

export interface ZombieUpdateContext {
    events: GameEvent[]
    zombieCount: number
    canUseSuperLongDeath: boolean
    findPlantTarget(zombie: Zombie): PlantEntity | null
    damagePlant(plant: PlantEntity, damage: number): void
    checkBoardEdge(zombie: Zombie): boolean
    randomInt(minInclusive: number, maxInclusive: number): number
    randomFloat(minInclusive: number, maxExclusive: number): number
}

export interface ZombieDeathContext {
    zombieCount: number
    canUseSuperLongDeath: boolean
}

export interface ZombieCreateArgs {
    id: number
    type: ZombieType
    fromWave?: number
    row: number
    x?: number
    y: number
    velocityX?: number
    hasTongue?: boolean
    inPool?: boolean
}

export abstract class Zombie implements ZombieEntity {
    readonly id: number
    readonly kind = 'zombie' as const
    readonly type: ZombieType
    readonly subclass: ZombieSubclass
    readonly fromWave: number
    readonly row: number
    readonly maxHealth: number
    readonly helmType: ZombieEntity['helmType']
    readonly helmMaxHealth: number
    readonly shieldType: ZombieEntity['shieldType']
    readonly shieldMaxHealth: number
    readonly bodyRect: Rect
    readonly attackRect: Rect

    x: number
    y: number
    velocityX: number
    currentAnimation: string
    animationSpeed: number
    animationTime: number
    moweredTime = 0
    health: number
    helmHealth: number
    shieldHealth: number
    state: ZombieState = 'walking'
    age = 0
    chilledCounter = 0
    hasHead = true
    hasArm = true
    hasTongue = false
    hasObject = false
    inPool: boolean
    dead = false

    private _eatCounter = TICKS_BETWEEN_EATS
    private _chewSoundCounter = 0
    private _groanCounter = GROAN_COUNTDOWN_MIN
    private _deathCounter = 0
    private _deathFallSoundPlayed = false
    private _deathFrameSpan = ZOMBIE_DEATH_FRAME_SPAN
    private _deathFallTime = ZOMBIE_DEATH_FALL_TIME
    private _boardX = 0
    private _walkGroundTime = 0
    private _walkAnimation: string
    private _pendingEvents: GameEvent[] = []

    protected constructor(args: ZombieCreateArgs, subclass: ZombieSubclass) {
        const definition = ZOMBIE_DEFINITIONS[args.type]
        this.id = args.id
        this.type = args.type
        this.subclass = subclass
        this.fromWave = args.fromWave ?? -1
        this.row = args.row
        this.x = args.x ?? ZOMBIE_START_X + Math.floor(Math.random() * ZOMBIE_START_RANDOM_OFFSET)
        this.y = args.y
        this.maxHealth = definition.maxHealth
        this.health = definition.maxHealth
        this.helmType = definition.helmType
        this.helmHealth = definition.helmHealth
        this.helmMaxHealth = definition.helmHealth
        this.shieldType = definition.shieldType
        this.shieldHealth = definition.shieldHealth
        this.shieldMaxHealth = definition.shieldHealth
        this.bodyRect = { ...definition.bodyRect }
        this.attackRect = { ...definition.attackRect }
        this.velocityX = args.velocityX ?? definition.velocityXMin + Math.random() * (definition.velocityXMax - definition.velocityXMin)
        this.hasObject = definition.hasFlag || definition.hasFloat
        this.hasTongue = args.hasTongue ?? (this._canHaveTongue(args.type) && Math.random() < 0.2)
        this.inPool = args.inPool ?? definition.hasFloat
        this._walkAnimation = this._pickWalkAnimation(args.type)
        this.currentAnimation = this.inPool ? 'anim_swim' : this._walkAnimation
        this.animationSpeed = this._walkAnimationSpeed()
        this.animationTime = 0
        this._boardX = Math.trunc(this.x)
        this._groanCounter = GROAN_COUNTDOWN_MIN + Math.floor(Math.random() * (GROAN_COUNTDOWN_MAX - GROAN_COUNTDOWN_MIN + 1))
    }

    update(context: ZombieUpdateContext) {
        if (this.dead) return

        this._flushPendingEvents(context)
        this.age++
        this._boardX = Math.trunc(this.x)
        if (this.state === 'dying') {
            this._updateChill()
            this.updateDying(context)
            return
        }
        if (this.state === 'mowered') {
            this._updateChill()
            this.updateMowered()
            return
        }

        this._updateChill()
        const target = context.findPlantTarget(this)
        if (target) {
            this.updateEating(context, target)
            context.checkBoardEdge(this)
        } else if (!this.hasHead) {
            this.updateHeadless(context)
        } else {
            this.updateWalking(context)
            context.checkBoardEdge(this)
        }
    }

    takeDamage(damage: number, deathContext: ZombieDeathContext = { zombieCount: 1, canUseSuperLongDeath: false }) {
        if (this.state === 'dying' || this.state === 'mowered') return

        let remainingDamage = damage
        if (this.shieldHealth > 0) {
            const absorbed = Math.min(this.shieldHealth, remainingDamage)
            this.shieldHealth -= absorbed
            remainingDamage -= absorbed
        }
        if (this.helmHealth > 0 && remainingDamage > 0) {
            const absorbed = Math.min(this.helmHealth, remainingDamage)
            this.helmHealth -= absorbed
            remainingDamage -= absorbed
        }
        if (remainingDamage > 0) {
            this.health = Math.max(0, this.health - remainingDamage)
            this._updateDamageStates()
        }
        if (this.health <= 0) this.startDeathAnimation(deathContext)
    }

    applyChill(events: GameEvent[]) {
        if (this.state === 'dying' || this.state === 'mowered') return
        if (this.chilledCounter <= 0) {
            events.push({ type: 'foleyRequested', sound: SoundEffect.Frozen })
        }
        this.chilledCounter = Math.max(this.chilledCounter, CHILLED_TICKS)
    }

    mowDown() {
        if (this.dead || this.state === 'mowered') return

        this.state = 'mowered'
        this.health = 0
        this.helmHealth = 0
        this.shieldHealth = 0
        this.hasTongue = false
        this.velocityX = 0
        this.animationTime = 0
        this.animationSpeed = ZOMBIE_MOWERED_ANIM_RATE / ZOMBIE_WALK_ASSET_FPS
        this.moweredTime = 0
        this.currentAnimation = 'default'
    }

    protected updateMowered() {
        this.moweredTime++
        this.animationTime = Math.min(
            ZOMBIE_MOWERED_FRAME_SPAN,
            this.animationTime + ZOMBIE_MOWERED_FRAME_SPAN / ZOMBIE_MOWERED_TICKS,
        )
        if (this.moweredTime >= ZOMBIE_MOWERED_TICKS) {
            this.dead = true
        }
    }

    getBodyRect(): Rect {
        return this.offsetRect(this.bodyRect)
    }

    getAttackRect(): Rect {
        return this.offsetRect(this.attackRect)
    }

    getBoardX() {
        return this._boardX
    }

    protected updateWalking(context: ZombieUpdateContext) {
        const animation = this.inPool ? 'anim_swim' : this._walkAnimation
        const speed = this._walkAnimationSpeed()
        if (this.state !== 'walking') {
            this.state = 'walking'
            this._walkGroundTime = 0
            this._requestAnimation(context, animation, speed)
        } else {
            this.currentAnimation = animation
            this.animationSpeed = speed
        }
        this.x -= this.inPool ? this._chilledAnimSpeed(this.velocityX) : this._advanceWalkGroundDistance()
        if (this.inPool) this.animationTime = this._advanceLoopingAnimationTime(this.animationTime, this.animationSpeed, ZOMBIE_WALK_FRAME_SPAN)
        this._updateGroan(context)
        this._eatCounter = TICKS_BETWEEN_EATS
        this._chewSoundCounter = 0
    }

    protected updateEating(context: ZombieUpdateContext, target: PlantEntity) {
        if (this.state !== 'eating') {
            this.state = 'eating'
            this._eatCounter = TICKS_BETWEEN_EATS
            this._chewSoundCounter = 0
            this._requestAnimation(context, 'anim_eat', this._chilledAnimSpeed(ZOMBIE_EAT_ANIM_RATE / ZOMBIE_WALK_ASSET_FPS))
        } else {
            this.currentAnimation = 'anim_eat'
            this.animationSpeed = this._chilledAnimSpeed(ZOMBIE_EAT_ANIM_RATE / ZOMBIE_WALK_ASSET_FPS)
        }
        this.animationTime = this._advanceLoopingAnimationTime(this.animationTime, this.animationSpeed, ZOMBIE_EAT_FRAME_SPAN)

        if (!this.hasHead) {
            this._chewSoundCounter = 0
            this._updateHeadlessDecay(context)
            return
        }

        this._eatCounter--
        this._chewSoundCounter--
        if (this._chewSoundCounter <= 0) {
            const sound = target.type === 'wallnut'
                ? SoundEffect.ChompSoft
                : context.randomInt(0, 1) === 0 ? SoundEffect.Chomp : SoundEffect.Chomp2
            context.events.push({ type: 'foleyRequested', sound })
            this._chewSoundCounter = CHEW_SOUND_INTERVAL
        }

        if (this._eatCounter <= 0) {
            context.damagePlant(target, DAMAGE_PER_EAT)
            this._eatCounter = TICKS_BETWEEN_EATS
        }
    }

    protected startDeathAnimation(deathContext: ZombieDeathContext = { zombieCount: 1, canUseSuperLongDeath: false }) {
        if (this.state === 'dying') return

        this.state = 'dying'
        this.velocityX = 0
        this.hasTongue = false
        this._pickDeathAnimation(deathContext)
        this.animationTime = 0
        this._deathFallSoundPlayed = false
        this._deathCounter = Math.ceil(this._deathFrameSpan / (this.animationSpeed * ZOMBIE_WALK_ASSET_FPS / GAME_TICKS_PER_SECOND)) + ZOMBIE_DEATH_HOLD_TICKS
    }

    protected updateDying(context: ZombieUpdateContext) {
        this.animationTime = Math.min(
            this._deathFrameSpan,
            this.animationTime + this.animationSpeed * ZOMBIE_WALK_ASSET_FPS / GAME_TICKS_PER_SECOND,
        )
        if (!this._deathFallSoundPlayed && this.animationTime >= this._deathFrameSpan * this._deathFallTime) {
            context.events.push({ type: 'foleyRequested', sound: this._randomZombieFallingSound(context), pitchRange: 10 })
            this._deathFallSoundPlayed = true
        }
        this._deathCounter--
        if (this._deathCounter <= 0) {
            this.dead = true
        }
    }

    protected updateHeadless(context: ZombieUpdateContext) {
        this.updateWalking(context)
        if (context.checkBoardEdge(this)) return
        this._updateHeadlessDecay(context)
    }

    walkIntoHouse() {
        if (this.dead) return

        this.state = 'walking'
        this.y = 290
        this.currentAnimation = this.inPool ? 'anim_swim' : this._walkAnimation
        this.animationSpeed = this._walkAnimationSpeed()
    }

    advanceGameOverWalk(ticks: number) {
        if (this.dead || ticks <= 0) return

        this.state = 'walking'
        this.currentAnimation = this.inPool ? 'anim_swim' : this._walkAnimation
        this.animationSpeed = this._walkAnimationSpeed()
        this.x -= this.inPool
            ? this._chilledAnimSpeed(this.velocityX) * ticks
            : this._advanceWalkGroundDistance(ticks)
        if (this.inPool) {
            this.animationTime = this._advanceLoopingAnimationTime(
                this.animationTime,
                this.animationSpeed,
                ZOMBIE_WALK_FRAME_SPAN,
                ticks,
            )
        }
    }

    private _updateHeadlessDecay(context: ZombieUpdateContext) {
        if (context.randomInt(0, HEADLESS_DECAY_CHANCE - 1) === 0) {
            this.health = Math.max(0, this.health - HEADLESS_DECAY_DAMAGE)
            if (this.health <= 0) this.startDeathAnimation(context)
        }
    }

    private offsetRect(rect: Rect): Rect {
        return {
            x: this.x + rect.x,
            y: this.y + rect.y,
            width: rect.width,
            height: rect.height,
        }
    }

    private _requestAnimation(context: ZombieUpdateContext, animation: string, speed: number) {
        this.currentAnimation = animation
        this.animationSpeed = speed
        this.animationTime = 0
        context.events.push({ type: 'animationRequested', entityId: this.id, animation })
    }

    private _pickWalkAnimation(type: ZombieType) {
        if (type === 'flag') return 'anim_walk'
        return Math.random() < 0.5 ? 'anim_walk' : 'anim_walk2'
    }

    private _walkAnimationSpeed() {
        if (this.inPool) return this._chilledAnimSpeed(1)

        return this._chilledAnimSpeed(this._walkAnimRate() / ZOMBIE_WALK_ASSET_FPS)
    }

    private _advanceWalkGroundDistance(ticks = 1) {
        const frameAdvance = this._walkFrameAdvance(ticks)
        let nextTime = this._walkGroundTime + frameAdvance
        const previousX = this._sampleWalkGroundX(this._walkGroundTime)

        if (nextTime < ZOMBIE_WALK_FRAME_SPAN) {
            const nextX = this._sampleWalkGroundX(nextTime)
            this._walkGroundTime = nextTime
            this.animationTime = nextTime
            return nextX - previousX
        }

        let distance = ZOMBIE_WALK_GROUND_X[ZOMBIE_WALK_GROUND_X.length - 1] - previousX
        nextTime -= ZOMBIE_WALK_FRAME_SPAN
        while (nextTime >= ZOMBIE_WALK_FRAME_SPAN) {
            distance += ZOMBIE_WALK_GROUND_DISTANCE
            nextTime -= ZOMBIE_WALK_FRAME_SPAN
        }
        distance += this._sampleWalkGroundX(nextTime) - ZOMBIE_WALK_GROUND_X[0]
        this._walkGroundTime = nextTime
        this.animationTime = nextTime
        return distance
    }

    private _sampleWalkGroundX(time: number) {
        const leftIndex = Math.max(0, Math.min(ZOMBIE_WALK_GROUND_X.length - 1, Math.floor(time)))
        const rightIndex = Math.min(ZOMBIE_WALK_GROUND_X.length - 1, leftIndex + 1)
        const t = time - leftIndex
        return ZOMBIE_WALK_GROUND_X[leftIndex] + (ZOMBIE_WALK_GROUND_X[rightIndex] - ZOMBIE_WALK_GROUND_X[leftIndex]) * t
    }

    private _advanceLoopingAnimationTime(time: number, speed: number, frameSpan: number, ticks = 1) {
        if (frameSpan <= 0) return 0

        const frameAdvance = speed * ZOMBIE_WALK_ASSET_FPS / GAME_TICKS_PER_SECOND * ticks
        return (time + frameAdvance) % frameSpan
    }

    private _walkAnimRate() {
        return this.velocityX * ZOMBIE_WALK_FRAME_COUNT / ZOMBIE_WALK_GROUND_DISTANCE * ZOMBIE_REANIM_WALK_RATE_FACTOR
    }

    private _walkFrameAdvance(ticks = 1) {
        return this._chilledAnimSpeed(this._walkAnimRate()) * SECONDS_PER_UPDATE * ticks
    }

    private _updateChill() {
        if (this.chilledCounter > 0) this.chilledCounter--
    }

    private _chilledAnimSpeed(speed: number) {
        return this.chilledCounter > 0 ? speed * CHILLED_SPEED_FACTOR : speed
    }

    private _updateDamageStates() {
        if (this.hasArm && this.health < ARM_DROP_HEALTH && this.health > 0) {
            this.hasArm = false
            this._pendingEvents.push({ type: 'foleyRequested', sound: SoundEffect.LimbsPop, pitchRange: 10 })
        }
        if (this.hasHead && this.health < HEAD_DROP_HEALTH) {
            this.hasHead = false
            this.hasTongue = false
            this._pendingEvents.push({ type: 'foleyRequested', sound: SoundEffect.LimbsPop, pitchRange: 10 })
        }
    }

    private _canHaveTongue(type: ZombieType) {
        return type === 'normal' || type === 'flag' || type === 'traffic-cone' || type === 'bucket'
    }

    private _randomDeathAnimRate() {
        return ZOMBIE_DEATH_ANIM_RATE_MIN + Math.random() * (ZOMBIE_DEATH_ANIM_RATE_MAX - ZOMBIE_DEATH_ANIM_RATE_MIN)
    }

    private _pickDeathAnimation(deathContext: ZombieDeathContext) {
        const deathHit = Math.floor(Math.random() * 100)
        if (this.inPool) {
            this.currentAnimation = 'anim_waterdeath'
            this.animationSpeed = this._randomDeathAnimRate() / ZOMBIE_WALK_ASSET_FPS
            this._deathFrameSpan = ZOMBIE_WATER_DEATH_FRAME_SPAN
            this._deathFallTime = ZOMBIE_DEATH_FALL_TIME
            return
        }

        if (
            deathHit === ZOMBIE_SUPER_LONG_DEATH_HIT &&
            deathContext.canUseSuperLongDeath &&
            this.chilledCounter <= 0 &&
            deathContext.zombieCount <= 5
        ) {
            this.currentAnimation = 'anim_superlongdeath'
            this.animationSpeed = ZOMBIE_SUPER_LONG_DEATH_ANIM_RATE / ZOMBIE_WALK_ASSET_FPS
            this._deathFrameSpan = ZOMBIE_SUPER_LONG_DEATH_FRAME_SPAN
            this._deathFallTime = ZOMBIE_SUPER_LONG_DEATH_FALL_TIME
            return
        }

        if (deathHit >= ZOMBIE_DEATH2_HIT_MIN) {
            this.currentAnimation = 'anim_death2'
            this.animationSpeed = this._randomDeathAnimRate() / ZOMBIE_WALK_ASSET_FPS
            this._deathFrameSpan = ZOMBIE_DEATH2_FRAME_SPAN
            this._deathFallTime = ZOMBIE_DEATH2_FALL_TIME
            return
        }

        this.currentAnimation = 'anim_death'
        this.animationSpeed = this._randomDeathAnimRate() / ZOMBIE_WALK_ASSET_FPS
        this._deathFrameSpan = ZOMBIE_DEATH_FRAME_SPAN
        this._deathFallTime = ZOMBIE_DEATH_FALL_TIME
    }

    private _updateGroan(context: ZombieUpdateContext) {
        if (!this.hasHead || this.state !== 'walking') return

        this._groanCounter--
        if (this._groanCounter !== 0) return
        if (context.randomInt(0, Math.max(0, context.zombieCount - 1)) !== 0) return

        context.events.push({ type: 'foleyRequested', sound: this._randomGroanSound(context) })
        this._groanCounter = context.randomInt(GROAN_REPEAT_MIN, GROAN_REPEAT_MAX)
    }

    private _randomGroanSound(context: ZombieUpdateContext): SoundEffect {
        const groans = [
            SoundEffect.Groan,
            SoundEffect.Groan2,
            SoundEffect.Groan3,
            SoundEffect.Groan4,
            SoundEffect.Groan5,
            SoundEffect.Groan6,
        ]
        return groans[context.randomInt(0, groans.length - 1)]
    }

    private _randomZombieFallingSound(context: ZombieUpdateContext): SoundEffect {
        return context.randomInt(0, 1) === 0 ? SoundEffect.ZombieFalling1 : SoundEffect.ZombieFalling2
    }

    private _flushPendingEvents(context: ZombieUpdateContext) {
        if (this._pendingEvents.length === 0) return

        context.events.push(...this._pendingEvents)
        this._pendingEvents.length = 0
    }
}
