import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import type { EntityView } from '@/client/level/LevelStage'
import type { ItemSnapshot } from '@/shared/protocol/index'
import { AwardView } from './AwardView'
import { ItemView, type ItemViewContext } from './ItemView'

/**
 * The views of what lies on the lawn to be picked up: the level's award (`award`), and the rest by the `view` of their
 * presentation, `item` when it names none.
 */
export class ItemViewRegistry extends EntityViewRegistry<ItemViewContext, EntityView<ItemSnapshot>> {
    constructor() {
        super(({ content, item, stage }) => ({
            kind: item.typeId === stage.level.award.id ? 'award' : content.presentation.items[item.typeId]?.view ?? 'item', typeId: item.typeId,
        }))
        this.registerView('item', ItemView)
        this.registerView('award', AwardView)
    }
}
