import type { World } from '@/ecs'
import type { GameplayDefinitions, LevelDefinition } from '@/shared/content/gameplay'
import type { GameCommand, WorldSnapshot } from '@/shared/protocol'
import { LevelStateResource, SeedBankResource } from './components'
import type { CommandRejectionCode } from './IntegratedGameServer'
import { TutorialResource } from './levelState'

/** Keep one catalog and its ordering; first-adventure unlocks belong to seed definitions. */
export function availableSeeds(definitions: GameplayDefinitions, level: LevelDefinition, firstAdventure: boolean): string[] {
    return definitions.seedCatalog.filter(id => !firstAdventure || (definitions.seeds[id].unlockAdventureIndex ?? 1) <= level.adventureIndex)
}

export function applySeedChoice(world: World, definitions: GameplayDefinitions, command: Extract<GameCommand, { type: 'chooseSeed' | 'confirmSeeds' }>): CommandRejectionCode | undefined {
    const level = world.resources.get(LevelStateResource)
    const bank = world.resources.get(SeedBankResource)
    if (level.paused) return 'game-paused'
    if (level.phase !== 'intro' || !bank.choosing) return 'not-choosing-seeds'
    if (command.type === 'confirmSeeds') {
        if (bank.packets.length !== level.definition.seedBankSlots) return 'seed-choice-incomplete'
        bank.choosing = false
        return
    }
    if (!availableSeeds(definitions, level.definition, world.resources.get(TutorialResource).firstAdventure).includes(command.seedId)) return 'seed-not-available'
    const index = bank.packets.findIndex(packet => packet.seedId === command.seedId)
    if (index >= 0) bank.packets.splice(index, 1)
    else {
        if (bank.packets.length >= level.definition.seedBankSlots!) return 'seed-bank-full'
        const cooldown = definitions.seeds[command.seedId].initialCooldownTicks ?? 0
        bank.packets.push({ seedId: command.seedId, readyAtTick: cooldown, cooldownTotal: cooldown })
    }
}

export function seedChooserSnapshot(world: World, definitions: GameplayDefinitions): WorldSnapshot['seedChooser'] {
    const level = world.resources.get(LevelStateResource).definition
    if (level.seedBankSlots === undefined) return
    const bank = world.resources.get(SeedBankResource)
    return {
        availableSeeds: availableSeeds(definitions, level, world.resources.get(TutorialResource).firstAdventure), slots: level.seedBankSlots, choosing: bank.choosing === true,
        ...(bank.packets.some(packet => definitions.plants[definitions.seeds[packet.seedId].plant].producer)
            ? {} : { warning: 'SEED_CHOOSER_SUN_WARNING' }),
    }
}
