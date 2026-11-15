import type { CommandBuffer, World } from '@/ecs/index'
import type { DeterministicRng } from '../state/DeterministicRng'
import { PositionComponent, RandomResource } from '../state/components'
import { type Item, ItemComponent } from '../state/levelState'

/**
 * Coin::CoinInitialize's motions: falling from the sky (COIN_MOTION_FROM_SKY), thrown up by a plant
 * (COIN_MOTION_FROM_PLANT), dropped like a zombie's coin (COIN_MOTION_COIN) or taken straight to the bank from a mower
 * (COIN_MOTION_LAWNMOWER_COIN).
 */
export type ItemMotion = 'sky' | 'plant' | 'coin' | 'mower-coin'

type Motion = Pick<Item, 'velocityX' | 'velocityY' | 'accelerationY' | 'groundY'>

// Each draws from the level's random numbers in the original's order: the sideways speed, the upward one, the ground.
const MOTIONS: Record<ItemMotion, (random: DeterministicRng, y: number) => Motion> = {
    sky: (random) => ({ velocityX: 0, velocityY: 0.67, accelerationY: 0, groundY: random.integer(300, 549) }),
    plant: (random, y) => {
        const velocityX = -0.4 + random.nextFloat() * 0.8, velocityY = -1.7 - random.nextFloat() * 1.7
        return { velocityX, velocityY, accelerationY: 0.09, groundY: y + 15 + random.integer(0, 19) }
    },
    coin: (random, y) => {
        const velocityX = -0.5 + random.nextFloat(), velocityY = -3 - random.nextFloat() * 2
        return { velocityX, velocityY, accelerationY: 0.15, groundY: Math.max(80, Math.min(521, y + 45 + random.integer(0, 19))) }
    },
    'mower-coin': () => ({ velocityX: 0, velocityY: 0, accelerationY: 0.15, groundY: 600 }),
}

/** What comes into the level: its type, what it is worth, its width, its first scale and whether it shows the pickup arrow. */
export interface ItemSpawn {
    readonly typeId: string
    readonly value: number
    readonly width: number
    readonly scale?: number
    readonly arrow?: boolean
    /** The level's award, which lands 30 higher than a coin would. */
    readonly levelAward?: boolean
}

/**
 * Coin::CoinInitialize: an item at (x, y), moving as `motion` says. It is the caller's to say why it came, with the
 * event of its own (a sky sun, a plant's production, loot, the award).
 */
export function spawnItem(world: World, commands: Pick<CommandBuffer, 'createEntity' | 'add'>, spawn: ItemSpawn,
    x: number, y: number, motion: ItemMotion): number {
    const moving = MOTIONS[motion](world.resources.get(RandomResource), y)
    const entity = commands.createEntity()
    commands.add(entity, PositionComponent, { x, y, row: -1 })
    commands.add(entity, ItemComponent, {
        typeId: spawn.typeId, value: spawn.value, state: motion === 'mower-coin' ? 'collecting' : 'available',
        ...moving, groundY: spawn.levelAward ? moving.groundY - 30 : moving.groundY,
        width: spawn.width, disappearTicks: 0, fadeTicks: 0, scale: spawn.scale ?? 1, alpha: 255,
        ...(spawn.arrow ? { arrow: true as const } : {}),
    })
    return entity
}
