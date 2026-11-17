import type { World } from '@/server/state/World'
import { emitServerEvent, EventQueueResource } from '../state/events'
import { TutorialResource } from '../state/resources'

/** Whether `key` has been shown this game (Board::mHelpDisplayed). */
export function adviceShown(world: World, key: string): boolean {
    return world.resources.get(TutorialResource).displayedAdvice.includes(key)
}

/**
 * Board::DisplayAdvice with a help index: advice that shows once a game, remembered with the save. Without a `style`
 * it is only noted as shown (one a tutorial step puts up itself). Says whether it was new.
 */
export function displayAdviceOnce(world: World, key: string, style?: string): boolean {
    const displayed = world.resources.get(TutorialResource).displayedAdvice
    if (displayed.includes(key)) return false
    displayed.push(key)
    if (style) emitServerEvent(world.resources.get(EventQueueResource), 'advice', { key, style })
    return true
}
