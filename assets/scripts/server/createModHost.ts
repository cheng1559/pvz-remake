import { ModHost } from '@/shared/mod/ModHost'
import * as ecs from '@/ecs/index'
import * as session from './IntegratedGameServer'
import * as components from './components'
import * as levelState from './levelState'
import * as projectiles from './projectiles'
import * as zombies from './zombies/system'
import * as damage from './zombies/damage'
import * as collision from './collision'
import * as events from './events'
import * as explosions from './explosions'
import * as debugRules from './debug/DebugRules'
import * as gameplay from './GameplayRegistry'
import * as seedBank from './seedBank'
import type { DefinitionSources } from '@/shared/content/DefinitionRegistry'

export function createServerModHost(ownerId: string, registry: gameplay.GameplayRegistry, definitions: DefinitionSources): ModHost {
    return new ModHost(ownerId, {
        'ecs': ecs,
        'content/definitions': definitions,
        'server/GameplayRegistry': { ...gameplay, registry },
        'server/IntegratedGameServer': session,
        'server/components': components,
        'server/seedBank': seedBank,
        'server/levelState': levelState,
        'server/projectiles': projectiles,
        'server/zombies/system': zombies,
        'server/zombies/damage': damage,
        'server/collision': collision,
        'server/events': events,
        'server/explosions': explosions,
        'server/debug/DebugRules': debugRules,
    })
}
