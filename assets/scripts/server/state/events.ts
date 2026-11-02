import { defineResource } from '@/ecs/index'
import {
    jsonRoundTrip,
    type JsonObject,
    type ServerEvent,
} from '@/shared/protocol/index'

export interface EventQueue {
    nextEventId: number
    events: ServerEvent[]
    /** Sees each event as it is emitted, such as the achievements (the session sets it; not saved). */
    observer?: (event: ServerEvent) => void
}

export const EventQueueResource = defineResource<EventQueue>('pvz:event-queue')

export function createEventQueue(): EventQueue {
    return { nextEventId: 1, events: [] }
}

export function emitServerEvent(queue: EventQueue, type: string, data: JsonObject): ServerEvent {
    if (type.length === 0) throw new Error('Server event type must be non-empty')
    // Events cross to the client without another copy, so they must not share objects with game state.
    data = jsonRoundTrip(data)
    if (!Number.isSafeInteger(queue.nextEventId) || queue.nextEventId < 1) {
        throw new Error('Server event ID must be a positive safe integer')
    }

    const event = { eventId: queue.nextEventId++, type, data }
    queue.events.push(event)
    queue.observer?.(event)
    return event
}

export function drainServerEvents(queue: EventQueue): ServerEvent[] {
    return queue.events.splice(0)
}
