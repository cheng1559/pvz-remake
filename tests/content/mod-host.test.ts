import assert from 'node:assert/strict'
import test from 'node:test'
import { ModHost } from '@/shared/mod/ModHost'

test('host wrappers compose on real methods, preserve this and restore descriptors in any disposal order', () => {
    class Target { constructor(readonly value: number) {} sum(x: number) { return this.value + x } }
    const descriptor = Object.getOwnPropertyDescriptor(Target.prototype, 'sum')
    const first = new ModHost('test:first', { Target }), second = new ModHost('test:second', { Target })
    assert.equal(first.get('Target'), Target)
    assert.throws(() => first.get('missing'), /unavailable/)
    first.around(Target.prototype, 'sum', function (next, x) { return next(x * 2) + this.value })
    second.around(Target.prototype, 'sum', function (next, x) { return next(x + 1) * 3 })
    const instance = new Target(5)
    assert.equal(instance.sum(2), 48)
    first.dispose()
    assert.equal(instance.sum(2), 24)
    second.dispose()
    assert.deepEqual(Object.getOwnPropertyDescriptor(Target.prototype, 'sum'), descriptor)
    assert.equal(instance.sum(2), 7)
    first.replace(instance, 'sum', function (this: Target, x) { return this.value - x })
    assert.equal(instance.sum(2), 3)
    first.dispose(); first.dispose()
    assert.equal(Object.hasOwn(instance, 'sum'), false)
    assert.equal(instance.sum(2), 7)
    assert.throws(() => first.around(instance, 'missing', () => {}), /unavailable/)
})

test('an in-flight asynchronous call retains its patch chain while later calls see disposal', async () => {
    const host = new ModHost('test:async', {})
    const target = { value: 2, async run(x: number) { return this.value * x } }
    let resume!: () => void
    const ready = new Promise<void>(resolve => { resume = resolve })
    host.around(target, 'run', async function (next, x) { await ready; return await next(x + 1) + this.value })
    const pending = target.run(3)
    host.dispose(); resume()
    assert.equal(await pending, 10)
    assert.equal(await target.run(3), 6)
})
