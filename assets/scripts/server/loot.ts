import type { CommandBuffer, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import {
    EconomyStateResource, type EntityRemover, LawnMowerComponent, LevelStateResource, PositionComponent, RandomResource, ZombieComponent,
} from './components'
import { emitServerEvent, EventQueueResource } from './events'
import { tryDropLevelAward } from './levelAward'
import { ItemComponent, TutorialResource, WaveResource } from './levelState'

const SILVER = 'pvz:coin_silver', GOLD = 'pvz:coin_gold', DIAMOND = 'pvz:diamond'
/** PlayerInfo::AddCoins caps the purse at 99999 coins ($999,990). */
export const MAX_MONEY = 99999

/** Board::CanDropLoot: replays always drop money; the first adventure only from levels that opt in. */
export function canDropLoot(world: World): boolean {
    // Bare system worlds (tests, previews) have no level progress and no loot.
    if (!world.resources.has(TutorialResource)) return false
    return !world.resources.get(TutorialResource).firstAdventure || world.resources.get(LevelStateResource).definition.loot?.firstAdventure === true
}

/** Zombie::DropLoot: the award check comes first, then one roll per zombie. */
export function dropZombieLoot(world: World, definitions: GameplayDefinitions, entity: number, remover: EntityRemover): void {
    const zombie = world.get(entity, ZombieComponent)
    const position = world.get(entity, PositionComponent)
    if (!zombie || !position) return
    tryDropLevelAward(world, definitions, remover, entity)
    if (zombie.droppedLoot) return
    const level = world.resources.get(LevelStateResource).definition
    if ([...world.query(ItemComponent)].some(item => world.get(item, ItemComponent)!.typeId === level.award.id) || !canDropLoot(world)) return
    zombie.droppedLoot = true
    const body = definitions.zombies[zombie.typeId].body
    // GetZombieDefinition().mZombieValue, the same points the wave picker spends on it.
    const value = level.zombiePool?.find(entry => entry.id === zombie.typeId)?.points ?? 1
    dropLootPiece(world, definitions, position.x + body.x + body.width / 2, position.y + body.y + body.height / 4, value)
}

/** Board::DropLootPiece. Presents and chocolate need the Zen Garden and are not installed, so their ranges stay empty. */
function dropLootPiece(world: World, definitions: GameplayDefinitions, x: number, y: number, factor: number): void {
    const level = world.resources.get(LevelStateResource).definition
    const economy = world.resources.get(EconomyStateResource)
    const rules = world.resources.get(TutorialResource).firstAdventure ? level.loot : undefined
    let roll = world.resources.get(RandomResource).integer(0, 29999)
    if (rules?.firstCoinAfterWave !== undefined && !economy.firstCoinDropped && world.resources.get(WaveResource).index > rules.firstCoinAfterWave) roll = 1000
    const typeId = roll < 14 * factor ? (economy.diamonds ? DIAMOND : GOLD) : roll < 250 * factor ? GOLD : roll < 2500 * factor ? SILVER : undefined
    if (!typeId || level.bowling) return
    if (rules?.savingsCap !== undefined) {
        // 2-1 keeps the seed-slot upgrade out of reach until 2-2's dialogue: count the mowers' gold and coins in flight.
        let money = economy.money + definitions.items[typeId].value
        for (const entity of world.query(LawnMowerComponent)) if (world.get(entity, LawnMowerComponent)!.state === 'ready') money += definitions.items[GOLD].value
        for (const entity of world.query(ItemComponent)) {
            const item = world.get(entity, ItemComponent)!
            if (item.state === 'collecting' && definitions.items[item.typeId]?.kind === 'money') money += item.value
        }
        if (money >= rules.savingsCap) return
    }
    const arrow = rules?.firstCoinAfterWave !== undefined && !economy.firstCoinDropped && typeId !== DIAMOND
    spawnLoot(world, definitions, world, typeId, x - 40, y, arrow)
    economy.firstCoinDropped = true
}

/** Coin::CoinInitialize with COIN_MOTION_COIN, or COIN_MOTION_LAWNMOWER_COIN when `collect` (it flies straight to the bank). */
export function spawnLoot(world: World, definitions: GameplayDefinitions, commands: Pick<CommandBuffer, 'createEntity' | 'add'>,
    typeId: string, x: number, y: number, arrow = false, collect = false): number {
    const random = world.resources.get(RandomResource)
    // Coins are drawn from a corner offset of their spawn point; sun keeps it.
    const [dx, dy] = typeId === DIAMOND ? [15, 15] : typeId === SILVER || typeId === GOLD ? [10, 8] : [0, 0]
    const entity = commands.createEntity()
    commands.add(entity, PositionComponent, { x: x - dx, y: y - dy, row: -1 })
    commands.add(entity, ItemComponent, {
        typeId, value: definitions.items[typeId].value, state: collect ? 'collecting' : 'available',
        velocityX: collect ? 0 : -0.5 + random.nextFloat(), velocityY: collect ? 0 : -3 - random.nextFloat() * 2, accelerationY: 0.15,
        width: definitions.items[typeId].width,
        groundY: collect ? 600 : Math.max(80, Math.min(521, y - dy + 45 + random.integer(0, 19))),
        disappearTicks: 0, fadeTicks: 0, scale: 1, alpha: 255, ...(arrow ? { arrow: true as const } : {}),
    })
    const events = world.resources.get(EventQueueResource)
    emitServerEvent(events, 'itemSpawned', { entityId: entity, typeId })
    // Collect() without Coin::PlayCollectSound: the mower coin only plays the rising "points" note.
    if (collect) emitServerEvent(events, 'itemCollected', { entityId: entity, typeId, value: definitions.items[typeId].value, silent: true })
    return entity
}

/** Board::UpdateLevelEndSequence: 200 ticks after the award, the lowest unused mower turns into gold every 40 ticks. */
export function updateMowerCoins(world: World, definitions: GameplayDefinitions, commands: CommandBuffer): void {
    const economy = world.resources.get(EconomyStateResource)
    if (economy.mowerCoinTicks === undefined || --economy.mowerCoinTicks > 0) return
    const mowers = [...world.query(PositionComponent, LawnMowerComponent)]
        .filter(entity => world.get(entity, LawnMowerComponent)!.state === 'ready')
        .sort((left, right) => world.get(right, PositionComponent)!.row - world.get(left, PositionComponent)!.row)
    if (!mowers.length) { delete economy.mowerCoinTicks; return }
    economy.mowerCoinTicks = 40
    const position = world.get(mowers[0], PositionComponent)!
    spawnLoot(world, definitions, commands, GOLD, position.x + 40, position.y + 40, false, true)
    emitServerEvent(world.resources.get(EventQueueResource), 'mowerScored', { entityId: mowers[0], remaining: mowers.length })
    commands.destroyEntity(mowers[0])
}
