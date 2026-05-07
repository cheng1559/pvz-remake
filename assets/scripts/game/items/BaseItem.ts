import type { GameEvent, ItemEntity, ItemMotion, ItemType } from '../GameTypes'
import { SoundEffect } from '@/core/SoundLoader'

const BOARD_WIDTH = 800
const SUN_BANK_DEST_X = 15
const SUN_BANK_DEST_Y = 0

export interface ItemUpdateContext {
    events: GameEvent[]
    addSun(amount: number): void
    randomInt(minInclusive: number, maxInclusive: number): number
    randomFloat(minInclusive: number, maxExclusive: number): number
}

export interface ItemCreateArgs {
    id: number
    type: ItemType
    motion: ItemMotion
    x: number
    y: number
}

export class Item implements ItemEntity {
    readonly id: number
    readonly kind = 'item' as const
    readonly type: ItemType
    readonly motion: ItemMotion
    readonly width = 60
    readonly height = 60

    x: number
    y: number
    scale = 1
    alpha = 255
    dead = false
    beingCollected = false

    private _velX = 0
    private _velY = 0
    private _groundY = 0
    private _age = 0
    private _disappearCounter = 0
    private _fadeCount = 0
    private _hitGround = false
    private _collectionDistance = 0

    constructor(args: ItemCreateArgs, context: ItemUpdateContext) {
        this.id = args.id
        this.type = args.type
        this.motion = args.motion
        this.x = args.x
        this.y = args.y
        this._initializeMotion(context)
        this.scale *= this._sunScale()
    }

    update(context: ItemUpdateContext) {
        if (this.dead) return

        this._age++
        if (this._fadeCount > 0) {
            this._updateFade()
        } else if (this.beingCollected) {
            this._updateCollected(context)
        } else {
            this._updateFall(context)
        }
    }

    collect(context: ItemUpdateContext) {
        if (this.dead || this.beingCollected) return false

        this.beingCollected = true
        this._disappearCounter = 0
        this._fadeCount = 0
        context.events.push({ type: 'soundRequested', sound: SoundEffect.Points })
        return true
    }

    hitTest(x: number, y: number) {
        if (this.dead || this.beingCollected) return false

        const extraClickSize = this.type === 'sun' ? 15 : 0
        return (
            x >= this.x - extraClickSize &&
            x < this.x + this.width + extraClickSize &&
            y >= this.y - extraClickSize &&
            y < this.y + this.height + extraClickSize
        )
    }

    private _initializeMotion(context: ItemUpdateContext) {
        switch (this.motion) {
            case 'from-sky':
                this._velY = 0.67
                this._velX = 0
                this._groundY = context.randomInt(300, 549)
                break
            case 'from-sky-slow':
                this._velY = 0.33
                this._velX = 0
                this._groundY = context.randomInt(300, 549)
                break
            case 'from-plant':
                this._velY = -1.7 - context.randomFloat(0, 1.7)
                this._velX = -0.4 + context.randomFloat(0, 0.8)
                this._groundY = this.y + 15 + context.randomInt(0, 19)
                this.scale = 0.4
                context.events.push({ type: 'soundRequested', sound: SoundEffect.Throw })
                break
            case 'coin':
                this._velY = -3 - context.randomFloat(0, 2)
                this._velX = -0.5 + context.randomFloat(0, 1)
                this._groundY = Math.max(80, Math.min(521, this.y + 45 + context.randomInt(0, 19)))
                break
        }
    }

    private _updateFall(context: ItemUpdateContext) {
        if (this.y + this._velY < this._groundY) {
            this.y += this._velY
            if (this.motion === 'from-plant') {
                this._velY += 0.09
            } else if (this.motion === 'coin') {
                this._velY += 0.15
            }

            this.x += this._velX
            if (this.x > BOARD_WIDTH - this.width) {
                this.x = BOARD_WIDTH - this.width
                this._velX = -0.4 - context.randomFloat(0, 0.4)
            } else if (this.x < 0) {
                this.x = 0
                this._velX = 0.4 + context.randomFloat(0, 0.4)
            }
        } else {
            this.y = this._groundY
            this.x = Math.round(this.x)
            if (!this._hitGround) this._hitGround = true
            this._disappearCounter++
            if (this._disappearCounter >= this._disappearTime()) {
                this._fadeCount = 50
            }
        }

        if (this.motion === 'from-plant') {
            const finalScale = this._sunScale()
            this.scale = Math.min(finalScale, this.scale + 0.02)
        }
    }

    private _updateCollected(context: ItemUpdateContext) {
        const deltaX = Math.abs(this.x - SUN_BANK_DEST_X)
        const deltaY = Math.abs(this.y - SUN_BANK_DEST_Y)
        if (this.x > SUN_BANK_DEST_X) {
            this.x -= deltaX / 21
        } else if (this.x < SUN_BANK_DEST_X) {
            this.x += deltaX / 21
        }
        if (this.y > SUN_BANK_DEST_Y) {
            this.y -= deltaY / 21
        } else if (this.y < SUN_BANK_DEST_Y) {
            this.y += deltaY / 21
        }

        this._collectionDistance = Math.sqrt(deltaY * deltaY + deltaX * deltaX)
        if (this._collectionDistance < 8) {
            this.dead = true
            context.addSun(this._sunValue())
            return
        }

        this.scale = Math.max(0.5, Math.min(1, this._collectionDistance * 0.05)) * this._sunScale()
    }

    private _updateFade() {
        this._fadeCount--
        this.alpha = Math.max(0, Math.round(255 * (this._fadeCount / 50)))
        if (this._fadeCount <= 0) {
            this.dead = true
        }
    }

    private _sunScale() {
        if (this.type === 'small-sun') return 0.5
        if (this.type === 'large-sun') return 2
        return 1
    }

    private _sunValue() {
        if (this.type === 'small-sun') return 15
        if (this.type === 'large-sun') return 50
        return 25
    }

    private _disappearTime() {
        return 750
    }
}
