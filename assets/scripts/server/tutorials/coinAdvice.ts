import type { World } from '@/ecs/index'
import { emitServerEvent, EventQueueResource } from '../state/events'
import { TutorialResource } from '../state/levelState'

/** Coin::Collect: 2-1 explains silver and gold coins the first time one is picked up. */
export function coinAdvice(world: World, typeId: string): void {
    if (typeId !== 'pvz:coin_silver' && typeId !== 'pvz:coin_gold') return
    const displayed = world.resources.get(TutorialResource).displayedAdvice ??= []
    if (displayed.includes('ADVICE_CLICKED_ON_COIN')) return
    displayed.push('ADVICE_CLICKED_ON_COIN')
    emitServerEvent(world.resources.get(EventQueueResource), 'advice', { key: 'ADVICE_CLICKED_ON_COIN', style: 'hint' })
}
