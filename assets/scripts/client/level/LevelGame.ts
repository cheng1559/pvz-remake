import type { ClientWorldChanges } from '@/client/game/ClientWorld'
import type { ClientPresentationSnapshot } from '@/client/game/ClientPresentationSnapshot'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import type { GameCommand, ServerEvent, StartSessionPacket, WorldSnapshot } from '@/shared/protocol'
import type { LevelPresentationSnapshot } from './LevelPresentationSnapshot'

export type LevelStartOptions = Omit<StartSessionPacket, 'protocolVersion' | 'sequence' | 'type'>

// The level scene depends on this client API, independent of the local server transport.
export interface LevelGame {
    readonly definitions: GameplayDefinitions
    start(options: LevelStartOptions): void
    command(command: GameCommand): void
    update(dtSeconds: number): void
    render(): WorldSnapshot
    drainEvents(): ServerEvent[]
    drainChanges(): ClientWorldChanges
    snapshotPresentation(level: LevelPresentationSnapshot): ClientPresentationSnapshot
    restorePresentation(value: unknown): LevelPresentationSnapshot
}
