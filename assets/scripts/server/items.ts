import type { GameSystem, World } from '@/ecs/index'
import { SUN_BANK_TARGET, type GameplayDefinitions } from '@/shared/content/gameplay'
import {
    EconomyStateResource,
    LevelStateResource,
    MAX_SUN,
    PositionComponent,
    RandomResource,
    type Position,
} from './components'
import { ItemComponent, type Item } from './levelState'
import { emitServerEvent, EventQueueResource } from './events'
import { MAX_MONEY, updateMowerCoins } from './loot'

/** Coin::UpdateCollected: sun flies to the sun bank, money to the coin bank at the bottom left. */
const COIN_BANK_TARGET = { x: 39, y: 558 }

export function getAvailableSun(world: World, definitions: GameplayDefinitions): number {
    const economy = world.resources.get(EconomyStateResource)
    let sun = economy.sun - economy.pendingSunSpend
    for (const entity of world.query(ItemComponent)) {
        const item = world.get(entity, ItemComponent)!
        if (item.state === 'collecting' && definitions.items[item.typeId] && definitions.items[item.typeId].kind !== 'money') sun += item.value
    }
    return sun
}

export function createItemSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:items',
        run({ world, commands }) {
            const level = world.resources.get(LevelStateResource)
            if ((level.result !== 'playing' && level.result !== 'won') || level.paused) return
            if (level.result === 'won') updateMowerCoins(world, definitions, commands)
            for (const entity of world.query(PositionComponent, ItemComponent)) {
                const position = world.get(entity, PositionComponent)!
                const item = world.get(entity, ItemComponent)!
                if (item.typeId === level.definition.award.id) {
                    if (item.state === 'collecting') continue
                    if (position.y + item.velocityY < item.groundY) {
                        moveItemWithinHorizontalBounds(world, position, item)
                        position.y += item.velocityY
                        item.velocityY += 0.15
                    } else {
                        position.y = item.groundY
                        position.x = Math.round(position.x)
                    }
                    continue
                }
                const money = definitions.items[item.typeId]?.kind === 'money'
                if (item.state === 'collecting') {
                    const target = money ? COIN_BANK_TARGET : SUN_BANK_TARGET
                    const dx = Math.abs(position.x - target.x)
                    const dy = Math.abs(position.y - target.y)
                    position.x += (target.x - position.x) / 21
                    position.y += (target.y - position.y) / 21
                    const distance = Math.hypot(dx, dy)
                    if (distance < (money ? 12 : 8)) {
                        const economy = world.resources.get(EconomyStateResource)
                        if (money) economy.money = Math.min(MAX_MONEY, economy.money + item.value)
                        else {
                            const spent = Math.min(economy.pendingSunSpend, item.value)
                            economy.pendingSunSpend -= spent
                            economy.sun = Math.min(MAX_SUN, economy.sun + item.value - spent)
                        }
                        commands.destroyEntity(entity)
                    } else {
                        // Coin::Update shrinks collected sun toward the counter, scaled like the small sun's 0.5.
                        item.scale = Math.max(0.5, Math.min(1, distance * 0.05)) * (definitions.items[item.typeId]?.scale ?? 1)
                    }
                    continue
                }
                if (item.state === 'fading') {
                    item.alpha = Math.max(0, Math.round(255 * (--item.fadeTicks / 50)))
                    if (item.fadeTicks <= 0) commands.destroyEntity(entity)
                    continue
                }
                if (item.accelerationY) item.scale = Math.min(definitions.items[item.typeId]?.scale ?? 1, item.scale + 0.02)
                if (position.y + item.velocityY < item.groundY) {
                    moveItemWithinHorizontalBounds(world, position, item)
                    position.y += item.velocityY
                    item.velocityY += item.accelerationY ?? 0
                    continue
                }
                position.y = item.groundY
                position.x = Math.round(position.x)
                if (!item.landed) {
                    item.landed = true
                    emitServerEvent(world.resources.get(EventQueueResource), 'itemLanded', { entityId: entity, typeId: item.typeId })
                }
                // Coin::GetDisappearTime: a bouncy arrow doubles the usual 750 ticks.
                if (++item.disappearTicks >= (item.arrow ? 1500 : definitions.items[item.typeId]?.lifetimeTicks ?? 750)) {
                    item.state = 'fading'
                    item.fadeTicks = 50
                }
            }
        },
    }
}

function moveItemWithinHorizontalBounds(world: World, position: Position, item: Item): void {
    position.x += item.velocityX
    const bounds = world.resources.get(LevelStateResource).board.bounds
    const maxX = bounds.right - (item.width ?? 60)
    if (position.x > maxX) {
        position.x = maxX
        item.velocityX = -0.4 - world.resources.get(RandomResource).nextFloat() * 0.4
    } else if (position.x < bounds.left) {
        position.x = bounds.left
        item.velocityX = 0.4 + world.resources.get(RandomResource).nextFloat() * 0.4
    }
}
