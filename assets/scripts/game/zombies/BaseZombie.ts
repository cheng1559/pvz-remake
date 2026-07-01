import { ZOMBIE_DEFINITIONS } from '../GameDefinitions'
import { SoundEffect } from '@/core/SoundLoader'
import type { TodParticleEffect } from '@/core/Particle'
import type { GameEvent, PlantEntity, Rect, ZombieEntity, ZombieState, ZombieSubclass, ZombieType } from '../GameTypes'

const TICKS_BETWEEN_EATS = 4
const DAMAGE_PER_EAT = TICKS_BETWEEN_EATS
const GROAN_COUNTDOWN_MIN = 300
const GROAN_COUNTDOWN_MAX = 400
const GROAN_REPEAT_MIN = 500
const GROAN_REPEAT_MAX = 1499
const HEADLESS_DECAY_CHANCE = 5
const HEADLESS_DECAY_DAMAGE = 1
const CHILLED_TICKS = 1000
const CHILLED_SPEED_FACTOR = 0.4
const HIT_FLASH_TICKS = 25
const ZOMBIE_WALK_ASSET_FPS = 12
const GAME_TICKS_PER_SECOND = 100
const ZOMBIE_EAT_ANIM_RATE = 36
const SPECIAL_ZOMBIE_EAT_ANIM_RATE = 20
const ZOMBIE_EAT_FRAME_SPAN = 39
const ZOMBIE_EAT_LEFT_HAND_TIME = 0.14
const ZOMBIE_EAT_RIGHT_HAND_TIME = 0.68
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
// The original mower driver is advanced once by EffectSystem and once again
// while applying it to the zombie body, so its visible rate is effectively 16.
const ZOMBIE_MOWERED_ANIM_RATE = 16
const ZOMBIE_MOWERED_FRAME_COUNT = 8
const ZOMBIE_MOWERED_FRAME_SPAN = ZOMBIE_MOWERED_FRAME_COUNT - 1
const ZOMBIE_MOWERED_TICKS = Math.ceil(
    ZOMBIE_MOWERED_FRAME_COUNT / ZOMBIE_MOWERED_ANIM_RATE * GAME_TICKS_PER_SECOND,
)
const ZOMBIE_CHARRED_ANIM_RATE = 15
const ZOMBIE_CHARRED_FRAME_COUNT = 43
const ZOMBIE_CHARRED_FRAME_SPAN = ZOMBIE_CHARRED_FRAME_COUNT - 1
const ZOMBIE_CHARRED_TICKS = Math.ceil(
    ZOMBIE_CHARRED_FRAME_COUNT / ZOMBIE_CHARRED_ANIM_RATE * GAME_TICKS_PER_SECOND,
)
const ZOMBIE_BURNED_TICKS = 300
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
const POLE_VAULT_RUN_GROUND_X = [
    -59.799999, -59.0, -58.200001, -57.299999, -56.5, -55.700001,
    -54.799999, -54.0, -53.200001, -52.299999, -51.5, -50.700001,
    -49.799999, -49.0, -48.200001, -47.299999, -46.5, -45.700001,
    -44.799999, -44.0, -43.200001, -42.299999, -41.5, -40.700001,
    -39.799999, -39.0, -38.200001, -37.299999, -36.5, -35.700001,
    -34.799999, -34.0, -33.200001, -32.299999, -31.5, -30.700001,
    -29.799999,
]
const POLE_VAULT_WALK_GROUND_X = [
    -59.799999, -59.099998, -58.299999, -57.599998, -56.900002, -55.0,
    -53.0, -51.099998, -49.200001, -47.200001, -45.099998, -43.099998,
    -41.099998, -39.0, -37.0, -35.0, -32.900002, -30.9, -28.9, -27.0,
    -25.0, -23.0, -21.0, -19.0, -17.0, -14.7, -12.3, -10.0, -7.7,
    -5.8, -3.9, -2.0, -0.1, 1.6, 3.5, 5.4, 7.3, 7.5, 7.8, 8.0,
    8.2, 8.2, 8.1, 8.0, 8.0,
]
const POLE_VAULT_SLOW_SPEED_MIN = 0.23
const POLE_VAULT_SLOW_SPEED_MAX = 0.37
const POLE_VAULT_ANIM_RATE = 24
const POLE_VAULT_FRAME_COUNT = 43
const POLE_VAULT_FRAME_SPAN = 42
const POLE_VAULT_RUN_FRAME_COUNT = POLE_VAULT_RUN_GROUND_X.length
const POLE_VAULT_RUN_GROUND_DISTANCE = POLE_VAULT_RUN_GROUND_X[POLE_VAULT_RUN_GROUND_X.length - 1] - POLE_VAULT_RUN_GROUND_X[0]
const POLE_VAULT_WALK_FRAME_COUNT = POLE_VAULT_WALK_GROUND_X.length
const POLE_VAULT_WALK_GROUND_DISTANCE = POLE_VAULT_WALK_GROUND_X[POLE_VAULT_WALK_GROUND_X.length - 1] - POLE_VAULT_WALK_GROUND_X[0]
const POLE_VAULT_EAT_FRAME_SPAN = 27
const POLE_VAULT_DEATH_FRAME_SPAN = 26
const POLE_VAULT_GRASSSTEP_TIME = 0.2
const POLE_VAULT_SOUND_TIME = 0.4
const POLE_VAULT_JUMP_ATTACK_RECT: Rect = { x: -40, y: 0, width: 100, height: 115 }
const POLE_VAULT_ATTACK_RECT_AFTER_JUMP: Rect = { x: 50, y: 0, width: 20, height: 115 }

export interface ZombieUpdateContext {
    events: GameEvent[]
    zombieCount: number
    deathZombieCount: number
    canUseSuperLongDeath: boolean
    levelAwardDropped: boolean
    findPlantTarget(zombie: Zombie): PlantEntity | null
    canChewPlant(plant: PlantEntity): boolean
    damagePlant(plant: PlantEntity, damage: number): void
    flashChewedPlant(plant: PlantEntity): void
    checkBoardEdge(zombie: Zombie): boolean
    rowY(row: number): number
    randomInt(minInclusive: number, maxInclusive: number): number
    randomFloat(minInclusive: number, maxExclusive: number): number
}

export interface ZombieDeathContext {
    zombieCount: number
    canUseSuperLongDeath: boolean
}

export interface ZombieDamageResult {
    droppedArm: boolean
    droppedHead: boolean
    startedDying: boolean
}

export interface ZombieCreateArgs {
    id: number
    type: ZombieType
    fromWave?: number
    row: number
    x: number
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
    charredTime = 0
    health: number
    helmHealth: number
    shieldHealth: number
    state: ZombieState = 'walking'
    age = 0
    chilledCounter = 0
    hitFlashCounter = 0
    hasHead = true
    hasArm = true
    hasTongue = false
    hasObject = false
    poleVaulting = false
    inPool: boolean
    dead = false

    private _eatCounter = TICKS_BETWEEN_EATS
    private _groanCounter = GROAN_COUNTDOWN_MIN
    private _deathCounter = 0
    private _deathFallSoundPlayed = false
    private _deathFrameSpan = ZOMBIE_DEATH_FRAME_SPAN
    private _deathFallTime = ZOMBIE_DEATH_FALL_TIME
    private _boardX = 0
    private _walkGroundTime = 0
    private _walkAnimation: string
    private _poleVaultPlayedGrassstep = false
    private _poleVaultPlayedVault = false
    private _pendingEvents: GameEvent[] = []

    protected constructor(args: ZombieCreateArgs, subclass: ZombieSubclass) {
        const definition = ZOMBIE_DEFINITIONS[args.type]
        this.id = args.id
        this.type = args.type
        this.subclass = subclass
        this.fromWave = args.fromWave ?? -1
        this.row = args.row
        this.x = args.x
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
        this.velocityX = args.velocityX ?? this._randomSpeedForState(args.type, args.type === 'pole-vaulting')
        this.hasObject = definition.hasFlag || definition.hasFloat || args.type === 'pole-vaulting'
        this.poleVaulting = args.type === 'pole-vaulting'
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
        this._updateHitFlash()
        if (this.state === 'dying') {
            this._updateChill()
            this.updateDying(context)
            return
        }
        if (this.state === 'mowered') {
            this._updateChill()
            this.updateMowered(context)
            return
        }
        if (this.state === 'charred') {
            this.updateCharred()
            return
        }
        if (this.state === 'burned') {
            this.updateBurned()
            return
        }
        if (this.state === 'jumping') {
            this._updatePoleVaultJump(context)
            return
        }

        this._updateChill()
        this._updateGroan(context)
        const target = this.hasHead || this.state === 'eating'
            ? context.findPlantTarget(this)
            : null
        if (this._shouldPoleVault(target)) {
            this._startPoleVaultJump(context, target!)
        } else if (target) {
            this.updateEating(context, target)
            context.checkBoardEdge(this)
        } else if (!this.hasHead) {
            this.updateHeadless(context)
        } else {
            this.updateWalking(context)
            context.checkBoardEdge(this)
        }
    }

    takeDamage(
        damage: number,
        deathContext: ZombieDeathContext = { zombieCount: 1, canUseSuperLongDeath: false },
        options: { hitsShieldAndBody?: boolean, leavesBody?: boolean } = {},
    ): ZombieDamageResult {
        const result: ZombieDamageResult = {
            droppedArm: false,
            droppedHead: false,
            startedDying: false,
        }
        if (this.state === 'dying' || this.state === 'mowered' || this.state === 'charred' || this.state === 'burned') return result

        if (damage > 0) this.hitFlashCounter = HIT_FLASH_TICKS
        let remainingDamage = damage
        if (this.shieldHealth > 0) {
            const absorbed = Math.min(this.shieldHealth, remainingDamage)
            this.shieldHealth -= absorbed
            remainingDamage -= absorbed
            if (options.hitsShieldAndBody) remainingDamage = damage
        }
        if (this.helmHealth > 0 && remainingDamage > 0) {
            const helmHealthBeforeDamage = this.helmHealth
            const absorbed = Math.min(this.helmHealth, remainingDamage)
            this.helmHealth -= absorbed
            remainingDamage -= absorbed
            if (helmHealthBeforeDamage > 0 && this.helmHealth === 0) {
                this._queueDroppedHelmParticle()
            }
        }
        if (remainingDamage > 0) {
            this.health = Math.max(0, this.health - remainingDamage)
            const damageStateResult = this._updateDamageStates()
            result.droppedArm = damageStateResult.droppedArm
            result.droppedHead = damageStateResult.droppedHead
        }
        if (this.health <= 0) {
            if (options.leavesBody === false) {
                this.dead = true
            } else {
                this.startDeathAnimation(deathContext)
                result.startedDying = this.state === 'dying'
            }
        }
        return result
    }

    takeHelmDamage(damage: number) {
        if (this.state === 'dying' || this.state === 'mowered' || this.state === 'charred' || this.state === 'burned') return false
        const helmHealthBeforeDamage = this.helmHealth
        if (damage > 0) this.hitFlashCounter = HIT_FLASH_TICKS
        this.helmHealth = Math.max(0, this.helmHealth - damage)
        if (helmHealthBeforeDamage > 0 && this.helmHealth === 0) {
            this._queueDroppedHelmParticle()
            return true
        }
        return false
    }

    takeBodyDamage(
        damage: number,
        deathContext: ZombieDeathContext = { zombieCount: 1, canUseSuperLongDeath: false },
    ): ZombieDamageResult {
        const result: ZombieDamageResult = {
            droppedArm: false,
            droppedHead: false,
            startedDying: false,
        }
        if (this.state === 'dying' || this.state === 'mowered' || this.state === 'charred' || this.state === 'burned') return result

        if (damage > 0) this.hitFlashCounter = HIT_FLASH_TICKS
        this.health = Math.max(0, this.health - damage)
        const damageStateResult = this._updateDamageStates()
        result.droppedArm = damageStateResult.droppedArm
        result.droppedHead = damageStateResult.droppedHead
        if (this.health <= 0) {
            this.startDeathAnimation(deathContext)
            result.startedDying = true
        }
        return result
    }

    applyChill(events: GameEvent[]) {
        if (this.state === 'dying' || this.state === 'mowered' || this.state === 'charred' || this.state === 'burned') return
        if (this.chilledCounter <= 0) {
            events.push({ type: 'foleyRequested', sound: SoundEffect.Frozen })
        }
        this.chilledCounter = Math.max(this.chilledCounter, CHILLED_TICKS)
    }

    mowDown(events?: GameEvent[]) {
        if (this.dead || this.state === 'mowered' || this.state === 'charred' || this.state === 'burned') return

        const dropEvents = events ?? this._pendingEvents
        const helmEffect = this._droppedHelmParticleEffect()
        if (this.helmHealth > 0 && helmEffect) {
            dropEvents.push({
                type: 'particleRequested',
                effect: helmEffect,
                entityId: this.id,
            })
        }
        if (this.type === 'flag' && this.hasObject) {
            dropEvents.push({
                type: 'particleRequested',
                effect: 'zombieflag',
                entityId: this.id,
            })
        }
        this.state = 'mowered'
        this.health = 0
        this.helmHealth = 0
        this.shieldHealth = 0
        this.hasTongue = false
        this.poleVaulting = false
        if (this.type === 'flag' || this.type === 'pole-vaulting') this.hasObject = false
        this.velocityX = 0
        this.animationTime = 0
        this.animationSpeed = ZOMBIE_MOWERED_ANIM_RATE / ZOMBIE_WALK_ASSET_FPS
        this.moweredTime = 0
        this.currentAnimation = 'default'
    }

    applyBurn() {
        if (this.dead || this.state === 'charred' || this.state === 'burned') return false
        if (this.state === 'dying' || this.state === 'mowered') {
            this.dead = true
            return false
        }
        if (this.state === 'jumping') {
            this.dead = true
            return true
        }
        if (!this.hasHead) {
            this.state = 'burned'
            this.health = 0
            this.helmHealth = 0
            this.shieldHealth = 0
            this.hasTongue = false
            this.velocityX = 0
            this.chilledCounter = 0
            this.hitFlashCounter = 0
            this.animationSpeed = 0
            this.charredTime = 0
            return true
        }

        this.state = 'charred'
        this.health = 0
        this.helmHealth = 0
        this.shieldHealth = 0
        this.hasHead = false
        this.hasArm = false
        this.hasTongue = false
        if (this.type === 'flag') this.hasObject = false
        this.velocityX = 0
        this.chilledCounter = 0
        this.hitFlashCounter = 0
        this.animationTime = 0
        this.animationSpeed = ZOMBIE_CHARRED_ANIM_RATE / ZOMBIE_WALK_ASSET_FPS
        this.charredTime = 0
        this.currentAnimation = 'anim_crumble'
        return true
    }

    protected updateMowered(context: ZombieUpdateContext) {
        this.moweredTime++
        this.animationTime = Math.min(
            ZOMBIE_MOWERED_FRAME_SPAN,
            this.animationTime + ZOMBIE_MOWERED_FRAME_SPAN / ZOMBIE_MOWERED_TICKS,
        )
        if (this.moweredTime >= ZOMBIE_MOWERED_TICKS) {
            if (this.hasHead) {
                context.events.push({
                    type: 'foleyRequested',
                    sound: SoundEffect.LimbsPop,
                    pitchRange: 10,
                })
                context.events.push({
                    type: 'particleRequested',
                    effect: this.type === 'pole-vaulting' ? 'moweredzombiepolevaulterhead' : 'moweredzombiehead',
                    entityId: this.id,
                })
                this.hasHead = false
            }
            if (this.hasArm) {
                context.events.push({
                    type: 'foleyRequested',
                    sound: SoundEffect.LimbsPop,
                    pitchRange: 10,
                })
                context.events.push({
                    type: 'particleRequested',
                    effect: this.type === 'pole-vaulting' ? 'moweredzombiepolevaulterarm' : 'moweredzombiearm',
                    entityId: this.id,
                })
                this.hasArm = false
            }
            this.dead = true
        }
    }

    protected updateCharred() {
        this.charredTime++
        this.animationTime = Math.min(
            ZOMBIE_CHARRED_FRAME_SPAN,
            this.animationTime + ZOMBIE_CHARRED_FRAME_SPAN / ZOMBIE_CHARRED_TICKS,
        )
        if (this.charredTime >= ZOMBIE_CHARRED_TICKS) {
            this.dead = true
        }
    }

    protected updateBurned() {
        this.charredTime++
        if (this.charredTime >= ZOMBIE_BURNED_TICKS) {
            this.dead = true
        }
    }

    getBodyRect(): Rect {
        return this.offsetRect(this.bodyRect)
    }

    getAttackRect(): Rect {
        if (this.type === 'pole-vaulting' && this.state === 'jumping') {
            return this.offsetRect(POLE_VAULT_JUMP_ATTACK_RECT)
        }
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
        this.x -= this.inPool
                ? this._chilledAnimSpeed(this.velocityX)
                : this._advanceWalkGroundDistance()
        if (this.inPool) {
            this.animationTime = this._advanceLoopingAnimationTime(this.animationTime, this.animationSpeed, this._walkFrameSpan())
        }
        this._eatCounter = TICKS_BETWEEN_EATS
    }

    private _shouldPoleVault(target: PlantEntity | null) {
        return !!target &&
            this.type === 'pole-vaulting' &&
            this.poleVaulting &&
            this.hasHead &&
            this.state === 'walking'
    }

    private _startPoleVaultJump(context: ZombieUpdateContext, target: PlantEntity) {
        this.state = 'jumping'
        this.animationTime = 0
        this.animationSpeed = this._chilledAnimSpeed(POLE_VAULT_ANIM_RATE / ZOMBIE_WALK_ASSET_FPS)
        this.currentAnimation = 'anim_jump'
        const jumpDistance = Math.max(0, this.x - target.x - 80)
        this.velocityX = jumpDistance / (POLE_VAULT_FRAME_COUNT / POLE_VAULT_ANIM_RATE * GAME_TICKS_PER_SECOND)
        this.hasObject = false
        this._poleVaultPlayedGrassstep = false
        this._poleVaultPlayedVault = false
        this._requestAnimation(context, 'anim_jump', this.animationSpeed)
    }

    private _updatePoleVaultJump(context: ZombieUpdateContext) {
        this.y = context.rowY(this.row)
        const previousTime = this.animationTime
        this.animationTime = Math.min(
            POLE_VAULT_FRAME_SPAN,
            this.animationTime + POLE_VAULT_FRAME_SPAN / (POLE_VAULT_FRAME_COUNT / POLE_VAULT_ANIM_RATE * GAME_TICKS_PER_SECOND),
        )
        const progress = this.animationTime / POLE_VAULT_FRAME_SPAN
        if (!this._poleVaultPlayedGrassstep && progress >= POLE_VAULT_GRASSSTEP_TIME) {
            context.events.push({ type: 'foleyRequested', sound: SoundEffect.Grassstep })
            this._poleVaultPlayedGrassstep = true
        }
        if (!this._poleVaultPlayedVault && progress >= POLE_VAULT_SOUND_TIME) {
            context.events.push({ type: 'foleyRequested', sound: SoundEffect.PoleVault })
            this._poleVaultPlayedVault = true
        }

        if (previousTime < POLE_VAULT_FRAME_SPAN) this.x -= this._chilledAnimSpeed(this.velocityX)
        if (progress < 1) return

        this.x -= 150
        this.poleVaulting = false
        this.velocityX = this._randomSpeedForState(this.type, false)
        this._walkAnimation = 'anim_walk'
        this._walkGroundTime = 0
        this.attackRect.x = POLE_VAULT_ATTACK_RECT_AFTER_JUMP.x
        this.attackRect.y = POLE_VAULT_ATTACK_RECT_AFTER_JUMP.y
        this.attackRect.width = POLE_VAULT_ATTACK_RECT_AFTER_JUMP.width
        this.attackRect.height = POLE_VAULT_ATTACK_RECT_AFTER_JUMP.height
        this.state = 'walking'
        this.y = context.rowY(this.row)
        this._requestAnimation(context, this._walkAnimation, this._walkAnimationSpeed())
    }

    protected updateEating(context: ZombieUpdateContext, target: PlantEntity) {
        if (this.state !== 'eating') {
            this.state = 'eating'
            this._eatCounter = TICKS_BETWEEN_EATS
            this._requestAnimation(context, 'anim_eat', this._eatAnimationSpeed())
        } else {
            this.currentAnimation = 'anim_eat'
            this.animationSpeed = this._eatAnimationSpeed()
        }
        const previousAnimationTime = this.animationTime
        this.animationTime = this._advanceLoopingAnimationTime(this.animationTime, this.animationSpeed, this._eatFrameSpan())
        const chewFrameHit = this.hasHead && this._shouldTriggerChewEffect(previousAnimationTime, this.animationTime)
        if (chewFrameHit) {
            context.flashChewedPlant(target)
        }

        if (!this.hasHead) {
            this._updateHeadlessDecay(context)
            return
        }
        if (this.chilledCounter <= 0 || this.age % 2 === 0) {
            this._eatCounter--
        }

        const canDamagePlant = context.canChewPlant(target)
        if (chewFrameHit) {
            const sound = target.type === 'wallnut' || target.type === 'explodenut'
                ? SoundEffect.ChompSoft
                : SoundEffect.Chomp
            context.events.push({ type: 'foleyRequested', sound })
        }

        if (!canDamagePlant) {
            this._eatCounter = TICKS_BETWEEN_EATS
            return
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
        this.poleVaulting = false
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
            context.events.push({ type: 'foleyRequested', sound: SoundEffect.ZombieFalling1, pitchRange: 10 })
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

    finishAfterLevelAwardDropped(deathContext: ZombieDeathContext = { zombieCount: 1, canUseSuperLongDeath: false }) {
        if (this.dead || this.state === 'dying' || this.state === 'mowered' || this.state === 'charred' || this.state === 'burned') return
        if (this.hasHead) return

        this.startDeathAnimation(deathContext)
    }

    walkIntoHouse() {
        if (this.dead) return

        if (this.type === 'pole-vaulting' && this.poleVaulting) {
            this.poleVaulting = false
            this.hasObject = false
            this._walkAnimation = 'anim_walk'
            this.velocityX = this._randomSpeedForState(this.type, false)
        }
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
                this._walkFrameSpan(),
                ticks,
            )
        }
    }

    private _updateHeadlessDecay(context: ZombieUpdateContext) {
        if (context.randomInt(0, HEADLESS_DECAY_CHANCE - 1) === 0) {
            this.health = Math.max(0, this.health - this._headlessDecayDamage())
            if (this.health <= 0) {
                this.startDeathAnimation({
                    zombieCount: context.deathZombieCount,
                    canUseSuperLongDeath: context.canUseSuperLongDeath,
                })
            }
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
        // PvZ forces flag zombies to the first walk variant, which resolves to
        // anim_walk2 when that layer exists. Its flag-hand track is intentionally
        // much steadier than anim_walk.
        if (type === 'flag') return 'anim_walk2'
        if (type === 'pole-vaulting') return 'anim_run'
        return Math.random() < 0.5 ? 'anim_walk' : 'anim_walk2'
    }

    private _randomSpeedForState(type: ZombieType, polePreVault: boolean) {
        if (type === 'pole-vaulting') {
            if (polePreVault) return 0.66 + Math.random() * 0.02
            return POLE_VAULT_SLOW_SPEED_MIN + Math.random() * (POLE_VAULT_SLOW_SPEED_MAX - POLE_VAULT_SLOW_SPEED_MIN)
        }

        const definition = ZOMBIE_DEFINITIONS[type]
        return definition.velocityXMin + Math.random() * (definition.velocityXMax - definition.velocityXMin)
    }

    private _walkAnimationSpeed() {
        if (this.inPool) return this._chilledAnimSpeed(1)

        return this._chilledAnimSpeed(this._walkAnimRate() / ZOMBIE_WALK_ASSET_FPS)
    }

    private _advanceWalkGroundDistance(ticks = 1) {
        const frameAdvance = this._walkFrameAdvance(ticks)
        let nextTime = this._walkGroundTime + frameAdvance
        const groundX = this._walkGroundX()
        const previousX = this._sampleWalkGroundX(this._walkGroundTime, groundX)
        const walkFrameSpan = this._walkFrameSpan()

        if (nextTime < walkFrameSpan) {
            const nextX = this._sampleWalkGroundX(nextTime, groundX)
            this._walkGroundTime = nextTime
            this.animationTime = nextTime
            return nextX - previousX
        }

        let distance = groundX[groundX.length - 1] - previousX
        const groundDistance = groundX[groundX.length - 1] - groundX[0]
        nextTime -= walkFrameSpan
        while (nextTime >= walkFrameSpan) {
            distance += groundDistance
            nextTime -= walkFrameSpan
        }
        distance += this._sampleWalkGroundX(nextTime, groundX) - groundX[0]
        this._walkGroundTime = nextTime
        this.animationTime = nextTime
        return distance
    }

    private _walkGroundX() {
        if (this.type !== 'pole-vaulting') return ZOMBIE_WALK_GROUND_X

        return this.poleVaulting ? POLE_VAULT_RUN_GROUND_X : POLE_VAULT_WALK_GROUND_X
    }

    private _sampleWalkGroundX(time: number, groundX = this._walkGroundX()) {
        const leftIndex = Math.max(0, Math.min(groundX.length - 1, Math.floor(time)))
        const rightIndex = Math.min(groundX.length - 1, leftIndex + 1)
        const t = time - leftIndex
        return groundX[leftIndex] + (groundX[rightIndex] - groundX[leftIndex]) * t
    }

    private _advanceLoopingAnimationTime(time: number, speed: number, frameSpan: number, ticks = 1) {
        if (frameSpan <= 0) return 0

        const frameAdvance = speed * ZOMBIE_WALK_ASSET_FPS / GAME_TICKS_PER_SECOND * ticks
        return (time + frameAdvance) % frameSpan
    }

    private _eatAnimationSpeed() {
        const animRate = this.type === 'pole-vaulting'
            ? SPECIAL_ZOMBIE_EAT_ANIM_RATE
            : ZOMBIE_EAT_ANIM_RATE
        return this._chilledAnimSpeed(animRate / ZOMBIE_WALK_ASSET_FPS)
    }

    private _headlessDecayDamage() {
        return this.maxHealth >= 500 ? 3 : HEADLESS_DECAY_DAMAGE
    }

    private _shouldTriggerChewEffect(previousTime: number, currentTime: number) {
        const eatFrameSpan = this._eatFrameSpan()
        return this._didCrossLoopingTime(previousTime, currentTime, ZOMBIE_EAT_LEFT_HAND_TIME * eatFrameSpan) ||
            this._didCrossLoopingTime(previousTime, currentTime, ZOMBIE_EAT_RIGHT_HAND_TIME * eatFrameSpan)
    }

    private _didCrossLoopingTime(previousTime: number, currentTime: number, triggerTime: number) {
        if (currentTime >= previousTime) {
            return previousTime < triggerTime && triggerTime <= currentTime
        }

        return previousTime < triggerTime || triggerTime <= currentTime
    }

    private _walkAnimRate() {
        if (this.type === 'pole-vaulting') {
            const frameCount = this.poleVaulting ? POLE_VAULT_RUN_FRAME_COUNT : POLE_VAULT_WALK_FRAME_COUNT
            const groundDistance = this.poleVaulting ? POLE_VAULT_RUN_GROUND_DISTANCE : POLE_VAULT_WALK_GROUND_DISTANCE
            return this.velocityX * frameCount / groundDistance * ZOMBIE_REANIM_WALK_RATE_FACTOR
        }

        return this.velocityX * ZOMBIE_WALK_FRAME_COUNT / ZOMBIE_WALK_GROUND_DISTANCE * ZOMBIE_REANIM_WALK_RATE_FACTOR
    }

    private _walkFrameAdvance(ticks = 1) {
        return this._chilledAnimSpeed(this._walkAnimRate()) * SECONDS_PER_UPDATE * ticks
    }

    private _walkFrameSpan() {
        if (this.type !== 'pole-vaulting') return ZOMBIE_WALK_FRAME_SPAN

        return this.poleVaulting ? 36 : 44
    }

    private _eatFrameSpan() {
        return this.type === 'pole-vaulting' ? POLE_VAULT_EAT_FRAME_SPAN : ZOMBIE_EAT_FRAME_SPAN
    }

    private _updateChill() {
        if (this.chilledCounter > 0) this.chilledCounter--
    }

    private _updateHitFlash() {
        if (this.hitFlashCounter > 0) this.hitFlashCounter--
    }

    private _chilledAnimSpeed(speed: number) {
        return this.chilledCounter > 0 ? speed * CHILLED_SPEED_FACTOR : speed
    }

    private _updateDamageStates(): Pick<ZombieDamageResult, 'droppedArm' | 'droppedHead'> {
        const result = {
            droppedArm: false,
            droppedHead: false,
        }
        if (!this._canLoseBodyParts()) return result

        if (this.hasArm && this.health < 2 * this.maxHealth / 3 && this.health > 0) {
            this.hasArm = false
            result.droppedArm = true
            this._pendingEvents.push({ type: 'foleyRequested', sound: SoundEffect.LimbsPop, pitchRange: 10 })
            if (!this.inPool) {
                this._pendingEvents.push({
                    type: 'particleRequested',
                    effect: this.type === 'pole-vaulting' ? 'zombiepolevaulterarm' : 'zombiearm',
                    entityId: this.id,
                })
            }
        }
        if (this.hasHead && this.health < this.maxHealth / 3) {
            this.hasHead = false
            this.hasTongue = false
            this.poleVaulting = false
            if (this.type === 'flag' || this.type === 'pole-vaulting') this.hasObject = false
            result.droppedHead = true
            this._pendingEvents.push({ type: 'foleyRequested', sound: SoundEffect.LimbsPop, pitchRange: 10 })
            this._pendingEvents.push({
                type: 'particleRequested',
                effect: this.type === 'pole-vaulting' ? 'zombiepolevaulterhead' : 'zombiehead',
                entityId: this.id,
            })
        }
        return result
    }

    private _queueDroppedHelmParticle() {
        const effect = this._droppedHelmParticleEffect()
        if (!effect) return

        this._pendingEvents.push({
            type: 'particleRequested',
            effect,
            entityId: this.id,
        })
    }

    private _droppedHelmParticleEffect(): TodParticleEffect | null {
        if (this.helmType === 'traffic-cone') return 'zombietrafficcone'
        if (this.helmType === 'bucket') return 'zombiepail'
        return null
    }

    private _canLoseBodyParts() {
        return (
            this.type === 'normal' ||
            this.type === 'flag' ||
            this.type === 'traffic-cone' ||
            this.type === 'bucket' ||
            this.type === 'ducky-tube' ||
            this.type === 'pole-vaulting'
        )
    }

    private _canHaveTongue(type: ZombieType) {
        return type === 'normal' || type === 'flag' || type === 'traffic-cone' || type === 'bucket'
    }

    private _randomDeathAnimRate() {
        return ZOMBIE_DEATH_ANIM_RATE_MIN + Math.random() * (ZOMBIE_DEATH_ANIM_RATE_MAX - ZOMBIE_DEATH_ANIM_RATE_MIN)
    }

    private _pickDeathAnimation(deathContext: ZombieDeathContext) {
        const deathHit = Math.floor(Math.random() * 100)
        if (this.type === 'pole-vaulting') {
            this.currentAnimation = 'anim_death'
            this.animationSpeed = this._randomDeathAnimRate() / ZOMBIE_WALK_ASSET_FPS
            this._deathFrameSpan = POLE_VAULT_DEATH_FRAME_SPAN
            this._deathFallTime = ZOMBIE_DEATH_FALL_TIME
            return
        }
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
        if (!this.hasHead || context.levelAwardDropped) return

        this._groanCounter--
        if (this._groanCounter !== 0) return
        if (context.randomInt(0, Math.max(0, context.zombieCount - 1)) !== 0) return

        context.events.push({ type: 'foleyRequested', sound: SoundEffect.Groan })
        this._groanCounter = context.randomInt(GROAN_REPEAT_MIN, GROAN_REPEAT_MAX)
    }

    private _flushPendingEvents(context: ZombieUpdateContext) {
        if (this._pendingEvents.length === 0) return

        context.events.push(...this._pendingEvents)
        this._pendingEvents.length = 0
    }
}
