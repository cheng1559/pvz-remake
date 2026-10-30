import type { GameplayDefinitions, GameplayLevels } from '@/shared/content/gameplay'
import type { EnabledMod, GameCommand, ServerEvent, StartSessionPacket, WorldSnapshot } from '@/shared/protocol/index'
import { GameplayRegistry } from '../registry/GameplayRegistry'
import { processBoundaryCommands, processCommandPhase } from './commands'
import { EconomyStateResource, LevelStateResource } from '../state/components'
import { getDebugRules } from '../debug/debugRules'
import { EventQueueResource, drainServerEvents } from '../state/events'
import { items } from '../level/items'
import { ItemComponent } from '../state/levelState'
import { restoreSession, saveSession } from './persistence'
import type { ServerSaveSnapshot } from './save'
import { startSession, type CommandResult, type ServerContent, type Session } from './session'
import { snapshot } from './snapshot'

export type { CommandRejectionCode } from './session'

/**
 * Runs one game on a fixed 0.01 second tick: starts or restores the session, queues commands, advances the systems
 * and reports snapshots and events. The rules live in planting, tools, items, commands, snapshot and persistence.
 */
export class IntegratedGameServer {
    private session?: Session
    private readonly content: ServerContent

    constructor(definitions: GameplayDefinitions, levels: GameplayLevels, gameplay = new GameplayRegistry()) {
        if (definitions.tickSeconds !== 0.01) {
            throw new Error('IntegratedGameServer requires a 0.01 second fixed tick')
        }
        gameplay.freeze(definitions)
        this.content = { definitions, levels, gameplay }
    }

    start(packet: StartSessionPacket): WorldSnapshot {
        if (packet.save === undefined) {
            this.session = startSession(this.content, packet)
            return this.snapshot()
        }
        this.session = restoreSession(this.content, packet.save, packet.levelId, packet.mods)
        // The purse lives in the profile and may have changed in the store since this save; take it from the session.
        const economy = this.session.world.resources.get(EconomyStateResource)
        economy.money = packet.initialMoney
        if (packet.packetUpgrades) economy.diamonds = true
        else delete economy.diamonds
        return this.snapshot()
    }

    save(): ServerSaveSnapshot {
        return saveSession(this.requireSession())
    }

    restore(value: unknown, expectedLevelId?: string, expectedMods?: readonly EnabledMod[]): WorldSnapshot {
        this.session = restoreSession(this.content, value, expectedLevelId, expectedMods)
        return this.snapshot()
    }

    enqueueCommand(sequence: number, command: GameCommand): void {
        this.requireSession().commands.push({ sequence, command })
    }

    enqueueDebugCommand(sequence: number, command: string): void {
        this.requireSession().commands.push({ sequence, command: { type: 'debug', command } })
    }

    hasPendingCommands(): boolean {
        return this.requireSession().commands.length > 0
    }

    isPaused(): boolean {
        return this.requireSession().world.resources.get(LevelStateResource).paused
    }

    drainCommandResults(): CommandResult[] {
        return this.requireSession().commandResults.splice(0)
    }

    processBoundaryCommands(processInput = false): boolean {
        return processBoundaryCommands(this.requireSession(), processInput)
    }

    processCommandPhase(): void {
        processCommandPhase(this.requireSession())
    }

    tick(): WorldSnapshot {
        this.step()
        return this.snapshot()
    }

    /** Advances one fixed tick without building a snapshot. */
    step(): void {
        const session = this.requireSession()
        if (this.processBoundaryCommands()) return
        const level = session.world.resources.get(LevelStateResource)
        if (level.phase !== 'gameplay' || level.paused || level.result === 'lost') return
        session.tick++
        session.gameplayTick++
        session.schedule.run(session.world, session.gameplayTick)
        if (getDebugRules(session.world).collect === 'auto') {
            for (const entity of session.world.query(ItemComponent)) {
                const item = session.world.get(entity, ItemComponent)!
                if (session.definitions.items[item.typeId] && item.state === 'available') items.collect(session, entity)
            }
        }
    }

    snapshot(): WorldSnapshot {
        return snapshot.build(this.requireSession())
    }

    drainEvents(): ServerEvent[] {
        return drainServerEvents(this.requireSession().world.resources.get(EventQueueResource))
    }

    private requireSession(): Session {
        if (!this.session) throw new Error('No active game session')
        return this.session
    }
}
