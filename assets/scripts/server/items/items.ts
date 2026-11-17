import type { GameSystem, World } from '@/server/state/World'
import { collectTarget, type GameplayDefinitions, itemAt, LEVEL_AWARD } from '@/shared/content/gameplay'
import { EconomyStateResource, LevelStateResource, RandomResource, SeedBankResource, type Position } from '../state/components'
import type { Item } from '../state/levelState'
import { emitServerEvent, EventQueueResource } from '../state/events'
import { canDropLoot, updateMowerCoins } from '../level/loot'
import type { CommandRejectionCode, Session } from '../session/session'
import { getActiveTutorial } from '../tutorials'
import { clearCursor } from '../seeds/cursor'
import { seedSunCost } from '../seeds/seedBank'

export function getAvailableSun(world: World, definitions: GameplayDefinitions): number {
    const economy = world.resources.get(EconomyStateResource)
    let sun = economy.sun - economy.pendingSunSpend
    for (const item of world.items) {
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
            for (const item of world.items) {
                const { id: entity, position } = item
                if (item.typeId === LEVEL_AWARD) {
                    if (item.state === 'collecting') continue
                    if (position.y + item.velocityY < item.groundY) {
                        moveItemWithinHorizontalBounds(world, position, item)
                        position.y += item.velocityY
                        item.velocityY += item.accelerationY
                    } else {
                        position.y = item.groundY
                        position.x = Math.round(position.x)
                        // The client adds the award's pickup arrow or seed packet glow once it has landed.
                        item.landed = true
                    }
                    continue
                }
                const money = definitions.items[item.typeId]?.kind === 'money'
                if (item.state === 'collecting') {
                    const target = collectTarget(definitions.items[item.typeId])
                    const dx = Math.abs(position.x - target.x)
                    const dy = Math.abs(position.y - target.y)
                    position.x += (target.x - position.x) / 21
                    position.y += (target.y - position.y) / 21
                    const distance = Math.hypot(dx, dy)
                    if (distance < (money ? 12 : 8)) {
                        const economy = world.resources.get(EconomyStateResource)
                        const events = world.resources.get(EventQueueResource)
                        // Coin::ScoreCoin, when the item reaches its bank.
                        emitServerEvent(events, 'itemScored', { entityId: entity, typeId: item.typeId })
                        if (money) economy.money = Math.min(definitions.economy.maxMoney, economy.money + item.value)
                        else {
                            const spent = Math.min(economy.pendingSunSpend, item.value)
                            economy.pendingSunSpend -= spent
                            economy.sun = Math.min(definitions.economy.maxSun, economy.sun + item.value - spent)
                            // Board::AddSun: the bank afterwards.
                            emitServerEvent(events, 'sunAdded', { sun: economy.sun })
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
                    if (item.fadeTicks <= 0) {
                        // Coin::UpdateFade: it faded away uncollected.
                        emitServerEvent(world.resources.get(EventQueueResource), 'itemExpired', { entityId: entity, typeId: item.typeId })
                        commands.destroyEntity(entity)
                    }
                    continue
                }
                if (item.accelerationY) item.scale = Math.min(definitions.items[item.typeId]?.scale ?? 1, item.scale + 0.02)
                if (position.y + item.velocityY < item.groundY) {
                    moveItemWithinHorizontalBounds(world, position, item)
                    position.y += item.velocityY
                    item.velocityY += item.accelerationY
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
    const maxX = bounds.right - item.width
    if (position.x > maxX) {
        position.x = maxX
        item.velocityX = -0.4 - world.resources.get(RandomResource).nextFloat() * 0.4
    } else if (position.x < bounds.left) {
        position.x = bounds.left
        item.velocityX = 0.4 + world.resources.get(RandomResource).nextFloat() * 0.4
    }
}

/** Picking up sun, money and the level award. Mods wrap these through `host.around(items, name, ...)`. */
export const items = {
    /** Board::MouseDown: the item at (x, y) is collected (itemAt, over the items as the snapshot lists them). */
    collectAt(session: Session, x: number, y: number, award = true): CommandRejectionCode | undefined {
        const { world, definitions } = session
        const lying = [...world.items].map(item => ({ entity: item.id, ...item, ...item.position }))
        const item = itemAt(lying, definitions.items, world.resources.get(LevelStateResource).definition, x, y, award)
        return item ? items.collect(session, item.entity) : 'item-not-found'
    },
    collect(session: Session, itemId: number): CommandRejectionCode | undefined {
        const { world, definitions } = session
        const item = world.items.get(itemId)
        if (!item) return 'item-not-found'
        if (item.state === 'collecting') return 'item-not-found'

        const level = world.resources.get(LevelStateResource)
        const events = world.resources.get(EventQueueResource)
        if (item.typeId === LEVEL_AWARD) {
            item.state = 'collecting'
            const { position } = item
            emitServerEvent(events, 'levelAwardCollected', {
                entityId: itemId,
                awardId: level.definition.award.id,
                x: position.x,
                y: position.y,
            })
            for (const sun of world.items) {
                const entity = sun.id
                if (entity === itemId || !definitions.items[sun.typeId] || sun.state === 'collecting') continue
                sun.state = 'collecting'
                sun.disappearTicks = 0
                sun.fadeTicks = 0
                emitServerEvent(events, 'itemCollected', {
                    entityId: entity,
                    typeId: sun.typeId,
                    value: sun.value,
                })
            }
            clearCursor(world)
            // Board::FadeOutLevel: unused mowers start turning into gold 200 ticks after the award.
            if (canDropLoot(world)) world.resources.get(EconomyStateResource).mowerCoinTicks = 200
            level.result = 'won'
            emitServerEvent(events, 'levelWon', {})
            return
        }

        item.state = 'collecting'
        item.disappearTicks = 0
        item.fadeTicks = 0
        if (definitions.items[item.typeId]?.kind === 'money') {
            emitServerEvent(events, 'itemCollected', { entityId: itemId, typeId: item.typeId, value: item.value })
            getActiveTutorial(world)?.moneyCollected?.(world, item.typeId)
            return
        }
        const availableBefore = getAvailableSun(world, definitions) - item.value
        const availableAfter = availableBefore + item.value
        for (const [slot, packet] of world.resources.get(SeedBankResource).packets.entries()) {
            if (!packet) continue
            const seedCost = seedSunCost(world, definitions, packet.seedId)
            const ready = packet.readyAtTick <= session.gameplayTick
            if (ready && availableBefore < seedCost && availableAfter >= seedCost) {
                emitServerEvent(events, 'seedPacketFlashRequested', { seedId: packet.seedId, slot })
                getActiveTutorial(world)?.seedReady?.(world, definitions, session.gameplayTick, packet.seedId)
            }
            getActiveTutorial(world)?.sunCollected?.(world, session.gameplayTick, packet.seedId, ready && availableAfter >= seedCost)
        }
        emitServerEvent(events, 'itemCollected', {
            entityId: itemId,
            typeId: item.typeId,
            value: item.value,
        })
    },
}
