import { ModHost } from '@/shared/mod/ModHost'
import * as ecs from '@/ecs/index'
import * as server from './IntegratedGameServer'
import * as session from './session'
import * as commands from './commands'
import * as planting from '../seeds/planting'
import * as tools from '../seeds/tools'
import * as items from '../level/items'
import * as snapshot from './snapshot'
import * as components from '../state/components'
import * as levelState from '../state/levelState'
import * as projectiles from '../combat/projectiles'
import * as zombies from '../zombies/system'
import * as damage from '../zombies/damage'
import * as collision from '../combat/collision'
import * as events from '../state/events'
import * as explosions from '../combat/explosions'
import * as debugRules from '../debug/debugRules'
import * as debugCli from '@/shared/debug/DebugCli'
import * as debugCommands from '../debug/debugCommands'
import * as gameplay from '../registry/GameplayRegistry'
import * as seedBank from '../seeds/seedBank'
import type { DefinitionSources } from '@/shared/content/DefinitionRegistry'

export function createServerModHost(ownerId: string, registry: gameplay.GameplayRegistry, definitions: DefinitionSources): ModHost {
    return new ModHost(ownerId, {
        'ecs': ecs,
        'content/definitions': definitions,
        'server/GameplayRegistry': { ...gameplay, registry },
        'server/IntegratedGameServer': server,
        'server/session': session,
        'server/commands': commands,
        'server/planting': planting,
        'server/tools': tools,
        'server/items': items,
        'server/snapshot': snapshot,
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
        'shared/debug/DebugCli': debugCli,
        'server/debug/DebugCommands': debugCommands,
    })
}
