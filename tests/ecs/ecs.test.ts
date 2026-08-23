import assert from 'node:assert/strict'
import test from 'node:test'
import {
    CommandBuffer,
    Schedule,
    SparseSet,
    World,
    defineComponent,
    defineResource,
} from '../../assets/scripts/ecs/index'

test('SparseSet keeps values correct after swap-remove', () => {
    const set = new SparseSet<string>()
    set.set(2, 'two')
    set.set(5, 'five')
    set.set(9, 'nine')

    assert.equal(set.delete(5), true)
    assert.equal(set.get(2), 'two')
    assert.equal(set.get(5), undefined)
    assert.equal(set.get(9), 'nine')
    assert.equal(set.delete(5), false)
})

test('World caches queries and iterates matching entities by EntityId', () => {
    const position = defineComponent<{ x: number }>('pvz:position')
    const health = defineComponent<number>('pvz:health')
    const world = new World()
    const first = world.createEntity()
    const second = world.createEntity()
    const third = world.createEntity()

    world.add(third, position, { x: 3 })
    world.add(first, position, { x: 1 })
    world.add(third, health, 30)
    world.add(second, health, 20)

    const query = world.query(position, health)
    assert.equal(query, world.query(health, position))
    assert.deepEqual([...query], [third])
    assert.deepEqual(world.get(first, position), { x: 1 })
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
})

test('World stores resources and rejects duplicate qualified names', () => {
    const clock = defineResource<{ tick: number }>('pvz:game-clock')
    const duplicateClock = defineResource<{ tick: number }>('pvz:game-clock')
    const world = new World()

    world.resources.set(clock, { tick: 12 })
    assert.deepEqual(world.resources.get(clock), { tick: 12 })
    assert.throws(() => world.resources.set(duplicateClock, { tick: 0 }), /Duplicate resource name/)
    assert.throws(() => defineComponent('position'), /Invalid qualified name/)
    assert.equal(defineComponent('pvz:plant_attack').name, 'pvz:plant_attack')
})

test('CommandBuffer defers structural changes and hides marked entities', () => {
    const health = defineComponent<number>('pvz:health')
    const world = new World()
    const oldEntity = world.createEntity()
    world.add(oldEntity, health, 10)
    const commands = new CommandBuffer(world)
    const newEntity = commands.createEntity()
    commands.add(newEntity, health, 20)
    commands.destroyEntity(oldEntity)

    assert.equal(world.hasEntity(newEntity), false)
    assert.equal(world.hasEntity(oldEntity), false)
    assert.equal(world.has(oldEntity, health), false)
    assert.equal(world.get(oldEntity, health), undefined)
    assert.throws(() => world.add(oldEntity, health, 11), /Unknown entity/)
    assert.deepEqual([...world.query(health)], [])

    commands.flush()
    assert.equal(world.hasEntity(oldEntity), false)
    assert.equal(world.get(newEntity, health), 20)
    assert.deepEqual([...world.query(health)], [newEntity])
})

test('CommandBuffer preserves add-before-destroy record order', () => {
    const marker = defineComponent<string>('test:marker')
    const world = new World()
    const entity = world.createEntity()
    const commands = new CommandBuffer(world)
    commands.add(entity, marker, 'temporary')
    commands.destroyEntity(entity)

    assert.doesNotThrow(() => commands.flush())
    assert.equal(world.hasEntity(entity), false)
})

test('Schedule preserves phase/system order and flushes after each phase', () => {
    const marker = defineComponent<string>('test:marker')
    const world = new World()
    const schedule = new Schedule()
    const calls: string[] = []
    let created = 0

    schedule.add('plant', {
        id: 'test:read',
        run({ world: currentWorld, tick }) {
            calls.push(`read:${tick}`)
            assert.deepEqual([...currentWorld.query(marker)], [created])
        },
    })
    schedule.add('spawn', {
        id: 'test:create',
        run({ commands }) {
            calls.push('create')
            created = commands.createEntity()
            commands.add(created, marker, 'ready')
        },
    })

    schedule.run(world, 7)
    assert.deepEqual(calls, ['create', 'read:7'])
    assert.throws(
        () => schedule.add('cleanup', { id: 'test:late', run() {} }),
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
                () => schedule.add('seed', { id: 'test:late', run() {} }),
                /Schedule is frozen/,
            )
        },
    })
    schedule.run(new World())
})
