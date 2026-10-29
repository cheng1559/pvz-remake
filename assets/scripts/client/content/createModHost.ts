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
import * as sounds from '@/client/sound/SoundSystem'
import * as levelInput from '@/client/level/LevelInputPresenter'
import * as levelHud from '@/client/level/LevelHudPresenter'
import * as seedBank from '@/client/level/LevelSeedBank'
import * as levelView from '@/client/level/LevelView'
import * as debugSettings from '@/platform/debug/GameDebugSettings'
import * as debugCli from '@/shared/debug/DebugCli'
import * as debugCommands from '@/platform/debug/DebugCliCommands'
import * as haptics from '@/platform/Haptics'
import * as clock from '@/core/GameClock'

export class ClientModAssets extends ModAssets {
    /** An image file in this Mod's archive, read as is. */
    sprite(path: string) { return modResources.file(this.id, path, engine.SpriteFrame) }
    /** An image by resource ID: the Mod's own registration, unless a pack with higher priority replaces it (e.g. HD). */
    async spriteResource(id: string) {
        const frame = await modResources.sprite(id)
        if (!frame) throw new Error(`Sprite is not installed: ${id}`)
        return frame
    }
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
        'client/sound/SoundSystem': sounds,
        'client/level/LevelInputPresenter': levelInput,
        'client/level/LevelHudPresenter': levelHud,
        'client/level/LevelSeedBank': seedBank,
        'client/level/LevelView': levelView,
        'platform/debug/GameDebugSettings': debugSettings,
        'shared/debug/DebugCli': debugCli,
        'platform/debug/DebugCliCommands': debugCommands,
        'platform/Haptics': haptics,
        'core/GameClock': clock,
    })
}
