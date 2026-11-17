import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'
import { Chomper } from '@/server/plants/Chomper'
import type { PotatoMine } from '@/server/plants/PotatoMine'
import { Plant } from '@/server/plants/Plant'
import { PlantRegistry } from '@/server/plants/PlantRegistry'
import { WallNut } from '@/server/plants/WallNut'

const source = readGameplaySource('definitions')
const definitions = parseGameplayDefinitions(source)
/** The base's definitions with some plants changed. */
const changed = (change: (plants: Record<string, Record<string, unknown>>) => void) => {
    const copy = structuredClone(source)
    change(copy.plants)
    return parseGameplayDefinitions(copy)
}

test("each plant is an instance of the kind its definition names, as its presentation's view is, and saves as its fields", () => {
    const registry = new PlantRegistry()
    registry.validate(definitions)
    const factory = registry.factory(definitions)
    const kinds = {
        'pvz:peashooter': 'Shooter', 'pvz:scaredyshroom': 'ScaredyShroom', 'pvz:sunflower': 'Producer', 'pvz:sunshroom': 'SunShroom',
        'pvz:cherrybomb': 'FusePlant', 'pvz:potatomine': 'PotatoMine', 'pvz:chomper': 'Chomper', 'pvz:gravebuster': 'GraveBuster',
        'pvz:hypnoshroom': 'HypnoShroom', 'pvz:wallnut': 'WallNut', 'pvz:bowling-wallnut': 'BowlingNut',
    }
    assert.deepEqual(Object.keys(kinds).map(id => factory.create(id).constructor.name), Object.values(kinds))
    assert.notEqual(factory.create('pvz:wallnut'), factory.create('pvz:wallnut'), 'one for each plant')
    assert.throws(() => factory.create('example:missing'), /Unknown plant: example:missing/)
    const presentation = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/plants.json', 'utf8')) as Record<string, { view?: string }>
    for (const [id, plant] of Object.entries(definitions.plants)) assert.equal(plant.kind ?? 'plant', presentation[id].view ?? 'plant', id)

    // Made whole, before it is put down: a mine arming its whole time.
    const mine = factory.create('pvz:potatomine') as PotatoMine
    assert.deepEqual([mine.phase, mine.phaseTicks], ['arming', definitions.plants['pvz:potatomine'].mine!.armingTicks])

    // Its fields are all there is to it: saved as they are, and restored as its kind with its own.
    const chomper = factory.create('pvz:chomper') as Chomper
    Object.assign(chomper, { phase: 'digesting', phaseTicks: 123, prey: 'plant', health: 50 })
    const saved = JSON.parse(JSON.stringify(chomper))
    assert.deepEqual([saved.phase, saved.prey, saved.health, 'definition' in saved], ['digesting', 'plant', 50, false])
    const restored = factory.restore(saved, 'saved') as Chomper
    assert.ok(restored instanceof Chomper)
    assert.deepEqual([restored.phase, restored.phaseTicks, restored.prey, restored.health], ['digesting', 123, 'plant', 50])
    assert.throws(() => factory.restore({ ...saved, phase: 'armed' }, 'saved'), /saved\.phase must be ready, biting/, 'another kind\'s phase')
    assert.throws(() => factory.restore({ ...saved, fuseTicks: 3 }, 'saved'), /saved\.fuseTicks is not supported/, 'another kind\'s field')

    // A type's own fields go with the kind that takes them.
    assert.throws(() => registry.validate(changed(plants => { plants['pvz:wallnut'].chomper = plants['pvz:chomper'].chomper })),
        /pvz:wallnut\.chomper needs a kind that takes it/)
    assert.throws(() => registry.validate(changed(plants => { plants['pvz:wallnut'].kind = 'chomper' })), /pvz:wallnut of kind chomper needs chomper/)
    assert.throws(() => registry.validate(changed(plants => { plants['pvz:wallnut'].kind = 'example:missing' })), /Plant kind is not installed: pvz:wallnut/)
})

test("a plant's kind keeps it from the cold: its type always, a potato mine while it rises, and a Mod's kind as it says", () => {
    const registry = new PlantRegistry()
    // A nut that the cold does not reach while it is whole.
    class Hardy extends WallNut {
        keptFromCold(): boolean { return this.health === this.maxHealth || super.keptFromCold() }
    }
    assert.throws(() => registry.register('example', 'example:plain', class {} as never), /Invalid plant kind/)
    assert.throws(() => registry.register('example', 'wallnut', WallNut), /already registered by pvz/)
    registry.register('example', 'example:hardy', Hardy)
    const content = changed(plants => { plants['pvz:wallnut'].kind = 'example:hardy' })
    registry.validate(content)
    const factory = registry.factory(content)

    const mine = factory.create('pvz:potatomine') as PotatoMine
    const kept = () => [mine.keptFromCold(), mine.keptFromIce()]
    assert.deepEqual(kept(), [false, false], 'arming')
    mine.phase = 'rising'
    assert.deepEqual(kept(), [false, true], 'rising, it is only chilled')
    mine.phase = 'armed'
    assert.deepEqual(kept(), [false, false])
    assert.equal(factory.create('pvz:cherrybomb').keptFromIce(), true, 'its type is unfreezable')

    const nut = factory.create('pvz:wallnut')
    assert.ok(nut instanceof Hardy)
    assert.equal(nut.keptFromCold(), true)
    nut.health--
    assert.equal(nut.keptFromCold(), false)
    registry.freeze()
    assert.throws(() => registry.register('example', 'example:late', Plant), /frozen/)
    assert.equal(Object.isFrozen(WallNut.prototype), false, 'its class stays open to a Mod that wraps it')
})
