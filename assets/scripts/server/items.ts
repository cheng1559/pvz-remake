import type { GameSystem, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import {
    EconomyStateResource,
    LevelStateResource,
    MAX_SUN,
    PositionComponent,
    RandomResource,
    type Position,
} from './components'
import { ItemComponent, type Item } from './levelState'

const SUN_BANK_X = 15
const SUN_BANK_Y = 0

export function getAvailableSun(world: World, definitions: GameplayDefinitions): number {
    const economy = world.resources.get(EconomyStateResource)
    let sun = economy.sun - economy.pendingSunSpend
    for (const entity of world.query(ItemComponent)) {
        const item = world.get(entity, ItemComponent)!
        if (item.state === 'collecting' && definitions.items[item.typeId]) sun += item.value
    }
    return sun
}

export function createItemSystem(): GameSystem {
    return {
        id: 'pvz:items',
        run({ world, commands }) {
            const level = world.resources.get(LevelStateResource)
            if ((level.result !== 'playing' && level.result !== 'won') || level.paused) return
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
                if (item.state === 'collecting') {
                    const dx = Math.abs(position.x - SUN_BANK_X)
                    const dy = Math.abs(position.y - SUN_BANK_Y)
                    position.x += (SUN_BANK_X - position.x) / 21
                    position.y += (SUN_BANK_Y - position.y) / 21
                    const distance = Math.hypot(dx, dy)
                    if (distance < 8) {
                        const economy = world.resources.get(EconomyStateResource)
                        const spent = Math.min(economy.pendingSunSpend, item.value)
                        economy.pendingSunSpend -= spent
                        economy.sun = Math.min(MAX_SUN, economy.sun + item.value - spent)
                        commands.destroyEntity(entity)
                    } else {
                        item.scale = Math.max(0.5, Math.min(1, distance * 0.05))
                    }
                    continue
                }
                if (item.state === 'fading') {
                    item.alpha = Math.max(0, Math.round(255 * (--item.fadeTicks / 50)))
                    if (item.fadeTicks <= 0) commands.destroyEntity(entity)
                    continue
                }
                if (item.accelerationY) item.scale = Math.min(1, item.scale + 0.02)
                if (position.y + item.velocityY < item.groundY) {
                    moveItemWithinHorizontalBounds(world, position, item)
                    position.y += item.velocityY
                    item.velocityY += item.accelerationY ?? 0
                    continue
                }
                position.y = item.groundY
                position.x = Math.round(position.x)
                if (++item.disappearTicks >= 750) {
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
