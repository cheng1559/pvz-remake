import { LevelStateResource, SeedBankResource } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { planting } from './planting'
import type { CommandRejectionCode, Session } from '../session/session'
import { getActiveTutorial } from '../tutorials'
import { TutorialResource } from '../state/levelState'
import { levelTools } from '@/shared/content/gameplay'
import { clearCursor } from './cursor'
import { canShovel } from '@/shared/content/planting'
import { plantInPlay } from '../level/lawn'

/** Cursor tools such as the shovel, each doing what its definition's `kind` does. Mods wrap these through `host.around(tools, name, ...)`. */
export const tools = {
    /** The tools this game has, whether usable now or not. */
    owned(session: Session): string[] {
        return levelTools(session.levels, session.world.resources.get(LevelStateResource).definition, session.world.resources.get(TutorialResource).firstAdventure)
    },

    available(session: Session, toolId: string): boolean {
        const level = session.world.resources.get(LevelStateResource)
        return tools.owned(session).includes(toolId) && !level.paused && level.result === 'playing' &&
            (level.phase === 'gameplay' || getActiveTutorial(session.world)?.canSelectTool?.(session.world, session.definitions.tools[toolId]) === true)
    },

    select(session: Session, toolId: string): CommandRejectionCode | undefined {
        const { world } = session
        if (!tools.available(session, toolId)) return 'unsupported-command'
        world.resources.get(SeedBankResource).selection = { mode: 'tool', toolId }
        getActiveTutorial(world)?.toolSelected?.(world)
        emitServerEvent(world.resources.get(EventQueueResource), 'toolSelected', { toolId })
    },

    use(session: Session, row: number, column: number): CommandRejectionCode | undefined {
        const { world, definitions } = session
        const bank = world.resources.get(SeedBankResource)
        const tool = bank.selection.mode === 'tool' ? definitions.tools[bank.selection.toolId] : undefined
        if (tool?.kind !== 'shovel') return 'unsupported-command'
        // Board::MouseDownWithTool for a shovel, Board::ToolHitTestHelper: the cell's plant, unless the shovel cannot dig
        // it up (canShovel).
        const found = planting.findPlantAt(session, row, column)
        const plant = found === undefined ? undefined : plantInPlay(world, found)!
        const entity = plant && canShovel(definitions.plants, plant) ? found : undefined
        clearCursor(world)
        if (entity !== undefined) {
            world.destroyEntity(entity)
            getActiveTutorial(world)?.plantRemoved?.(world)
            emitServerEvent(world.resources.get(EventQueueResource), 'plantShoveled', { entityId: entity })
        } else {
            getActiveTutorial(world)?.seedCanceled?.(world, session.definitions, session.gameplayTick)
            emitServerEvent(world.resources.get(EventQueueResource), 'toolMissed', {})
        }
    },
}
