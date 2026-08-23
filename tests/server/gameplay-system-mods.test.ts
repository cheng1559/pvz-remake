import assert from 'node:assert/strict'
import test from 'node:test'

import { CommandBuffer, World, type SystemContext } from '@/ecs/index'
import { GameplaySystemMods, type GameplaySystemBindings } from '@/server/GameplaySystemMods'

const bindings = {} as GameplaySystemBindings

const context = (): SystemContext => {
    const world = new World()
    return { world, commands: new CommandBuffer(world), tick: 1 }
}

test('gameplay system Mods enhance in registration order and replace the base', () => {
    const calls: string[] = []
    const mods = new GameplaySystemMods()
    mods.forMod('test:first').enhanceSystem('pvz:peashooter', (_context, next) => {
        calls.push('first:before')
        next()
        calls.push('first:after')
    })
    mods.forMod('test:second').enhanceSystem('pvz:peashooter', (_context, next) => {
        calls.push('second:before')
        next()
        calls.push('second:after')
    })
    mods.register('test:replacement', 'pvz:peashooter', 'replace', () => calls.push('replacement'))

    const [{ system }] = mods.apply([{
        phase: 'plant',
        system: { id: 'pvz:peashooter', run: () => calls.push('base') },
    }], bindings)
    system.run(context())

    assert.equal(system.id, 'pvz:peashooter')
    assert.deepEqual(calls, [
        'first:before',
        'second:before',
        'replacement',
        'second:after',
        'first:after',
    ])
})

test('gameplay system Mods reject conflicts, unknown targets, and invalid enhancement chains', () => {
    const mods = new GameplaySystemMods()
    mods.forMod('test:first').replaceSystem('pvz:peashooter', () => {})
    assert.throws(
        () => mods.forMod('test:second').replaceSystem('pvz:peashooter', () => {}),
        /already replaced by test:first/,
    )
    assert.throws(() => mods.apply([], bindings), /unknown gameplay system: pvz:peashooter/)

    const missingNext = new GameplaySystemMods()
    missingNext.forMod('test:bad').enhanceSystem('pvz:peashooter', () => {})
    const [{ system }] = missingNext.apply([{
        phase: 'plant',
        system: { id: 'pvz:peashooter', run: () => {} },
    }], bindings)
    assert.throws(() => system.run(context()), /test:bad did not call next/)
    assert.throws(
        () => missingNext.forMod('test:late').enhanceSystem('pvz:peashooter', (_context, next) => next()),
        /Mods are frozen/,
    )

    let lateNext: (() => void) | undefined
    const asynchronous = new GameplaySystemMods()
    asynchronous.forMod('test:async').enhanceSystem('pvz:peashooter', (_context, next) => {
        lateNext = next
    })
    const [{ system: asynchronousSystem }] = asynchronous.apply([{
        phase: 'plant',
        system: { id: 'pvz:peashooter', run: () => {} },
    }], bindings)
    assert.throws(() => asynchronousSystem.run(context()), /test:async did not call next/)
    assert.throws(() => lateNext!(), /test:async called next outside its run/)
})
