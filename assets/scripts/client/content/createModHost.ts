import * as engine from 'cc'
import { ModHost } from '@/shared/mod/ModHost'
import { ModAssets } from '@/shared/mod/ModAssets'
import type { DefinitionSources } from '@/shared/content/DefinitionRegistry'
import { PlantViewRegistry } from '@/client/plants/PlantViewRegistry'
import { ZombieViewRegistry } from '@/client/zombies/ZombieViewRegistry'
import type { ArchiveContentRegistry } from './ArchiveContentRegistry'
import { modResources } from './ModResources'

import * as viewport from '@/client/view/ClientViewport'
import * as menu from '@/client/screens/MainMenuScreen'
import * as animatedPlant from '@/client/plants/AnimatedPlantView'
import * as reanim from '@/client/reanim/ReanimPlayer'
import * as uiNode from '@/client/view/uiNode'
import * as zombieView from '@/client/zombies/ZombieView'
import * as renderer from '@/client/level/LevelEntityRenderer'
import * as preview from '@/client/hud/PlantPreview'
import * as packets from '@/client/hud/SeedPacketRenderer'
import * as content from '@/client/game/loadIntegratedGameContent'
import * as animations from './ClientAnimationRegistry'
import * as sounds from '@/client/sound/LegacySoundSystem'
import * as levelInput from '@/client/level/LevelInputPresenter'
import * as levelHud from '@/client/level/LevelHudPresenter'
import * as seedBank from '@/client/level/LevelSeedBank'
import * as levelView from '@/client/level/LevelView'
import * as debugSettings from '@/platform/debug/GameDebugSettings'
import * as haptics from '@/platform/Haptics'

export class ClientModAssets extends ModAssets {
    sprite(path: string) { return modResources.file(this.id, path, engine.SpriteFrame) }
}

export function createClientModHost(ownerId: string, definitions: DefinitionSources, resources: ArchiveContentRegistry,
    plants: PlantViewRegistry, zombies: ZombieViewRegistry): ModHost {
    return new ModHost(ownerId, {
        'cc': engine,
        'content/definitions': definitions,
        'content/resources': resources,
        'client/views': { plants, zombies },
        'client/view/ClientViewport': viewport,
        'client/screens/MainMenuScreen': menu,
        'client/plants/AnimatedPlantView': animatedPlant,
        'client/reanim/ReanimPlayer': reanim,
        'client/view/uiNode': uiNode,
        'client/zombies/ZombieView': zombieView,
        'client/level/LevelEntityRenderer': renderer,
        'client/hud/PlantPreview': preview,
        'client/hud/SeedPacketRenderer': packets,
        'client/game/loadIntegratedGameContent': content,
        'client/content/ClientAnimationRegistry': animations,
        'client/sound/LegacySoundSystem': sounds,
        'client/level/LevelInputPresenter': levelInput,
        'client/level/LevelHudPresenter': levelHud,
        'client/level/LevelSeedBank': seedBank,
        'client/level/LevelView': levelView,
        'platform/debug/GameDebugSettings': debugSettings,
        'platform/Haptics': haptics,
    })
}
