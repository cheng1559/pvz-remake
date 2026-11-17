import { readGameplaySource } from '../../tools/mod/content'
import { withFixedBanks } from '../fixedBankLevels'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { STRAIGHT } from '@/server/combat/motions'
import { MowingProjectile } from '@/server/combat/MowingProjectile'
import { Projectile } from '@/server/combat/Projectile'
import { ProjectileRegistry } from '@/server/combat/ProjectileRegistry'

const source = readGameplaySource('definitions')
const definitions = parseGameplayDefinitions(source)
const levels = parseGameplayLevels(withFixedBanks(readGameplaySource('levels')), definitions)
/** The base's definitions with some projectiles changed, and the levels of them. */
const changed = (change: (projectiles: Record<string, Record<string, unknown>>) => void) => {
    const copy = structuredClone(source)
    change(copy.projectiles)
    const parsed = parseGameplayDefinitions(copy)
    return [parsed, parseGameplayLevels(withFixedBanks(readGameplaySource('levels')), parsed)] as const
}

test("each projectile is an instance of the kind its definition names, as its presentation's view is, and saves as its fields", () => {
    const registry = new ProjectileRegistry()
    registry.validate(definitions, levels)
    const factory = registry.factory(definitions)
    const make = (id: string) => factory.create(id, definitions.projectiles[id], STRAIGHT)
    assert.deepEqual(['pvz:pea', 'pvz:melon', 'pvz:lawnmower'].map(id => make(id).constructor.name), ['Projectile', 'Projectile', 'MowingProjectile'])
    assert.throws(() => factory.create('example:missing', definitions.projectiles['pvz:pea'], STRAIGHT), /Unknown projectile: example:missing/)
    const presentation = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/projectiles.json', 'utf8')) as Record<string, { view?: string }>
    for (const [id, projectile] of Object.entries(definitions.projectiles)) assert.equal(projectile.kind ?? 'projectile', presentation[id].view ?? 'projectile', id)

    // Its fields are all there is to it: saved as they are, and restored as its kind with its own.
    const mower = make('pvz:lawnmower') as MowingProjectile
    assert.equal(mower.chompCounter, 0, 'made ready to chew')
    Object.assign(mower, { age: 12, chompCounter: 30 })
    const saved = JSON.parse(JSON.stringify(mower))
    const restored = factory.restore(saved, 'saved') as MowingProjectile
    assert.ok(restored instanceof MowingProjectile)
    assert.deepEqual([restored.age, restored.chompCounter, restored.definition], [12, 30, definitions.projectiles['pvz:lawnmower']])
    assert.throws(() => factory.restore({ ...saved, chompCounter: undefined }, 'saved'), /saved\.chompCounter/)
    const pea = JSON.parse(JSON.stringify(make('pvz:pea')))
    assert.ok(factory.restore(pea, 'saved') instanceof Projectile)
    assert.throws(() => factory.restore({ ...pea, chompCounter: 3 }, 'saved'), /saved\.chompCounter is not supported/, 'another kind\'s field')

    // A type's own fields go with the kind that takes them; a level's mowers set off as a kind that mows.
    assert.throws(() => registry.validate(...changed(projectiles => { delete projectiles['pvz:pea'].damage })), /pvz:pea of kind projectile needs damage/)
    assert.throws(() => registry.validate(...changed(projectiles => { projectiles['pvz:lawnmower'].damage = 5 })), /pvz:lawnmower\.damage needs a kind that takes it/)
    assert.throws(() => registry.validate(...changed(projectiles => { projectiles['pvz:pea'].kind = 'example:missing' })), /Projectile kind is not installed: pvz:pea/)
    const [lawnmowerless] = changed(projectiles => { projectiles['pvz:lawnmower'] = { ...projectiles['pvz:pea'] } })
    assert.throws(() => registry.validate(lawnmowerless, parseGameplayLevels(withFixedBanks(readGameplaySource('levels')), lawnmowerless)),
        /levels\.pvz:adventure-1-1\.lawnMower must be a projectile that mows/)
})

test("a Mod's projectile kind extends a base one and does what only it does", () => {
    const registry = new ProjectileRegistry()
    assert.throws(() => registry.register('example', 'example:plain', class {} as never), /Invalid projectile kind/)
    assert.throws(() => registry.register('example', 'mowing', MowingProjectile), /already registered by pvz/)
    // A mower that never slows.
    class Relentless extends MowingProjectile {
        speedScale(): number { return 1 }
    }
    registry.register('example', 'example:relentless', Relentless)
    const [content, contentLevels] = changed(projectiles => { projectiles['pvz:lawnmower'].kind = 'example:relentless' })
    registry.validate(content, contentLevels)
    const mower = registry.factory(content).create('pvz:lawnmower', content.projectiles['pvz:lawnmower'], STRAIGHT)
    assert.ok(mower instanceof Relentless)
    mower.chompCounter = 30
    assert.deepEqual([mower.speedScale(), mower.chompCounter], [1, 30])
    registry.freeze()
    assert.throws(() => registry.register('example', 'example:late', Projectile), /frozen/)
})
