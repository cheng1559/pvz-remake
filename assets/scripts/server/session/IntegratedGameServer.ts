import type { GameplayDefinitions, GameplayLevels } from '@/shared/content/gameplay'
import type { EnabledMod, GameCommand, ServerEvent, StartSessionPacket, WorldSnapshot } from '@/shared/protocol/index'
import { GameplayRegistry } from '../registry/GameplayRegistry'
import { processBoundaryCommands, processCommandPhase } from './commands'
import { EconomyStateResource, LevelStateResource, SeedBankResource } from '../state/components'
import { savedSeedBank } from '../seeds/seedChooser'
import { getDebugRules } from '../debug/debugRules'
import { EventQueueResource, drainServerEvents } from '../state/events'
import { items } from '../level/items'
import { ItemComponent } from '../state/levelState'
import { restoreSession, saveSession } from './persistence'
import type { ServerSaveSnapshot } from './save'
import { startSession, type CommandResult, type ServerContent, type Session } from './session'
import { snapshot } from './snapshot'
import { AchievementsResource } from '../achievements/achievements'

export type { CommandRejectionCode } from './session'

/**
 * Runs one game on a fixed 0.01 second tick: starts or restores the session, queues commands, advances the systems
 * and reports snapshots and events. The rules live in planting, tools, items, commands, snapshot and persistence.
 */
export class IntegratedGameServer {
    private session?: Session
    private readonly content: ServerContent

    constructor(definitions: GameplayDefinitions, levels: GameplayLevels, gameplay = new GameplayRegistry()) {
        gameplay.freeze(definitions)
        gameplay.validateLevels(levels, definitions)
        gameplay.achievementTriggers.validate(definitions)
        this.content = { definitions, levels, gameplay }
    }

    start(packet: StartSessionPacket): WorldSnapshot {
        this.session = packet.save === undefined ? startSession(this.content, packet)
            : restoreSession(this.content, packet.save, packet.levelId, packet.mods)
        // The profile owns the achievements, so a save does not keep them.
        this.session.world.resources.get(AchievementsResource).earned = new Set(packet.earnedAchievements)
        if (packet.save === undefined) return this.snapshot()
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
        const earned = this.session?.world.resources.get(AchievementsResource).earned
        this.session = restoreSession(this.content, value, expectedLevelId, expectedMods)
        if (earned) this.session.world.resources.get(AchievementsResource).earned = earned
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
        // A repick (`/repick`) stands the level still until its Let's Rock.
        if (level.phase !== 'gameplay' || level.paused || level.result === 'lost' || session.world.resources.get(SeedBankResource).repick) return
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

    /** The world as a save made now holds it: without a repick under way (savedSeedBank). */
    savedSnapshot(): WorldSnapshot {
        const session = this.requireSession(), resources = session.world.resources
        const bank = resources.get(SeedBankResource)
        if (!bank.repick) return this.snapshot()
        resources.set(SeedBankResource, savedSeedBank(bank))
        try { return snapshot.build(session) } finally { resources.set(SeedBankResource, bank) }
    }

    drainEvents(): ServerEvent[] {
        return drainServerEvents(this.requireSession().world.resources.get(EventQueueResource))
    }

    private requireSession(): Session {
        if (!this.session) throw new Error('No active game session')
        return this.session
    }
}
