import type { ItemCreateArgs, ItemUpdateContext } from './BaseItem'
import { Item } from './BaseItem'

export function createItem(args: ItemCreateArgs, context: ItemUpdateContext) {
    return new Item(args, context)
}

export { Item }
