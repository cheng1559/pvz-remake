import type { CommandBuffer, EntityRemover, World } from '@/server/state/World'
import { type GameplayDefinitions, pastAdventureLevel } from '@/shared/content/gameplay'
import { EconomyStateResource, LevelStateResource, RandomResource, TutorialResource, WaveResource } from '../state/resources'
import { lawnMowerCount, readyMowers } from './lawn'
import { emitServerEvent, EventQueueResource } from '../state/events'
import { levelAwardDropped, tryDropLevelAward } from './levelAward'
import { spawnItem } from '../items/itemSpawn'
import { getActiveTutorial } from '../tutorials'
import { levelRule, zombieValue } from '../rules/registry'

const SILVER = 'pvz:coin_silver', GOLD = 'pvz:coin_gold', DIAMOND = 'pvz:diamond'

/** Board::CanDropLoot: the first adventure drops money from level 11 (2-1) on. */
const FIRST_LOOT_LEVEL = 11

/** Board::CanDropLoot: replays always drop money; the first adventure from FIRST_LOOT_LEVEL on. */
export function canDropLoot(world: World): boolean {
    // Bare system worlds (tests, previews) have no level progress and no loot.
    if (!world.resources.has(TutorialResource)) return false
    return !world.resources.get(TutorialResource).firstAdventure ||
        pastAdventureLevel(world.resources.get(LevelStateResource).definition, FIRST_LOOT_LEVEL - 1)
}

/** Zombie::DropLoot: the award check comes first, then one roll per zombie. */
export function dropZombieLoot(world: World, definitions: GameplayDefinitions, entity: number, remover: EntityRemover): void {
    const zombie = world.zombies.get(entity), position = zombie?.position
    if (!zombie || !position) return
    tryDropLevelAward(world, definitions, remover, entity)
    if (zombie.droppedLoot) return
    if (levelAwardDropped(world) || !canDropLoot(world)) return
    const level = world.resources.get(LevelStateResource).definition
    zombie.droppedLoot = true
    const body = definitions.zombies[zombie.typeId].body
    // GetZombieDefinition().mZombieValue, the same points the wave picker spends on it.
    const value = zombieValue(level, definitions, zombie.typeId)
    dropLootPiece(world, definitions, position.x + body.x + body.width / 2, position.y + body.y + body.height / 4, value)
}

/**
 * Plant::UpdateGraveBuster: an eaten grave drops loot at 12 times a plain zombie's odds. It calls Board::DropLootPiece
 * directly, without the zombies' Board::CanDropLoot (graves only appear from 2-1 on, where that allows it anyway).
 */
export function dropGraveLoot(world: World, definitions: GameplayDefinitions, x: number, y: number): void {
    // Bare system worlds (tests, previews) have no level progress and no loot.
    if (!world.resources.has(TutorialResource)) return
    dropLootPiece(world, definitions, x + 40, y, 12)
}

/** Board::DropLootPiece. Presents and chocolate need the Zen Garden and are not installed, so their ranges stay empty. */
function dropLootPiece(world: World, definitions: GameplayDefinitions, x: number, y: number, factor: number): void {
    const economy = world.resources.get(EconomyStateResource)
    const rules = world.resources.get(TutorialResource).firstAdventure ? getActiveTutorial(world)?.loot : undefined
    let roll = world.resources.get(RandomResource).integer(0, 29999)
    if (rules?.firstCoinAfterWave !== undefined && !economy.firstCoinDropped && world.resources.get(WaveResource).index > rules.firstCoinAfterWave) roll = 1000
    if (levelRule(world)?.dropLoot?.(world, definitions, x, y, roll, factor)) return
    const typeId = roll < 14 * factor ? (economy.ownedUpgrades > 0 ? DIAMOND : GOLD) : roll < 250 * factor ? GOLD : roll < 2500 * factor ? SILVER : undefined
    if (!typeId) return
    if (rules?.savingsCap !== undefined) {
        // 2-1 keeps the seed-slot upgrade out of reach until 2-2's dialogue: count coins in flight and a gold coin for
        // each mower on the lawn, set off or not (mLawnMowers.mSize).
        let money = economy.money + definitions.items[typeId].value
        money += lawnMowerCount(world) * definitions.items[GOLD].value
        for (const item of world.items) {
            if (item.state === 'collecting' && definitions.items[item.typeId]?.kind === 'money') money += item.value
        }
        if (money >= rules.savingsCap) return
    }
    const arrow = rules?.firstCoinAfterWave !== undefined && !economy.firstCoinDropped && typeId !== DIAMOND
    spawnLoot(world, definitions, world, typeId, x - 40, y, arrow)
    economy.firstCoinDropped = true
}

/** Coin::CoinInitialize with COIN_MOTION_COIN, or COIN_MOTION_LAWNMOWER_COIN when `collect` (it flies straight to the bank). */
export function spawnLoot(world: World, definitions: GameplayDefinitions, commands: Pick<CommandBuffer, 'createEntity' | 'insert'>,
    typeId: string, x: number, y: number, arrow = false, collect = false): number {
    // Coins are drawn from a corner offset of their spawn point; sun keeps it.
    const [dx, dy] = typeId === DIAMOND ? [15, 15] : typeId === SILVER || typeId === GOLD ? [10, 8] : [0, 0]
    const { value, width } = definitions.items[typeId]
    const entity = spawnItem(world, commands, { typeId, value, width, arrow }, x - dx, y - dy, collect ? 'mower-coin' : 'coin')
    const events = world.resources.get(EventQueueResource)
    emitServerEvent(events, 'itemSpawned', { entityId: entity, typeId })
    // Collect() without Coin::PlayCollectSound: the mower coin only plays the rising "points" note.
    if (collect) emitServerEvent(events, 'itemCollected', { entityId: entity, typeId, value: definitions.items[typeId].value, silent: true })
    return entity
}

/**
 * Board::UpdateLevelEndSequence: 200 ticks after the award, the lowest ready mower (GetBottomLawnMower) turns into gold
 * every 40 ticks, where it waits, and is gone (LawnMower::Die).
 */
export function updateMowerCoins(world: World, definitions: GameplayDefinitions, commands: CommandBuffer): void {
    const economy = world.resources.get(EconomyStateResource)
    if (economy.mowerCoinTicks === undefined || --economy.mowerCoinTicks > 0) return
    const ready = readyMowers(world)
    if (!ready.size) { delete economy.mowerCoinTicks; return }
    economy.mowerCoinTicks = 40
    const row = Math.max(...ready.keys()), mower = ready.get(row)!, { x, y } = world.mowers.get(mower)!.position
    spawnLoot(world, definitions, commands, GOLD, x + 40, y + 40, false, true)
    // CountUntriggerLawnMowers, as the coin's note is pitched by it, still counts this one.
    emitServerEvent(world.resources.get(EventQueueResource), 'mowerScored', { row, remaining: ready.size })
    commands.destroyEntity(mower)
}
