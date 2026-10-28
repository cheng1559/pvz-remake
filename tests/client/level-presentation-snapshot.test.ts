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
        schemaVersion: 3,
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
                blink: reanim('pvz:peashooter_blink'),
            }, idleRate: 1.25, blinkAtTick: 500,
        }, {
            kind: 'zombie', entityId: 2, body: reanim('pvz:zombie_walk'),
            mowerDriver: null,
        }, {
            kind: 'mower', entityId: 3, animation: reanim('pvz:lawnmower'),
        }, {
            kind: 'sun', entityId: 4, animation: null,
        }],
        particles: [{
            instanceId: 1,
            owner: { kind: 'entity', entityId: 99, slot: 'award-back-effects', x: 0, y: 0, z: 0 },
            playback: {
                id: 'pvz:peasplat', seed: 1, ageTicks: 2,
                playing: true, visible: true, accumulatorSeconds: 0,
                renderOrder: 1, tint: null, extraAdditive: false, spriteOverride: null, scale: 1,
            },
        }, {
            instanceId: 2,
            owner: { kind: 'screen', slot: 'coin-layer', x: 100, y: 200, z: 1 },
            playback: {
                id: 'pvz:sun', seed: 2, ageTicks: 3, accumulatorSeconds: 0,
                renderOrder: 1, tint: null, extraAdditive: false,
                spriteOverride: null, playing: true, visible: true, scale: 1,
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
    assert.throws(() => parseLevelPresentationSnapshot(previous), /backend is not supported/)
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
            slot, typeId: 'pvz:normal', x: 430 + slot, y: 230, z: 100 + slot, hasTongue: slot === 0, reanim: reanim('pvz:zombie_idle2'),
        }))
    }), /before the intro ends/)
    assert.throws(invalid(value => { value.entities[1].entityId = 1 }), /entity ID must be unique/)
    assert.throws(invalid(value => { value.particles[1].instanceId = 1 }), /particle instance ID must be unique/)
    assert.throws(invalid(value => { value.hud.progressMeterWidth = 151 }), /progressMeterWidth/)
    assert.throws(invalid(value => { value.hud.progressMeterWidth = 1.5 }), /progressMeterWidth/)
    assert.throws(invalid(value => { value.advice.lastSyncedTick = -1 }), /lastSyncedTick/)
    assert.throws(invalid(value => { value.entities[0].idleRate = Number.POSITIVE_INFINITY }), /finite numbers/)
    assert.throws(invalid(value => { delete value.entities[0].animations.body }), /animations.body is required/)
    assert.throws(invalid(value => { delete value.entities[0].animations.blink }), /missing shooter blink state/)
    assert.throws(invalid(value => { delete value.entities[0].blinkAtTick }), /missing shooter blink state/)
    assert.throws(invalid(value => { value.extensions.bad = {} }), /extension ID is invalid/)
})
