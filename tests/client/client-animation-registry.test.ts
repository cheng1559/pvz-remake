import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { ClientAnimationRegistry } from '../../assets/scripts/client/content/ClientAnimationRegistry'

test('client animations compose enhancements and allow one complete replacement', () => {
    const animations = new ClientAnimationRegistry()
    animations.register('solar-pea', 'pvz:peashooter', 'enhance', {
        shootHead: { rateScale: 1.5 },
    })
    assert.equal(animations.resolve('pvz:peashooter').shootHead.rateScale, 1.5)

    const replacement = {
        body: { reanimId: 'mod:body', rateScale: 1, x: 0, y: 0 },
        idleHead: { reanimId: 'mod:idle', rateScale: 1, x: 1, y: 2, attachmentTrackId: 'stem' },
        shootHead: { reanimId: 'mod:shoot', rateScale: 2, x: 1, y: 2, attachmentTrackId: 'stem' },
    }
    animations.register('new-pea', 'pvz:peashooter', 'replace', replacement)
    assert.equal(animations.resolve('pvz:peashooter').shootHead.reanimId, 'mod:shoot')
    assert.throws(
        () => animations.register('other', 'pvz:peashooter', 'replace', replacement),
        /already replaced by new-pea/,
    )

    animations.register('final-tuning', 'pvz:peashooter', 'enhance', { shootHead: { x: 8 } })
    assert.equal(animations.resolve('pvz:peashooter').shootHead.x, 8)
    animations.freeze()
    assert.throws(
        () => animations.register('late', 'pvz:peashooter', 'enhance', { body: { x: 1 } }),
        /frozen/,
    )
})

test('repeater uses its own clips and reference shooting rate', () => {
    const animations = new ClientAnimationRegistry()
    const repeater = animations.resolve('pvz:repeater')

    assert.equal(repeater.body.reanimId, 'pvz:repeater')
    assert.equal(repeater.idleHead.reanimId, 'pvz:repeater_head_idle')
    assert.equal(repeater.shootHead.reanimId, 'pvz:repeater_shoot')
    assert.equal(repeater.shootHead.rateScale, 45 / 35)
})

test('client animations reject unknown slots and invalid playback values', () => {
    const animations = new ClientAnimationRegistry()
    assert.throws(
        () => animations.registerLoaded('bad', 'mod:missing', 'enhance', {}),
        /unknown client animation target/,
    )
    assert.throws(
        () => animations.register('bad', 'pvz:normal', 'enhance', { walk: { rateScale: 0 } }),
        /positive/,
    )
    assert.throws(
        () => animations.register('bad', 'pvz:normal', 'enhance', { unknown: {} } as never),
        /unknown pvz:normal animation slot/,
    )
    assert.throws(
        () => animations.registerLoaded('broken', 'pvz:peashooter', 'replace', {}),
        /replacement must define/,
    )
    animations.register('valid-after-error', 'pvz:peashooter', 'replace', {
        body: { reanimId: 'mod:body', rateScale: 1, x: 0, y: 0 },
        idleHead: { reanimId: 'mod:idle', rateScale: 1, x: 0, y: 0 },
        shootHead: { reanimId: 'mod:shoot', rateScale: 1, x: 0, y: 0 },
    })
})

test('Adventure 1-1 presenters resolve plant and zombie animations through the registry', () => {
    const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')
    const view = source('assets/scripts/client/showcase/Adventure11View.ts')
    const entities = source('assets/scripts/client/showcase/Adventure11EntityRenderer.ts')
    const zombies = source('assets/scripts/client/showcase/Adventure11ZombieView.ts')

    assert.match(view, /const animations = content\.animations \?\? new ClientAnimationRegistry\(\)/)
    assert.match(entities, /this\.animations\.resolve\(animationTarget\)/)
    assert.match(entities, /this\.animations\.resolve\(view\.animationTarget\)/)
    assert.match(zombies, /this\.animations\.resolve\('pvz:normal'\)/)
})
