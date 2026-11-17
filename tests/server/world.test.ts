import assert from 'node:assert/strict'
import test from 'node:test'
import {
    CommandBuffer,
    Schedule,
    World,
    defineResource,
    type EntityId,
} from '@/server/state/World'
import type { Item } from '@/server/state/levelState'

/** An item of the world's `items`, of nothing but its id: the lists hold any object by its id. */
const item = (id: EntityId) => ({ id }) as Item

test('EntityList iterates by EntityId over those there as the iteration starts', () => {
    const world = new World()
    const [first, second, third] = [world.createEntity(), world.createEntity(), world.createEntity()]
    world.insert(world.items, item(third))
    world.insert(world.items, item(first))
    world.insert(world.items, item(second))

    const seen: EntityId[] = []
    for (const { id } of world.items) {
        seen.push(id)
        if (id === first) {
            world.destroyEntity(second)
            world.insert(world.items, item(world.createEntity()))
        }
    }
    assert.deepEqual(seen, [first, third])
    assert.deepEqual([...world.items].map(({ id }) => id), [first, third, third + 1])
    assert.equal(world.hasEntity(second), false)
    assert.equal(world.destroyEntity(second), false)
})

test('World restores its allocator without reusing a destroyed highest EntityId', () => {
    const source = new World()
    source.createEntity()
    source.createEntity()
    const destroyed = source.createEntity()
    source.destroyEntity(destroyed)

    const restored = new World()
    restored.restoreEntityAllocator(source.snapshotEntityAllocator())

    assert.equal(restored.createEntity(), destroyed + 1)
    assert.throws(
        () => restored.restoreEntityAllocator({ nextEntity: 1 }),
        /before allocating entities/,
    )
    const listed = new World()
    listed.insert(listed.items, item(5))
    assert.throws(() => listed.restoreEntityAllocator({ nextEntity: 5 }), /must exceed every active entity/)
})

test('World stores resources and rejects duplicate qualified names', () => {
    const clock = defineResource<{ tick: number }>('pvz:game-clock')
    const duplicateClock = defineResource<{ tick: number }>('pvz:game-clock')
    const world = new World()

    world.resources.set(clock, { tick: 12 })
    assert.deepEqual(world.resources.get(clock), { tick: 12 })
    assert.throws(() => world.resources.set(duplicateClock, { tick: 0 }), /Duplicate resource name/)
    assert.throws(() => defineResource('clock'), /Invalid qualified name/)
})

test('CommandBuffer defers inserts and destroys, hiding the entities marked', () => {
    const world = new World()
    const oldEntity = world.createEntity()
    world.insert(world.items, item(oldEntity))
    const commands = new CommandBuffer(world)
    const newEntity = commands.createEntity()
    const created = item(newEntity)
    commands.insert(world.items, created)
    commands.destroyEntity(oldEntity)

    assert.equal(world.hasEntity(newEntity), false)
    assert.equal(world.hasEntity(oldEntity), false)
    assert.equal(world.items.get(oldEntity), undefined)
    assert.deepEqual([...world.items], [])

    commands.flush()
    assert.equal(world.hasEntity(oldEntity), false)
    assert.equal(world.items.get(newEntity), created)
    assert.deepEqual([...world.items], [created])
})

test('CommandBuffer preserves insert-before-destroy record order', () => {
    const world = new World()
    const entity = world.createEntity()
    const commands = new CommandBuffer(world)
    commands.insert(world.items, item(entity))
    commands.destroyEntity(entity)

    assert.doesNotThrow(() => commands.flush())
    assert.equal(world.hasEntity(entity), false)
})

test('Schedule preserves phase/system order and flushes after each phase', () => {
    const world = new World()
    const schedule = new Schedule()
    const calls: string[] = []
    let created = 0

    schedule.add('plant', {
        id: 'test:read',
        run({ world: currentWorld, tick }) {
            calls.push(`read:${tick}`)
            assert.deepEqual([...currentWorld.items].map(({ id }) => id), [created])
        },
    })
    schedule.add('spawn', {
        id: 'test:create',
        run({ commands, world: currentWorld }) {
            calls.push('create')
            created = commands.createEntity()
            commands.insert(currentWorld.items, item(created))
        },
    })

    schedule.run(world, 7)
    assert.deepEqual(calls, ['create', 'read:7'])
    assert.throws(
        () => schedule.add('item', { id: 'test:late', run() {} }),
        /Schedule is frozen/,
    )
})

test('Schedule can be explicitly frozen before its first run', () => {
    const schedule = new Schedule()
    schedule.freeze()
    assert.throws(
        () => schedule.add('command', { id: 'test:late', run() {} }),
        /Schedule is frozen/,
    )
})

test('Schedule rejects registration from a running system', () => {
    const schedule = new Schedule()
    schedule.add('command', {
        id: 'test:register-during-run',
        run() {
            assert.throws(
                () => schedule.add('spawn', { id: 'test:late', run() {} }),
                /Schedule is frozen/,
            )
        },
    })
    schedule.run(new World())
})
