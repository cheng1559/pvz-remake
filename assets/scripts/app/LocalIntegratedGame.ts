import { IntegratedGameClient } from '@/client/game/IntegratedGameClient'
import { IntegratedGameHost } from '@/server/IntegratedGameHost'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { GameplaySystemMods } from '@/server/GameplaySystemMods'
import { LocalGameChannel } from '@/shared/channel/index'
import type { GameplayDefinitionsV2, GameplayLevelsV2 } from '@/shared/content/gameplay'
import type { GameCommand, JsonValue, StartSessionPacket } from '@/shared/protocol/index'
import type { Adventure11PresentationSnapshotV2 } from '@/client/showcase/Adventure11PresentationSnapshotV2'

export class LocalIntegratedGame {
    private readonly channel = new LocalGameChannel()
    private readonly host: IntegratedGameHost
    private readonly client = new IntegratedGameClient(this.channel)

    constructor(
        readonly definitions: GameplayDefinitionsV2,
        levels: GameplayLevelsV2,
        systemMods = new GameplaySystemMods(),
    ) {
        this.host = new IntegratedGameHost(new IntegratedGameServer(definitions, levels, systemMods), this.channel)
    }

    start(options: Omit<StartSessionPacket, 'protocolVersion' | 'sequence' | 'type'>): void {
        this.client.start(options)
        this.update(0)
    }

    command(command: GameCommand): void {
        this.client.command(command)
    }

    requestSave(): number {
        return this.client.requestSave()
    }

    saveAtBoundary(): JsonValue {
        const sequence = this.client.requestSave()
        this.update(0)
        for (let attempts = 0; this.client.lastSaveSequence !== sequence && attempts < 1000; attempts++) {
            this.update(this.definitions.tickSeconds)
        }
        if (this.client.lastSave === undefined || this.client.lastSaveSequence !== sequence) {
            throw new Error('Server did not return a save at the requested boundary')
        }
        return this.client.lastSave
    }

    snapshotPresentation(adventure11: Adventure11PresentationSnapshotV2) {
        return this.client.snapshot(adventure11)
    }

    restorePresentation(value: unknown): Adventure11PresentationSnapshotV2 {
        return this.client.restore(value)
    }

    update(dtSeconds: number): void {
        this.host.update(dtSeconds)
        this.client.update()
    }

    render() {
        return this.client.render(this.host.interpolationAlpha)
    }

    drainEvents() {
        return this.client.drainEvents()
    }

    drainChanges() {
        return this.client.drainChanges()
    }

    get lastRejection() {
        return this.client.lastRejection
    }

    get lastSave() {
        return this.client.lastSave
    }

    get lastSaveSequence() {
        return this.client.lastSaveSequence
    }
}
