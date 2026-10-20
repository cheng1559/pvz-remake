import { Node, type Tween } from 'cc'
import { gameClock } from './GameClock'

/** Keeps running Cocos tweens in sync with the clock and releases subscriptions with their owner. */
export function startGameTween<T extends object>(owner: Node, animation: Tween<T>): Tween<T> {
    animation.timeScale(gameClock.speed)
    const unsubscribe = gameClock.onSpeedChange(speed => { animation.timeScale(speed) })
    const cleanup = () => {
        unsubscribe()
        owner.off(Node.EventType.NODE_DESTROYED, cleanup)
    }
    owner.once(Node.EventType.NODE_DESTROYED, cleanup)
    return animation.call(cleanup).start()
}
