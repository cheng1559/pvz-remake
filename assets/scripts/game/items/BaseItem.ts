import type { GameEvent, ItemEntity, ItemMotion, ItemType, LevelAwardKind, SeedType } from '../GameTypes'
import { SoundEffect } from '@/core/SoundLoader'

const BOARD_WIDTH = 800
const SUN_BANK_DEST_X = 15
const SUN_BANK_DEST_Y = 0
const COIN_BANK_DEST_X = 39
const COIN_BANK_DEST_Y = 558
const DEFAULT_ITEM_SIZE = 60
const FINAL_SEED_PACKET_WIDTH = 50
const FINAL_SEED_PACKET_HEIGHT = 70
const FINAL_SHOVEL_WIDTH = 80
const FINAL_SHOVEL_HEIGHT = 80
const DEFAULT_COLLECTION_EASE_DIVISOR = 21
const DEFAULT_COLLECTION_COMPLETE_DISTANCE = 8
const MONEY_COLLECTION_COMPLETE_DISTANCE = 12
const FINAL_SEED_PACKET_MOVE_DURATION = 350
const FINAL_SEED_PACKET_SCALE_DURATION = 400

export interface ItemUpdateContext {
    events: GameEvent[]
    addSun(amount: number): void
    addMoney(amount: number): void
    completeLevelAward(item: Item): void
    randomInt(minInclusive: number, maxInclusive: number): number
    randomFloat(minInclusive: number, maxExclusive: number): number
}

export interface ItemCreateArgs {
    id: number
    type: ItemType
    motion: ItemMotion
    x: number
    y: number
    awardKind?: LevelAwardKind
    awardSeedType?: SeedType | null
}

export class Item implements ItemEntity {
    readonly id: number
    readonly kind = 'item' as const
    readonly type: ItemType
    readonly motion: ItemMotion
    readonly width: number
    readonly height: number
    readonly awardKind: LevelAwardKind
    readonly awardSeedType: SeedType | null

    x: number
    y: number
    scale = 1
    alpha = 255
    age = 0
    hitGround = false
    dead = false
    beingCollected = false

    private _velX = 0
    private _velY = 0
    private _groundY = 0
    private _age = 0
    private _disappearCounter = 0
    private _fadeCount = 0
    private _collectionDistance = 0
    private _collectX = 0
    private _collectY = 0

    constructor(args: ItemCreateArgs, context: ItemUpdateContext) {
        this.id = args.id
        this.type = args.type
        this.motion = args.motion
        this.awardKind = args.awardKind ?? 'seed'
        this.x = args.x
        this.y = args.y
        this.width = this._initialWidth()
        this.height = this._initialHeight()
        this.awardSeedType = args.awardSeedType ?? null
        this._adjustInitialPosition()
        this._initializeMotion(context)
        this._pushLaunchSound(context)
        this.scale *= this._sunScale()
    }

    update(context: ItemUpdateContext) {
        if (this.dead) return

        this._age++
        this.age = this._age
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
        this._collectX = this.x
        this._collectY = this.y
        this._pushCollectSound(context)
        if (this.type === 'final-seed-packet') {
            context.events.push({
                type: 'levelAwardCollected',
                entityId: this.id,
                x: this.x,
                y: this.y,
            })
            context.completeLevelAward(this)
        }
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
                context.events.push({ type: 'foleyRequested', sound: SoundEffect.Throw, pitchRange: 10 })
                break
            case 'coin':
                this._velY = -3 - context.randomFloat(0, 2)
                this._velX = -0.5 + context.randomFloat(0, 1)
                this._groundY = Math.max(80, Math.min(521, this.y + 45 + context.randomInt(0, 19)))
                if (this.type === 'final-seed-packet') this._groundY -= 30
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
            if (!this.hitGround) {
                this.hitGround = true
                this._playGroundSound(context)
            }
            if (this._canDisappearOnGround()) {
                this._disappearCounter++
                if (this._disappearCounter >= this._disappearTime()) {
                    this._fadeCount = 50
                }
            }
        }

        if (this.motion === 'from-plant') {
            const finalScale = this._sunScale()
            this.scale = Math.min(finalScale, this.scale + 0.02)
        }
    }

    private _updateCollected(context: ItemUpdateContext) {
        const destination = this._collectionDestination()
        if (this.type === 'final-seed-packet') {
            this._disappearCounter++

            const moveTime = Math.min(1, this._disappearCounter / FINAL_SEED_PACKET_MOVE_DURATION)
            const moveEaseOut = 2 * moveTime - moveTime * moveTime
            this.x = this._collectX + (destination.x - this._collectX) * moveEaseOut
            this.y = this._collectY + (destination.y - this._collectY) * moveEaseOut

            const scaleTime = Math.min(1, this._disappearCounter / FINAL_SEED_PACKET_SCALE_DURATION)
            const smoothStep = 3 * scaleTime * scaleTime - 2 * scaleTime * scaleTime * scaleTime
            const scaleEaseInOut = 3 * smoothStep * smoothStep - 2 * smoothStep * smoothStep * smoothStep
            this.scale = 1.01 + (2 - 1.01) * scaleEaseInOut

            const deltaX = this.x - destination.x
            const deltaY = this.y - destination.y
            this._collectionDistance = Math.sqrt(deltaY * deltaY + deltaX * deltaX)
            return
        }

        const deltaX = Math.abs(this.x - destination.x)
        const deltaY = Math.abs(this.y - destination.y)
        const divisor = DEFAULT_COLLECTION_EASE_DIVISOR
        if (this.x > destination.x) {
            this.x -= deltaX / divisor
        } else if (this.x < destination.x) {
            this.x += deltaX / divisor
        }
        if (this.y > destination.y) {
            this.y -= deltaY / divisor
        } else if (this.y < destination.y) {
            this.y += deltaY / divisor
        }

        this._collectionDistance = Math.sqrt(deltaY * deltaY + deltaX * deltaX)
        const completeDistance = this._collectionCompleteDistance()
        if (this._collectionDistance < completeDistance) {
            this.dead = true
            if (this._isSun()) {
                context.addSun(this._sunValue())
            } else if (this._isMoney()) {
                context.addMoney(this._moneyValue())
            }
            return
        }

        this.scale = Math.max(0.5, Math.min(1, this._collectionDistance * 0.05)) * this._sunScale()
    }

    private _collectionCompleteDistance() {
        if (this._isMoney()) return MONEY_COLLECTION_COMPLETE_DISTANCE
        return DEFAULT_COLLECTION_COMPLETE_DISTANCE
    }

    private _updateFade() {
        this._fadeCount--
        this.alpha = Math.max(0, Math.round(255 * (this._fadeCount / 50)))
        if (this._fadeCount <= 0) {
            this.dead = true
        }
    }

    private _sunScale() {
        if (!this._isSun()) return 1
        if (this.type === 'small-sun') return 0.5
        if (this.type === 'large-sun') return 2
        return 1
    }

    private _sunValue() {
        if (this.type === 'small-sun') return 15
        if (this.type === 'large-sun') return 50
        return 25
    }

    private _moneyValue() {
        if (this.type === 'silver-coin') return 1
        if (this.type === 'gold-coin') return 5
        if (this.type === 'diamond') return 100
        return 0
    }

    private _disappearTime() {
        if (this.type === 'diamond') return 1500
        return 750
    }

    private _canDisappearOnGround() {
        return this.type !== 'final-seed-packet'
    }

    private _isSun() {
        return this.type === 'sun' || this.type === 'small-sun' || this.type === 'large-sun'
    }

    private _isMoney() {
        return this.type === 'silver-coin' || this.type === 'gold-coin' || this.type === 'diamond'
    }

    private _initialWidth() {
        if (this.type === 'final-seed-packet' && this.awardKind === 'shovel') return FINAL_SHOVEL_WIDTH
        return this.type === 'final-seed-packet' ? FINAL_SEED_PACKET_WIDTH : DEFAULT_ITEM_SIZE
    }

    private _initialHeight() {
        if (this.type === 'final-seed-packet' && this.awardKind === 'shovel') return FINAL_SHOVEL_HEIGHT
        return this.type === 'final-seed-packet' ? FINAL_SEED_PACKET_HEIGHT : DEFAULT_ITEM_SIZE
    }

    private _adjustInitialPosition() {
        if (this.type === 'silver-coin' || this.type === 'gold-coin') {
            this.x -= 10
            this.y -= 8
        } else if (this.type === 'diamond') {
            this.x -= 15
            this.y -= 15
        }
    }

    private _pushCollectSound(context: ItemUpdateContext) {
        if (this._isSun()) {
            context.events.push({ type: 'foleyRequested', sound: SoundEffect.Points, pitchRange: 10 })
        } else if (this.type === 'final-seed-packet' && this.awardKind === 'shovel') {
            context.events.push({ type: 'soundRequested', sound: SoundEffect.Shovel })
        } else if (this.type === 'final-seed-packet') {
            context.events.push({ type: 'soundRequested', sound: SoundEffect.SeedLift })
            context.events.push({ type: 'soundRequested', sound: SoundEffect.Drop })
        } else if (this.type === 'diamond') {
            context.events.push({ type: 'soundRequested', sound: SoundEffect.Diamond })
        } else {
            context.events.push({ type: 'foleyRequested', sound: SoundEffect.Coin, pitchRange: 10 })
        }
    }

    private _pushLaunchSound(context: ItemUpdateContext) {
        if (this.type === 'diamond') {
            context.events.push({ type: 'soundRequested', sound: SoundEffect.Chime })
        }
    }

    private _playGroundSound(context: ItemUpdateContext) {
        if (this.type === 'gold-coin') {
            context.events.push({ type: 'foleyRequested', sound: SoundEffect.MoneyFalls })
        }
    }

    private _collectionDestination() {
        if (this._isSun()) return { x: SUN_BANK_DEST_X, y: SUN_BANK_DEST_Y }
        if (this.type === 'final-seed-packet') return { x: 400 - this.width / 2, y: 200 - this.height / 2 }
        return { x: COIN_BANK_DEST_X, y: COIN_BANK_DEST_Y }
    }
}
