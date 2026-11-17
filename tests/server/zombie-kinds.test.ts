import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'
import { PoleVaulter } from '@/server/zombies/PoleVaulter'
import { FlagZombie } from '@/server/zombies/FlagZombie'
import { World } from '@/server/state/World'
import { createEventQueue, drainServerEvents, EventQueueResource } from '@/server/state/events'
import { Zombie } from '@/server/zombies/Zombie'
import { ZombieRegistry } from '@/server/zombies/ZombieRegistry'

const source = readGameplaySource('definitions')
const definitions = parseGameplayDefinitions(source)
/** The base's definitions with some zombies changed. */
const changed = (change: (zombies: Record<string, Record<string, unknown>>) => void) => {
    const copy = structuredClone(source)
    change(copy.zombies)
    return parseGameplayDefinitions(copy)
}

test("each zombie is an instance of the kind its definition names, as its presentation's view is, and saves as its fields", () => {
    const registry = new ZombieRegistry()
    registry.validate(definitions)
    const factory = registry.factory(definitions)
    assert.deepEqual(['pvz:normal', 'pvz:pole_vaulter', 'pvz:dancer', 'pvz:backup_dancer', 'pvz:newspaper'].map(id => factory.create(id).constructor.name),
        ['Zombie', 'PoleVaulter', 'Dancer', 'Dancer', 'Newspaper'])
    assert.notEqual(factory.create('pvz:normal'), factory.create('pvz:normal'), 'one for each zombie')
    assert.throws(() => factory.create('example:missing'), /Unknown zombie: example:missing/)
    const presentation = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/zombies.json', 'utf8')) as Record<string, { view?: string }>
    for (const [id, zombie] of Object.entries(definitions.zombies)) assert.equal(zombie.kind ?? 'zombie', presentation[id].view ?? 'zombie', id)

    // Its fields are all there is to it: saved as they are, and restored as its kind with its own.
    const vaulter = factory.create('pvz:pole_vaulter') as PoleVaulter
    vaulter.hasPole = false
    vaulter.health = 123
    const saved = JSON.parse(JSON.stringify(vaulter))
    assert.deepEqual([saved.hasPole, saved.health, 'definition' in saved], [false, 123, false])
    const restored = factory.restore(saved, 'saved') as PoleVaulter
    assert.ok(restored instanceof PoleVaulter)
    assert.deepEqual([restored.hasPole, restored.health, restored.attackRect()], [false, 123, definitions.zombies['pvz:pole_vaulter'].vault!.landedAttack])
    assert.throws(() => factory.restore({ ...saved, hasPole: 1 }, 'saved'), /saved\.hasPole must be a boolean/)
    assert.throws(() => factory.restore({ ...saved, phase: 'walk' }, 'saved'), /saved\.phase is not supported/, 'another kind\'s field')

    // A type's own fields go with the kind that takes them.
    assert.throws(() => registry.validate(changed(zombies => { delete zombies['pvz:pole_vaulter'].kind })), /pvz:pole_vaulter\.vault needs a kind that takes it/)
    assert.throws(() => registry.validate(changed(zombies => { zombies['pvz:normal'].kind = 'polevaulter' })), /pvz:normal of kind polevaulter needs vault/)
    assert.throws(() => registry.validate(changed(zombies => { zombies['pvz:normal'].kind = 'example:missing' })), /Zombie kind is not installed: pvz:normal/)
})

test("a Mod's kind extends a base one, takes its fields and answers what only it does", () => {
    const registry = new ZombieRegistry()
    assert.throws(() => registry.register('example', 'example:plain', class {} as never), /Invalid zombie kind/)
    assert.throws(() => registry.register('example', 'polevaulter', PoleVaulter), /already registered by pvz/)
    // A pole vaulter a chomper misses once it is hurt, whatever it holds.
    class Wary extends PoleVaulter {
        dodgesBite(): boolean { return this.health < 100 || super.dodgesBite() }
    }
    registry.register('example', 'example:wary', Wary)
    const content = changed(zombies => { zombies['pvz:pole_vaulter'].kind = 'example:wary' })
    registry.validate(content)
    const vaulter = registry.factory(content).create('pvz:pole_vaulter') as Wary
    assert.ok(vaulter instanceof Wary)
    vaulter.hasPole = false
    assert.equal(vaulter.dodgesBite(), false)
    vaulter.health = 50
    assert.equal(vaulter.dodgesBite(), true)
    registry.freeze()
    assert.throws(() => registry.register('example', 'example:late', Zombie), /frozen/)
    assert.equal(Object.isFrozen(PoleVaulter.prototype), false, 'its class stays open to a Mod that wraps it')
})

test("a pole vaulter holding its pole slips from a chomper's bite unless it stands frozen, and a potato mine passes it over", () => {
    const factory = new ZombieRegistry().factory(definitions)
    const vaulter = factory.create('pvz:pole_vaulter') as PoleVaulter
    const asked = () => [vaulter.dodgesBite(), vaulter.evades('pvz:mine'), vaulter.evades('pvz:other')]
    assert.deepEqual(asked(), [true, true, false])
    vaulter.frozenTicks = 10
    assert.deepEqual(asked(), [false, true, false], 'a chomper bites one standing frozen')
    delete vaulter.frozenTicks
    vaulter.hasPole = false
    assert.deepEqual(asked(), [false, false, false])
    const plain = factory.create('pvz:normal')
    assert.deepEqual([plain.dodgesBite(), plain.evades('pvz:mine')], [false, false])
})

test('the flag zombie lets its flag go once, as it loses its head, falls or is mowed; any other zombie carries nothing', () => {
    const factory = new ZombieRegistry().factory(definitions)
    const world = new World()
    world.resources.set(EventQueueResource, createEventQueue())
    const entity = world.createEntity(), flag = factory.create('pvz:flag')
    world.insert(world.zombies, Object.assign(flag, { id: entity, position: { x: 0, y: 0, row: 0 } }))
    flag.animations = { body: { clip: 'walk', time: 0, rate: 12 }, flag: { clip: 'flag', time: 0, rate: 15 } }
    assert.ok(flag instanceof FlagZombie)
    flag.dropCarried(world)
    flag.dropCarried(world)
    assert.deepEqual([Object.keys(flag.animations), drainServerEvents(world.resources.get(EventQueueResource)).map(event => event.data.part)], [['body'], ['flag']])
    const plain = factory.create('pvz:normal')
    plain.animations = { body: { clip: 'walk', time: 0, rate: 12 }, flag: { clip: 'flag', time: 0, rate: 15 } }
    plain.dropCarried(world)
    assert.deepEqual(Object.keys(plain.animations), ['body', 'flag'])
    assert.throws(() => new ZombieRegistry().validate(changed(zombies => { zombies['pvz:normal'].kind = 'flag' })), /pvz:normal of kind flag needs a flag layer/)
})
