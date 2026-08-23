import type { GameplayDefinitionsV2 } from '@/shared/content/gameplay'
import type { GameSystem } from '@/ecs/index'
import {
    LawnMowerComponent,
    LevelStateResource,
    PositionComponent,
    ZombieComponent,
    mowZombie,
} from './gameplay'
import { EventQueueResource, emitServerEvent } from './events'

const READY_X = -21
const ROW_Y_OFFSET = 23
const BOARD_RIGHT = 800
const CHOMP_READY_TICKS = 25
const CHOMP_ACTIVE_TICKS = 50

export function createMowerSystem(definitions: GameplayDefinitionsV2): GameSystem {
    return {
        id: 'pvz:mower',
        run({ world }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return

            for (const entity of world.query(PositionComponent, LawnMowerComponent)) {
                const position = world.get(entity, PositionComponent)!
                const mower = world.get(entity, LawnMowerComponent)!
                if (mower.state === 'spent') continue
                if (mower.state === 'ready') {
                    position.x = READY_X
                    position.y = level.board.origin.y + position.row * level.board.cell.height + ROW_Y_OFFSET
                }

                const definition = definitions.lawnMowers[mower.typeId]
                for (const zombieEntity of world.query(PositionComponent, ZombieComponent)) {
                    const zombiePosition = world.get(zombieEntity, PositionComponent)!
                    const zombie = world.get(zombieEntity, ZombieComponent)!
                    if (zombiePosition.row !== position.row || zombie.state === 'dying' || zombie.state === 'mowered') continue
                    if (mower.state === 'ready' && !zombie.hasHead) continue
                    const body = definitions.zombies[zombie.typeId].body
                    if (!overlaps(position.x + definition.attack.x, definition.attack.width,
                        zombiePosition.x + body.x, body.width)) continue
                    if (mower.state === 'ready') {
                        emitServerEvent(world.resources.get(EventQueueResource), 'mowerActivated', {
                            entityId: entity,
                            row: position.row,
                        })
                        mower.chompCounter = CHOMP_READY_TICKS
                    } else {
                        mower.chompCounter = CHOMP_ACTIVE_TICKS
                    }
                    mower.state = 'active'
                    mowZombie(zombie)
                    emitServerEvent(world.resources.get(EventQueueResource), 'zombieMowered', {
                        mowerId: entity,
                        zombieId: zombieEntity,
                    })
                }

                if (mower.state !== 'active') continue
                let speed = definition.speedPerTick
                if (mower.chompCounter > 0) {
                    mower.chompCounter--
                    speed = bounceSlowMiddle(
                        CHOMP_ACTIVE_TICKS, 0, mower.chompCounter, definition.speedPerTick, 1,
                    )
                }
                position.x += speed
                if (position.x > BOARD_RIGHT) mower.state = 'spent'
            }
        },
    }
}

function bounceSlowMiddle(timeStart: number, timeEnd: number, age: number, start: number, end: number): number {
    const warpedAge = (age - timeStart) / (timeEnd - timeStart)
    if (warpedAge <= 0 || warpedAge >= 1) return start
    const bounce = 1 - Math.abs(2 * warpedAge - 1)
    const invQuad = 2 * bounce - bounce * bounce
    return (end - start) * invQuad + start
}

function overlaps(leftA: number, widthA: number, leftB: number, widthB: number): boolean {
    return Math.min(leftA + widthA, leftB + widthB) > Math.max(leftA, leftB)
}
