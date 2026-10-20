import assert from 'node:assert/strict'
import test from 'node:test'
import { parseLevelPresentationSnapshot } from '@/client/level/LevelPresentationSnapshot'

function reanim(id: string) {
    return {
        id, timeSeconds: 0, playing: true, loop: true, rate: 1, visible: true,
        hideOnFinish: false, extraAdditive: false,
        extraAdditiveColor: { r: 0, g: 0, b: 0, a: 255 },
        blend: null, attachmentTrackId: null,
    }
}

function snapshot(): any {
    return {
        schemaVersion: 2,
        flow: { introCompletionSent: true, completionStarted: false },
        intro: {
            ticks: 855,
            previews: [],
        },
        end: { ticks: -1, finalWave: null },
        advice: {
            lastStatusMessage: 'Plant!', lastSyncedTick: 20,
            widget: { message: 'Plant!', style: 'tutorial-level1', durationTicks: 100, pulseTick: 2 },
        },
        hud: {
            sunFlashTicks: 0, previousPacketCooldown: null, progressWave: 1,
            progressCountdownStart: 10, progressMeterWidth: 20, progressTick: 11,
        },
        audio: {
            music: null, ownsMusic: true, gameplayStarted: true, firstWavePlayed: false,
        },
        entities: [{
            kind: 'plant', entityId: 1,
            animations: {
                body: reanim('pvz:peashooter'), idleHead: reanim('pvz:peashooter_head_idle'),
                shootHead: reanim('pvz:peashooter_shoot'),
            }, idleRate: 1.25,
        }, {
            kind: 'zombie', entityId: 2, body: reanim('pvz:zombie_walk'),
            mowerDriver: null,
        }, {
            kind: 'mower', entityId: 3, animation: reanim('pvz:lawnmower'),
        }, {
            kind: 'sun', entityId: 4, animation: null,
        }],
        particles: [{
            instanceId: 1, backend: 'particle',
            owner: { kind: 'entity', entityId: 99, slot: 'award-back-effects', x: 0, y: 0, z: 0 },
            playback: {
                id: 'pvz:peasplat', seed: 1, ageTicks: 2,
                playing: true, visible: true, accumulatorSeconds: 0,
            },
        }, {
            instanceId: 2, backend: 'tod',
            owner: { kind: 'screen', slot: 'coin-layer', x: 100, y: 200, z: 1 },
            playback: {
                effect: 'sun', seed: 2, ageTicks: 3, accumulator: 0,
                renderOrder: 1, tint: null, extraAdditive: false,
                imageOverride: null, useGameTime: true, scale: 1,
            },
        }],
        extensions: { 'example:weather': { rain: true } },
    }
}

test('Adventure 1-1 presentation snapshot round-trips every owned presentation section', () => {
    const value = snapshot()
    assert.deepEqual(parseLevelPresentationSnapshot(JSON.parse(JSON.stringify(value))), value)
    const previous = JSON.parse(JSON.stringify(value))
    previous.particles[0].backend = 'v2'
    assert.throws(() => parseLevelPresentationSnapshot(previous), /backend is invalid/)
})

test('1-2 presentation saves Sunflower blinking, flag attachment and huge-wave timing', () => {
    const value = snapshot()
    value.end.hugeWaveTicks = 725
    value.entities.push({
        kind: 'plant', entityId: 5,
        animations: {
            body: reanim('pvz:sunflower'), blink: { ...reanim('pvz:sunflower_blink'), attachmentTrackId: 'anim_idle' },
        }, blinkAtTick: 1250,
    })
    value.entities[1].body.id = 'pvz:flag_walk'
    value.entities[1].flag = { ...reanim('pvz:zombie_flag'), attachmentTrackId: 'Zombie_flaghand' }
    assert.deepEqual(parseLevelPresentationSnapshot(JSON.parse(JSON.stringify(value))), value)
    for (const index of [0, 4]) {
        const legacy = JSON.parse(JSON.stringify(value))
        const entity = legacy.entities[index]
        Object.assign(entity, entity.animations)
        if (entity.animations.blink) entity.kind = 'sunflower'
        delete entity.animations
        assert.throws(() => parseLevelPresentationSnapshot(legacy), /not supported|kind is invalid/)
    }
})

test('Adventure 1-1 presentation snapshot rejects malformed and cross-linked state', () => {
    const invalid = (change: (value: any) => void) => {
        const value = snapshot()
        change(value)
        return () => parseLevelPresentationSnapshot(value)
    }
    assert.throws(invalid(value => { value.extra = true }), /extra is not supported/)
    assert.throws(invalid(value => {
        value.intro.ticks = 854
        value.intro.previews = Array.from({ length: 5 }, (_, slot) => ({
            slot, x: 430 + slot, y: 230, z: 100 + slot, reanim: reanim('pvz:zombie_idle2'),
        }))
    }), /before the intro ends/)
    assert.throws(invalid(value => { value.entities[1].entityId = 1 }), /entity ID must be unique/)
    assert.throws(invalid(value => { value.particles[1].instanceId = 1 }), /particle instance ID must be unique/)
    assert.throws(invalid(value => { value.hud.progressMeterWidth = 151 }), /progressMeterWidth/)
    assert.throws(invalid(value => { value.hud.progressMeterWidth = 1.5 }), /progressMeterWidth/)
    assert.throws(invalid(value => { value.advice.lastSyncedTick = -1 }), /lastSyncedTick/)
    assert.throws(invalid(value => { value.entities[0].idleRate = Number.POSITIVE_INFINITY }), /finite numbers/)
    assert.throws(invalid(value => { delete value.entities[0].animations.body }), /animations.body is required/)
    assert.throws(invalid(value => { value.extensions.bad = {} }), /extension ID is invalid/)
})

test('Adventure 1-1 presentation snapshot normalizes entity and particle ordering', () => {
    const value = snapshot()
    value.entities.reverse()
    value.particles.reverse()
    const parsed = parseLevelPresentationSnapshot(value)
    assert.deepEqual(parsed.entities.map(entity => entity.entityId), [1, 2, 3, 4])
    assert.deepEqual(parsed.particles.map(particle => particle.instanceId), [1, 2])
})

test('Adventure 1-1 presentation snapshot preserves intro-preview particle ownership', () => {
    const value = snapshot()
    value.flow.introCompletionSent = false
    value.intro = {
        ticks: 100,
        previews: Array.from({ length: 5 }, (_, slot) => ({
            slot, x: 430 + slot, y: 230, z: 100 + slot, reanim: reanim('pvz:zombie_idle2'),
        })),
    }
    value.particles.push({
        instanceId: 3,
        backend: 'tod',
        owner: { kind: 'intro-preview', slot: 2, x: 10, y: 20, z: 3 },
        playback: {
            effect: 'sodroll', seed: 3, ageTicks: 4, accumulator: 0,
            renderOrder: 1, tint: null, extraAdditive: false,
            imageOverride: null, useGameTime: false, scale: 1,
        },
    })

    const parsed = parseLevelPresentationSnapshot(value)

    assert.deepEqual(parsed.particles[2].owner, {
        kind: 'intro-preview', slot: 2, x: 10, y: 20, z: 3,
    })
})
