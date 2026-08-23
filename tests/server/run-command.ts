import type { IntegratedGameServer, CommandRejectionCode } from '@/server/IntegratedGameServer'
import type { GameCommand } from '@/shared/protocol/index'

let sequence = 0

export function runCommand(server: IntegratedGameServer, command: GameCommand): CommandRejectionCode | undefined {
    const expectedSequence = ++sequence
    server.enqueueCommand(expectedSequence, command)
    if (command.type === 'pause' || command.type === 'resume' || command.type === 'completeIntro') {
        server.processBoundaryCommands()
    } else {
        server.processCommandPhase()
    }
    const [result] = server.drainCommandResults()
    if (!result || result.sequence !== expectedSequence) throw new Error('Command phase did not consume one command')
    return result.rejection
}
