import type { GameCommand } from '@/shared/protocol/index'
import { debugSuccess, parseDebugCliCommand } from '@/shared/debug/DebugCli'
import { LevelStateResource, SeedBankResource } from '../state/components'
import { startConveyor } from '../level/conveyor'
import { executeDebugGameCommand } from '../debug/debugCommands'
import { items } from '../level/items'
import { TutorialResource } from '../state/levelState'
import { planting } from '../seeds/planting'
import { applySeedChoice } from '../seeds/seedChooser'
import type { CommandRejectionCode, QueuedCommand, Session } from './session'
import { tools } from '../seeds/tools'
import { getActiveTutorial } from '../tutorials'

/** Runs one player command. Mods handle their own `mod` commands through `host.around(commands, 'execute', ...)`. */
export const commands = {
    execute(session: Session, command: GameCommand): CommandRejectionCode | undefined {
        const { world } = session
        const level = world.resources.get(LevelStateResource)
        if (level.result !== 'playing' && command.type !== 'pause' && command.type !== 'resume') return 'game-not-playing'
        if (command.type === 'completeIntro') {
            if (level.phase !== 'intro') return 'intro-already-complete'
            if (world.resources.get(SeedBankResource).choosing) return 'seed-choice-incomplete'
            if (getActiveTutorial(world)?.blocksIntro && world.resources.get(TutorialResource).step !== 'complete') return 'intro-not-complete'
            level.phase = 'gameplay'
            startConveyor(world)
            return
        }
        if (command.type === 'pause') {
            level.paused = true
            return
        }
        if (command.type === 'resume') {
            level.paused = false
            return
        }
        if (command.type === 'chooseSeed' || command.type === 'confirmSeeds') {
            return applySeedChoice(world, session.definitions, command)
        }
        if (level.paused) return 'game-paused'
        if (command.type === 'advanceDialog') {
            if (level.phase !== 'intro') return 'unsupported-command'
            getActiveTutorial(world)?.advanceDialog?.(world)
            return
        }
        if (command.type === 'selectTool') return tools.select(session, command.toolId)
        if (command.type === 'useToolAt') return tools.use(session, command.row, command.column)
        if (command.type === 'clearCursor') {
            const bank = world.resources.get(SeedBankResource)
            if (bank.selection.mode !== 'none') getActiveTutorial(world)?.seedCanceled?.(world, session.gameplayTick)
            bank.selection = { mode: 'none' }
            return
        }
        if (level.phase !== 'gameplay') return 'intro-not-complete'

        switch (command.type) {
            case 'selectConveyorPacket': return planting.selectConveyorPacket(session, command.packetId)
            case 'selectSeed': return planting.selectSeed(session, command.seedId, command.slot)
            case 'placePlant': return planting.placePlant(session, command.row, command.column)
            case 'collectItemAt': return items.collect(session, command.itemId)
            default: return 'unsupported-command'
        }
    },
}

/**
 * Runs queued commands that take effect between ticks: session commands at any time, and with `processInput`, player
 * input during gameplay. Returns whether the visible state advanced, which counts as a tick.
 */
export function processBoundaryCommands(session: Session, processInput: boolean): boolean {
    let changed = false
    while (session.commands.length > 0) {
        const command = session.commands[0].command
        const level = session.world.resources.get(LevelStateResource)
        const playing = level.phase === 'gameplay' && !level.paused && level.result === 'playing'
        const inputCommand = processInput && playing && (
            command.type === 'selectSeed' || command.type === 'clearCursor' || command.type === 'placePlant' || command.type === 'mod'
            || command.type === 'selectConveyorPacket' || command.type === 'selectTool' || command.type === 'useToolAt'
        )
        if (!isSessionCommand(command) && !inputCommand && playing) {
            break
        }
        const previousPhase = level.phase
        const previousPaused = level.paused
        const rejection = processNextCommand(session)
        const introInput = previousPhase === 'intro' && (command.type === 'advanceDialog' || command.type === 'selectTool' || command.type === 'useToolAt' || command.type === 'clearCursor')
        if (inputCommand || (rejection === undefined && (introInput || isSessionCommand(command)
            && (command.type === 'debug' || command.type === 'chooseSeed' || command.type === 'confirmSeeds' || level.phase !== previousPhase || level.paused !== previousPaused)))) {
            session.tick++
            changed = true
        }
    }
    return changed
}

/** The schedule's command phase: player input up to the next session command. */
export function processCommandPhase(session: Session): void {
    while (session.commands.length > 0 && !isSessionCommand(session.commands[0].command)) {
        processNextCommand(session)
    }
}

function processNextCommand(session: Session): CommandRejectionCode | undefined {
    const queued = session.commands.shift()!
    if (queued.command.type === 'debug') {
        const { definitions, levels } = session
        const command = queued.command.command
        const parsed = parseDebugCliCommand(command)
        const debug = command === 'catalog' ? {
            ...debugSuccess('Installed debug content'),
            catalog: {
                plants: Object.keys(definitions.seeds).map(id => id.replace(/^pvz:/, '')),
                zombies: Object.keys(definitions.zombies).map(id => id.replace(/^pvz:/, '')),
                items: [...Object.keys(definitions.items).map(id => id.replace(/^pvz:/, '')), 'award'],
                levels: Object.keys(levels.levels).map(id => id.replace(/^pvz:adventure-/, '')),
            },
        } : 'name' in parsed ? executeDebugGameCommand(session.world, definitions, session.gameplayTick, parsed,
            (seedId, row, column) => planting.createPlant(session, seedId, row, column)) : parsed
        session.commandResults.push({ sequence: queued.sequence, debug })
        return
    }
    const rejection = commands.execute(session, queued.command)
    session.commandResults.push({
        sequence: queued.sequence,
        ...(rejection === undefined ? {} : { rejection }),
    })
    return rejection
}

/** Commands that change the session rather than the board; they run between ticks even mid-game. */
function isSessionCommand(command: QueuedCommand): boolean {
    if (command.type === 'debug') return true
    return command.type === 'pause' || command.type === 'resume' || command.type === 'completeIntro'
        || command.type === 'advanceDialog'
        || command.type === 'chooseSeed' || command.type === 'confirmSeeds'
}
