import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { ZombieView, type ZombieViewContext, type ZombieViewInstance } from './ZombieView'
import { zombieDefinition } from './definitions'

export type ZombieViewFactory = (context: ZombieViewContext) => ZombieViewInstance | Promise<ZombieViewInstance>

export class ZombieViewRegistry extends EntityViewRegistry<ZombieViewContext, ZombieViewInstance> {
    constructor() {
        super(context => ({
            kind: zombieDefinition(context.animations.definitions, context.zombie.typeId).view ?? 'zombie',
            typeId: context.zombie.typeId,
        }))
        this.register('zombie', context => new ZombieView(
            context.node, context.content.registry, context.content.loader, context.animations, context.shadowParent,
            context.assets.shadow, context.assets.sprites, zombieDefinition(context.animations.definitions, context.zombie.typeId),
            context.content.definitions.zombies[context.zombie.typeId].helm,
            context.content.definitions.zombies[context.zombie.typeId].vault?.landingOffset,
            context.attachments,
        ))
    }
}
