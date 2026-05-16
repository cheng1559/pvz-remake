import type { ItemEntity } from '../GameTypes'

export const MONEY_ITEM_SPRITES: Partial<Record<ItemEntity['type'], string>> = {
    'silver-coin': 'coin_silver_dollar',
    'gold-coin': 'coin_gold_dollar',
    diamond: 'diamond',
}

export const MONEY_STATIC_GLOW_X = -4
export const MONEY_STATIC_GLOW_Y = 2
export const MONEY_COIN_REANIM_X = -21
export const MONEY_COIN_REANIM_Y = 21
export const MONEY_COIN_ANIMATION_SPEED_MIN = 0.6
export const MONEY_COIN_ANIMATION_SPEED_MAX = 1.0
export const MONEY_DIAMOND_REANIM_X = -34
export const MONEY_DIAMOND_REANIM_Y = 26
export const MONEY_DIAMOND_ANIMATION_RATE_MIN = 50
export const MONEY_DIAMOND_ANIMATION_RATE_MAX = 80
