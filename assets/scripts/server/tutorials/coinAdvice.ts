import type { World } from '@/ecs/index'
import { displayAdviceOnce } from './advice'

/** Coin::Collect: 2-1 explains silver and gold coins the first time one is picked up. */
export function coinAdvice(world: World, typeId: string): void {
    if (typeId !== 'pvz:coin_silver' && typeId !== 'pvz:coin_gold') return
    displayAdviceOnce(world, 'ADVICE_CLICKED_ON_COIN', 'hint')
}
