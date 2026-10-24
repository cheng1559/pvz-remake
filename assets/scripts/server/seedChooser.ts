import type { World } from '@/ecs'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import type { GameCommand, WorldSnapshot } from '@/shared/protocol'
import { LevelStateResource, SeedBankResource } from './components'
import type { CommandRejectionCode } from './IntegratedGameServer'

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
    if (!level.definition.seedPackets.includes(command.seedId)) return 'seed-not-available'
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
        availableSeeds: [...level.seedPackets], slots: level.seedBankSlots, choosing: bank.choosing === true,
        ...(bank.packets.some(packet => definitions.plants[definitions.seeds[packet.seedId].plant].producer)
            ? {} : { warning: 'SEED_CHOOSER_SUN_WARNING' }),
    }
}
