import type { GameplayDefinitions, GameplayLevels } from '@/shared/content/gameplay'
import type { GameCommand, ServerEvent, StartSessionPacket, WorldSnapshot } from '@/shared/protocol/index'
import { GameplayRegistry } from '../registry/GameplayRegistry'
import { processBoundaryCommands, processCommandPhase } from './commands'
import { EconomyStateResource, LevelStateResource, SeedBankResource } from '../state/resources'
import { savedSeedBank } from '../seeds/seedChooser'
import { DebugRulesResource, getDebugRules } from '../debug/debugRules'
import { EventQueueResource, drainServerEvents } from '../state/events'
import { items } from '../items/items'
import { restoreSession, saveSession } from './persistence'
import type { ServerSaveSnapshot } from './save'
import { startSession, type CommandResult, type ServerContent, type Session } from './session'
import { snapshot } from './snapshot'
import { getActiveTutorial } from '../tutorials/index'
import { AchievementsResource } from '../achievements/achievements'
import { OwnedToolsResource } from '../seeds/tools'

export type { CommandRejectionCode } from './session'

/**
 * Runs one game on a fixed 0.01 second tick: starts or restores the session, queues commands, advances the systems
 * and reports snapshots and events. The rules live in planting, tools, items, commands, snapshot and persistence.
 */
export class IntegratedGameServer {
    private session?: Session
    private readonly content: ServerContent

    constructor(definitions: GameplayDefinitions, levels: GameplayLevels, gameplay = new GameplayRegistry()) {
        gameplay.freeze(definitions, levels)
        this.content = { definitions, levels, gameplay }
    }

    start(packet: StartSessionPacket): WorldSnapshot {
        this.session = packet.save === undefined ? startSession(this.content, packet)
            : restoreSession(this.content, packet.save, packet.levelId, packet.mods)
        // The switches are not saved; `/cheatseed` comes with the start, as it shapes the chooser the level opens with.
        if (packet.cheatSeeds) this.setCheatSeeds(true)
        // The profile owns the achievements and the tools collected, so a save does not keep them.
        this.session.world.resources.get(AchievementsResource).earned = new Set(packet.earnedAchievements)
        if (packet.ownedTools) this.session.world.resources.set(OwnedToolsResource, [...packet.ownedTools])
        if (packet.save === undefined) return this.snapshot()
        // The purse lives in the profile and may have changed in the store since this save; take it from the session.
        const economy = this.session.world.resources.get(EconomyStateResource)
        economy.money = packet.initialMoney
        economy.ownedUpgrades = packet.packetUpgrades ?? 0
        return this.snapshot()
    }

    save(): ServerSaveSnapshot {
        return saveSession(this.requireSession())
    }

    private setCheatSeeds(cheatSeeds: boolean): void {
        const world = this.requireSession().world
        world.resources.set(DebugRulesResource, { ...getDebugRules(world), cheatSeeds })
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
        // LawnApp::UpdateFrames runs Board::ProcessDeleteQueue before each update, paused or not.
        session.world.freeSlots()
        if (this.processBoundaryCommands()) return
        const level = session.world.resources.get(LevelStateResource)
        // Plant::Update: the plants on the lawn of such an intro go on as in play, while the level waits.
        if (level.phase === 'intro' && !level.paused && getActiveTutorial(session.world)?.plantsLiveInIntro) {
            session.tick++
            session.introSchedule.run(session.world, session.gameplayTick)
            return
        }
        // A repick (`/repick`) stands the level still until its Let's Rock.
        if (level.phase !== 'gameplay' || level.paused || level.result === 'lost' || session.world.resources.get(SeedBankResource).repick) return
        session.tick++
        session.gameplayTick++
        session.schedule.run(session.world, session.gameplayTick)
        if (getDebugRules(session.world).collect === 'auto') {
            for (const item of session.world.items) {
                if (session.definitions.items[item.typeId] && item.state === 'available') items.collect(session, item.id)
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
