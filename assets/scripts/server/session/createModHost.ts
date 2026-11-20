import { ModHost } from '@/shared/mod/ModHost'
import type { GameplayRegistry } from '../registry/GameplayRegistry'
import type { DefinitionSources } from '@/shared/content/DefinitionRegistry'
import { SERVER_HOST_MODULES } from './hostModules'

/** Every server module by its path (hostModules, generated), and the host's definitions and gameplay registry. */
export function createServerModHost(ownerId: string, registry: GameplayRegistry, definitions: DefinitionSources): ModHost {
    return new ModHost(ownerId, {
        ...SERVER_HOST_MODULES,
        'content/definitions': definitions,
        'gameplay/registry': registry,
    })
}
