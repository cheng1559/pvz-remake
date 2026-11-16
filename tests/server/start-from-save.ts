import type { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import type { JsonValue, StartSessionPacket, WorldSnapshot } from '@/shared/protocol/index'

/**
 * Loads a save the way the game does, starting the session with it (IntegratedGameServer.start): the level and Mods
 * the save names unless `start` says others, and the purse and seed-slot upgrades as the save has them, which the game
 * takes from the profile.
 */
export function startFromSave(server: IntegratedGameServer, save: unknown, start: Partial<StartSessionPacket> = {}): WorldSnapshot {
    const saved = save as {
        levelId?: string, mods?: StartSessionPacket['mods'], economy?: { money?: number, packetUpgrades?: number },
        tutorial?: { firstAdventure?: boolean },
    }
    return server.start({
        protocolVersion: 1, sequence: 1, type: 'startSession', randomSeed: 0,
        levelId: saved.levelId ?? '', mods: saved.mods ?? [], initialMoney: saved.economy?.money ?? 0,
        packetUpgrades: saved.economy?.packetUpgrades ?? 0, firstAdventure: saved.tutorial?.firstAdventure ?? false,
        ...start, save: save as JsonValue,
    })
}
