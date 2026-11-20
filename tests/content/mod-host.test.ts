import assert from 'node:assert/strict'
import test from 'node:test'
import { ModHost, modErrorOwner, modFaults } from '@/shared/mod/ModHost'

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

test('a fault escaping the wrapper chain is reported once with its originating Mod', async () => {
    const inner = new ModHost('inner', {}), outer = new ModHost('outer', {})
    const target = { run(): unknown { throw new Error('base') } }
    const reports: Array<string | undefined> = []
    modFaults.onFault = error => reports.push(error.owner)
    try {
        const forward = new Function('next', 'return next()\n//# sourceURL=pvzmod:///outer/client.js') as (next: () => unknown) => unknown
        outer.around(target, 'run', forward)
        assert.throws(() => target.run(), error =>
            error instanceof Error && error.message === 'base' && !modErrorOwner(error, 'pvzmod:///outer/client.js'))
        outer.dispose()
        const fail = new Function("return new Error('script')\n//# sourceURL=pvzmod:///inner/client.js")() as Error
        inner.replace(target, 'run', () => { throw fail })
        outer.around(target, 'run', next => { try { return next() } catch { return 'handled' } })
        assert.equal(target.run(), 'handled')
        assert.deepEqual(reports, [])
        outer.dispose()
        outer.around(target, 'run', forward)
        assert.throws(() => target.run(), error => error === fail && modFaults.report(error))
        assert.deepEqual(reports, ['inner'])
        assert.equal(modFaults.current?.original, fail)
        assert.throws(() => target.run(), /base/, 'recovery calls bypass patched methods')
        inner.dispose()
        modFaults.current = undefined
        const pending = Promise.reject(fail)
        inner.replace(target, 'run', () => pending)
        assert.equal(target.run(), pending)
        await assert.rejects(pending, (error: unknown) => error === fail && modFaults.report(error))
        assert.deepEqual(reports, ['inner', 'inner'])
        modFaults.current = undefined
        inner.replace(target, 'run', () => { throw 'plain message' })
        assert.throws(() => target.run(), error => error === 'plain message' && modFaults.report(error, '', true))
        assert.equal(modFaults.report(new Error('secondary error')), true)
        assert.deepEqual(reports, ['inner', 'inner', undefined])
    } finally {
        inner.dispose(); outer.dispose()
        modFaults.onFault = undefined
        modFaults.current = undefined
    }
})
