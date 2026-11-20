import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import type { EntityView } from '@/client/level/LevelStage'
import type { ItemSnapshot } from '@/shared/protocol/index'
import { LEVEL_AWARD } from '@/shared/content/gameplay'
import { AwardView } from './AwardView'
import { ItemView, type ItemViewContext } from './ItemView'

/**
 * The views of what lies on the lawn to be picked up: the level's award (LEVEL_AWARD) by `award`, drawn as the level's
 * award is, and the rest by the `view` of their presentation, `item` when it names none.
 */
export class ItemViewRegistry extends EntityViewRegistry<ItemViewContext, EntityView<ItemSnapshot>> {
    constructor() {
        super((presentation, typeId) => typeId === LEVEL_AWARD ? 'award' : presentation.items[typeId] && (presentation.items[typeId].view ?? 'item'),
            context => context.item.typeId)
        this.registerView('item', ItemView)
        this.registerView('award', AwardView)
    }
}
