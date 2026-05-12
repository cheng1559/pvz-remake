import type { GameEvent, ProjectileEntity, ProjectileType, Rect } from '../GameTypes'
import { SoundEffect } from '@/core/SoundLoader'

const PROJECTILE_WIDTH = 40
const PROJECTILE_HEIGHT = 40
const PROJECTILE_SPEED_X = 3.33
const PEA_DAMAGE = 20
const WIDE_BOARD_WIDTH = 800

export interface ProjectileUpdateContext<TTarget> {
    events: GameEvent[]
    findCollisionTarget(projectile: Projectile): TTarget | null
    damageTarget(target: TTarget, projectile: Projectile): boolean | void
}

export interface ProjectileCreateArgs {
    id: number
    type: ProjectileType
    x: number
    y: number
    row: number
    shadowY: number
}

export class Projectile implements ProjectileEntity {
    readonly id: number
    readonly kind = 'projectile' as const
    readonly type: ProjectileType
    readonly row: number

    x: number
    y: number
    z = 0
    velocityX = PROJECTILE_SPEED_X
    velocityY = 0
    velocityZ = 0
    accelerationZ = 0
    shadowY: number
    width = PROJECTILE_WIDTH
    height = PROJECTILE_HEIGHT
    age = 0
    dead = false

    constructor(args: ProjectileCreateArgs) {
        this.id = args.id
        this.type = args.type
        this.x = args.x
        this.y = args.y
        this.row = args.row
        this.shadowY = args.shadowY
    }

    update<TTarget>(context: ProjectileUpdateContext<TTarget>) {
        if (this.dead) return

        this.age++
        this.x += this.velocityX
        this.y += this.velocityY
        this.z += this.velocityZ
        this.velocityZ += this.accelerationZ

        const target = context.findCollisionTarget(this)
        if (!target) {
            if (this.x > WIDE_BOARD_WIDTH || this.x + this.width < 0) {
                this.dead = true
            }
            return
        }

        const handledImpactSound = context.damageTarget(target, this) === true
        if (!handledImpactSound) {
            context.events.push({ type: 'foleyRequested', sound: SoundEffect.Splat, pitchRange: 10 })
        }
        this.dead = true
    }

    get damage() {
        switch (this.type) {
            case 'pea':
            case 'snowpea':
                return PEA_DAMAGE
        }
        return PEA_DAMAGE
    }

    getProjectileRect(): Rect {
        switch (this.type) {
            case 'pea':
            case 'snowpea':
                return {
                    x: this.x - 15,
                    y: this.y + this.z,
                    width: this.width + 15,
                    height: this.height,
                }
        }
        return {
            x: this.x,
            y: this.y + this.z,
            width: this.width,
            height: this.height,
        }
    }
}
