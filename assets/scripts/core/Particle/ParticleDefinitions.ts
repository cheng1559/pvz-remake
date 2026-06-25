export type TodParticleEffect =
    | 'zombie-head'
    | 'zombie-arm'
    | 'mowered-zombie-head'
    | 'mowered-zombie-arm'
    | 'zombie-traffic-cone'
    | 'zombie-pail'
    | 'zombie-flag'
    | 'pea-splat'
    | 'snowpea-splat'
    | 'powie'
    | 'sod-roll'
    | 'seed-packet-pick'
    | 'seed-packet-flash'
    | 'seed-packet-award'
    | 'award-pickup-arrow'
    | 'starburst'
    | 'seed-packet-pickup'
    | 'planting'

export interface TodTrackNode {
    time: number
    low: number
    high: number
    curve?: TodTrackCurve
}

export interface TodFloatTrack {
    nodes: TodTrackNode[]
}

export type TodTrackCurve = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

export interface TodParticleFieldDefinition {
    type: 'friction' | 'acceleration' | 'ground-constraint' | 'position'
    x: TodFloatTrack
    y: TodFloatTrack
}

export interface TodEmitterDefinition {
    image: string
    additive: boolean
    imageColumns: number
    imageRows: number
    imageFrames: number
    randomLaunchSpin: boolean
    randomLaunchAngle: boolean
    particleLoops: boolean
    systemLoops: boolean
    systemDuration: TodFloatTrack
    spawnRate: TodFloatTrack
    spawnMinActive: TodFloatTrack
    spawnMaxActive: TodFloatTrack
    spawnMaxLaunched: TodFloatTrack
    emitterOffsetX: TodFloatTrack
    emitterOffsetY: TodFloatTrack
    emitterRadius: TodFloatTrack
    emitterBoxX: TodFloatTrack
    emitterBoxY: TodFloatTrack
    particleDuration: TodFloatTrack
    launchSpeed: TodFloatTrack
    launchAngle: TodFloatTrack
    systemRed: TodFloatTrack
    systemGreen: TodFloatTrack
    systemBlue: TodFloatTrack
    systemAlpha: TodFloatTrack
    particleRed: TodFloatTrack
    particleGreen: TodFloatTrack
    particleBlue: TodFloatTrack
    particleAlpha: TodFloatTrack
    particleBrightness: TodFloatTrack
    particleSpinAngle: TodFloatTrack
    particleSpinSpeed: TodFloatTrack
    particleScale: TodFloatTrack
    particleStretch: TodFloatTrack
    collisionReflect: TodFloatTrack
    collisionSpin: TodFloatTrack
    fields: TodParticleFieldDefinition[]
    systemFields: TodParticleFieldDefinition[]
}

export interface TodParticleDefinition {
    emitters: TodEmitterDefinition[]
}

const constant = (value: number): TodFloatTrack => ({
    nodes: [{ time: 0, low: value, high: value }],
})

const range = (low: number, high: number): TodFloatTrack => ({
    nodes: [{ time: 0, low, high }],
})

const keyed = (...nodes: Array<[number, number] | [number, number, number]>): TodFloatTrack => ({
    nodes: nodes.map(([time, low, high = low]) => ({ time, low, high })),
})

const keyedCurve = (
    curve: TodTrackCurve,
    ...nodes: Array<[number, number] | [number, number, number]>
): TodFloatTrack => ({
    nodes: nodes.map(([time, low, high = low], index) => ({
        time,
        low,
        high,
        curve: index === 0 ? curve : undefined,
    })),
})

const acceleration = (y: number): TodParticleFieldDefinition => ({
    type: 'acceleration',
    x: constant(0),
    y: constant(y),
})

const friction = (x: TodFloatTrack, y: TodFloatTrack): TodParticleFieldDefinition => ({
    type: 'friction',
    x,
    y,
})

const groundConstraint = (y: number): TodParticleFieldDefinition => ({
    type: 'ground-constraint',
    x: constant(0),
    y: constant(y),
})

const position = (x: TodFloatTrack, y: TodFloatTrack): TodParticleFieldDefinition => ({
    type: 'position',
    x,
    y,
})

const defaults = {
    additive: false,
    imageColumns: 1,
    imageRows: 1,
    imageFrames: 1,
    randomLaunchSpin: false,
    randomLaunchAngle: false,
    particleLoops: false,
    systemLoops: false,
    spawnRate: constant(0),
    spawnMinActive: constant(-1),
    spawnMaxActive: constant(-1),
    spawnMaxLaunched: constant(-1),
    emitterOffsetX: constant(0),
    emitterOffsetY: constant(0),
    emitterRadius: constant(0),
    emitterBoxX: constant(0),
    emitterBoxY: constant(0),
    particleDuration: constant(100),
    launchSpeed: constant(0),
    launchAngle: constant(0),
    systemRed: constant(1),
    systemGreen: constant(1),
    systemBlue: constant(1),
    systemAlpha: constant(1),
    particleRed: constant(1),
    particleGreen: constant(1),
    particleBlue: constant(1),
    particleAlpha: constant(1),
    particleBrightness: constant(1),
    particleSpinAngle: constant(0),
    particleSpinSpeed: constant(0),
    particleScale: constant(1),
    particleStretch: constant(1),
    collisionReflect: constant(0),
    collisionSpin: constant(0),
    systemFields: [],
}

const awardRay = (
    image: 'particles/awardrays1' | 'particles/awardrays2',
    spinAngle: number,
    spinSpeedLow: number,
    spinSpeedHigh: number,
    brightness: number,
    spawnStart: number,
    spawnEnd: number,
): TodEmitterDefinition => ({
    ...defaults,
    image,
    additive: true,
    systemDuration: constant(1500),
    spawnMinActive: keyed(
        [spawnStart, 0],
        [spawnStart, 1],
        [spawnEnd, 4],
    ),
    particleDuration: constant(1500),
    particleAlpha: keyed([0, 0.7], [0.5, 0.9]),
    particleBrightness: constant(brightness),
    particleSpinAngle: constant(spinAngle),
    particleSpinSpeed: range(spinSpeedLow, spinSpeedHigh),
    particleScale: keyedCurve('ease-in', [0, 0.4], [0.1, 10]),
    fields: [],
})

const awardFlash = (spawnTime: number): TodEmitterDefinition => ({
    ...defaults,
    image: 'particles/awardglow',
    systemDuration: constant(200),
    spawnMinActive: keyed(
        [spawnTime, 0],
        [spawnTime, 1],
    ),
    spawnMaxLaunched: constant(1),
    particleDuration: constant(40),
    particleBlue: constant(0.8),
    particleAlpha: keyed([0.5, 0.2], [1, 0]),
    particleScale: keyed([0, 1], [1, 25]),
    fields: [],
})

// Values are transcribed from the original compiled particle definitions.
export const TOD_PARTICLE_DEFINITIONS: Record<TodParticleEffect, TodParticleDefinition> = {
    'zombie-head': {
        emitters: [{
            ...defaults,
            image: 'particles/zombiehead',
            systemDuration: constant(180),
            spawnMinActive: constant(1),
            particleDuration: constant(180),
            launchSpeed: constant(330),
            launchAngle: range(150, 185),
            systemAlpha: keyed([0.95, 1], [1, 0]),
            particleSpinSpeed: keyed([0, -720, 720], [0.4, 0]),
            particleScale: constant(0.8),
            collisionReflect: keyed([0, 0.3], [0.4, 0.3], [0.5, 0]),
            collisionSpin: keyed([0, -3, -6], [0.4, 0]),
            fields: [acceleration(17), groundConstraint(90)],
        }],
    },
    'zombie-arm': {
        emitters: [{
            ...defaults,
            image: 'particles/zombiearm',
            systemDuration: constant(60),
            spawnMinActive: constant(1),
            launchSpeed: constant(40),
            launchAngle: range(90, 185),
            systemAlpha: keyed([0.9, 1], [1, 0]),
            particleSpinSpeed: keyed([0, 0, 360], [0.4, 0]),
            particleScale: constant(0.8),
            collisionReflect: constant(0.5),
            collisionSpin: range(3, 6),
            fields: [acceleration(15), groundConstraint(60)],
        }],
    },
    'mowered-zombie-head': {
        emitters: [{
            ...defaults,
            image: 'particles/zombiehead',
            systemDuration: constant(180),
            spawnMinActive: constant(1),
            particleDuration: constant(180),
            launchSpeed: constant(330),
            launchAngle: range(190, 220),
            systemAlpha: keyed([0.95, 1], [1, 0]),
            particleSpinSpeed: keyed([0, -720, 720], [0.3, 0]),
            particleScale: constant(0.8),
            collisionReflect: keyed([0, 0.3], [0.4, 0.3], [0.5, 0]),
            fields: [acceleration(17), groundConstraint(0)],
        }],
    },
    'mowered-zombie-arm': {
        emitters: [{
            ...defaults,
            image: 'particles/zombiearm',
            systemDuration: constant(60),
            spawnMinActive: constant(1),
            emitterOffsetX: constant(30),
            launchSpeed: constant(340),
            launchAngle: range(190, 220),
            systemAlpha: keyed([0.9, 1], [1, 0]),
            particleSpinAngle: constant(-90),
            particleSpinSpeed: keyed([0, -180], [0.5, -360], [1, 0.4, 0]),
            particleScale: constant(0.8),
            collisionReflect: constant(0.5),
            collisionSpin: constant(15),
            fields: [acceleration(15), groundConstraint(0)],
        }],
    },
    'zombie-traffic-cone': {
        emitters: [{
            ...defaults,
            image: 'zombie_cone3',
            systemDuration: constant(50),
            spawnMinActive: constant(1),
            launchSpeed: constant(200),
            launchAngle: range(100, 140),
            systemAlpha: keyed([0.8, 1], [1, 0]),
            particleSpinSpeed: keyed([0, -200, -400], [0.4, 0]),
            particleScale: constant(0.8),
            collisionReflect: constant(0.3),
            collisionSpin: range(-3, -6),
            fields: [acceleration(17), groundConstraint(90)],
        }],
    },
    'zombie-pail': {
        emitters: [{
            ...defaults,
            image: 'zombie_bucket3',
            systemDuration: constant(50),
            spawnMinActive: constant(1),
            launchSpeed: constant(200),
            launchAngle: range(120, 180),
            systemAlpha: keyed([0.8, 1], [1, 0]),
            particleSpinSpeed: keyed([0, -200, -400], [0.4, 0]),
            particleScale: constant(0.8),
            collisionReflect: constant(0.3),
            collisionSpin: range(-3, -6),
            fields: [acceleration(17), groundConstraint(90)],
        }],
    },
    'zombie-flag': {
        emitters: [{
            ...defaults,
            image: 'zombie_flag3',
            systemDuration: constant(50),
            spawnMinActive: constant(1),
            particleDuration: constant(50),
            launchSpeed: constant(200),
            launchAngle: range(120, 160),
            systemAlpha: keyed([0.8, 1], [1, 0]),
            particleSpinAngle: constant(30),
            particleSpinSpeed: keyed([0, -200, -600], [1, -100, -300]),
            particleScale: constant(0.8),
            collisionReflect: constant(0.3),
            collisionSpin: range(-3, -6),
            fields: [acceleration(17), groundConstraint(90)],
        }],
    },
    'pea-splat': {
        emitters: [
            {
                ...defaults,
                image: 'particles/pea_splats',
                imageColumns: 4,
                imageFrames: 4,
                randomLaunchSpin: true,
                randomLaunchAngle: true,
                systemDuration: constant(20),
                spawnMinActive: constant(1),
                spawnMaxLaunched: constant(1),
                particleDuration: constant(20),
                particleAlpha: keyed([0.7, 0.9], [1, 0]),
                particleScale: keyed([0, 0.4, 0.6], [1, 0.8, 1.2]),
                fields: [],
            },
            {
                ...defaults,
                image: 'particles/pea_particles',
                imageColumns: 3,
                imageFrames: 3,
                randomLaunchSpin: true,
                randomLaunchAngle: true,
                systemDuration: constant(20),
                spawnMinActive: range(6, 10),
                particleDuration: constant(20),
                launchSpeed: constant(150),
                particleAlpha: keyed([0.8, 1], [1, 0]),
                particleSpinSpeed: range(-200, 200),
                particleScale: range(0.8, 1.2),
                fields: [
                    friction(keyed([0.4, 0], [1, 0.1]), keyed([0.4, 0], [1, 0.1])),
                    acceleration(10),
                ],
            },
        ],
    },
    'snowpea-splat': {
        emitters: [
            {
                ...defaults,
                image: 'particles/snowpea_splats',
                imageColumns: 4,
                imageFrames: 4,
                randomLaunchSpin: true,
                randomLaunchAngle: true,
                systemDuration: constant(20),
                spawnMinActive: constant(1),
                spawnMaxLaunched: constant(1),
                particleDuration: constant(20),
                particleAlpha: keyed([0.7, 0.9], [1, 0]),
                particleScale: keyed([0, 0.4, 0.6], [1, 0.8, 1.2]),
                fields: [],
            },
            {
                ...defaults,
                image: 'particles/snowpea_particles',
                imageColumns: 3,
                imageFrames: 2,
                randomLaunchSpin: true,
                randomLaunchAngle: true,
                systemDuration: constant(30),
                spawnMinActive: range(6, 10),
                particleDuration: constant(30),
                launchSpeed: constant(150),
                particleAlpha: keyed([0.8, 1], [1, 0]),
                particleSpinSpeed: range(-200, 200),
                particleScale: keyed(
                    [0, 0.3],
                    [0.1, 0.8, 1.2],
                    [0.7, 0.8, 1.2],
                    [1, 0],
                ),
                fields: [
                    friction(keyed([0.4, 0], [1, 0.1]), keyed([0.4, 0], [1, 0.1])),
                    acceleration(10),
                ],
            },
        ],
    },
    powie: {
        emitters: [
            {
                ...defaults,
                image: 'particles/explosioncloud',
                randomLaunchSpin: true,
                randomLaunchAngle: true,
                systemDuration: constant(200),
                spawnRate: constant(150),
                spawnMinActive: constant(-1),
                spawnMaxLaunched: constant(14),
                particleDuration: range(40, 60),
                launchSpeed: range(2000, 2500),
                systemAlpha: keyed([0.8, 1], [1, 0]),
                particleRed: constant(1),
                particleGreen: keyed([0, 0.7], [1, 0]),
                particleBlue: constant(0),
                particleAlpha: keyed([0.7, 1], [1, 0]),
                particleSpinSpeed: range(-200, 200),
                particleScale: keyed([0.6, 0.5], [1, 0]),
                fields: [
                    friction(keyed([0.4, 0.15], [1, 1]), keyed([0.4, 0.18], [1, 1])),
                ],
            },
            {
                ...defaults,
                image: 'particles/explosioncloud',
                randomLaunchSpin: true,
                randomLaunchAngle: true,
                systemDuration: constant(200),
                spawnRate: constant(150),
                spawnMinActive: constant(-1),
                spawnMaxLaunched: constant(14),
                particleDuration: range(40, 60),
                launchSpeed: range(500, 1200),
                systemAlpha: keyed([0.8, 1], [1, 0]),
                particleRed: constant(1),
                particleGreen: keyed([0, 0.9], [1, 0.4]),
                particleBlue: constant(0),
                particleAlpha: keyed([0.7, 1], [1, 0]),
                particleSpinSpeed: range(-200, 200),
                particleScale: keyed([0.6, 1.2, 1.6], [1, 0]),
                fields: [
                    friction(keyed([0.4, 0.12], [1, 1]), keyed([0.4, 0.18], [1, 1])),
                ],
            },
            {
                ...defaults,
                image: 'particles/explosionpowie',
                systemDuration: constant(50),
                spawnMinActive: constant(1),
                particleDuration: constant(50),
                fields: [],
            },
        ],
    },
    'sod-roll': {
        emitters: [{
            ...defaults,
            image: 'dirtsmall',
            imageColumns: 8,
            imageRows: 2,
            imageFrames: 8,
            randomLaunchSpin: true,
            systemDuration: constant(200),
            spawnRate: keyed([0, 200], [1, 100]),
            spawnMinActive: constant(-1),
            emitterBoxX: keyed([0, 0, 25], [1, 0, 1]),
            emitterBoxY: keyed([0, -130, 0], [1, -100, 0]),
            particleDuration: range(10, 25),
            systemAlpha: keyed([0.8, 1], [1, 0]),
            launchSpeed: constant(100),
            launchAngle: range(90, 180),
            particleAlpha: keyed([0.7, 1], [1, 0]),
            particleSpinSpeed: range(-1720, 1720),
            particleScale: range(0.7, 0.9),
            fields: [
                friction(constant(0.05), constant(0.05)),
                acceleration(10),
            ],
            systemFields: [{
                type: 'position',
                x: keyed([0, 0], [1, 740]),
                y: keyed([0, 30], [1, 0]),
            }],
        }],
    },
    'seed-packet-pick': {
        emitters: [{
            ...defaults,
            image: 'particles/downarrow',
            particleLoops: true,
            systemLoops: true,
            systemDuration: constant(100),
            spawnMinActive: constant(1),
            emitterOffsetX: constant(25),
            emitterOffsetY: constant(80),
            particleDuration: constant(40),
            particleGreen: constant(0.9),
            particleBlue: constant(0.4),
            particleStretch: constant(-1),
            fields: [
                position(constant(0), keyed([0, 0], [0.5, 10], [1, 0])),
            ],
        }],
    },
    'seed-packet-flash': {
        emitters: [{
            ...defaults,
            image: 'particles/seedpacketflash',
            systemDuration: constant(25),
            spawnMinActive: constant(1),
            spawnMaxLaunched: constant(1),
            emitterOffsetX: constant(25),
            emitterOffsetY: constant(35),
            particleDuration: constant(25),
            particleAlpha: keyed([0, 0], [0.4, 1], [1, 0]),
            fields: [],
        }],
    },
    'seed-packet-award': {
        emitters: [
            {
                ...defaults,
                image: 'particles/downarrow',
                particleLoops: true,
                systemLoops: true,
                systemDuration: constant(100),
                spawnMinActive: constant(1),
                particleDuration: constant(40),
                particleGreen: constant(0.9),
                particleBlue: constant(0.4),
                fields: [
                    position(constant(0), keyed([0, 0], [0.5, 10], [1, 0])),
                ],
            },
            {
                ...defaults,
                image: 'particles/seedpacketglow',
                particleLoops: true,
                systemLoops: true,
                systemDuration: constant(100),
                spawnMinActive: constant(1),
                emitterOffsetY: constant(62),
                particleDuration: constant(100),
                fields: [],
            },
        ],
    },
    'award-pickup-arrow': {
        emitters: [
            {
                ...defaults,
                image: 'particles/awardpickupglow',
                particleLoops: true,
                systemLoops: true,
                systemDuration: constant(100),
                spawnMinActive: constant(1),
                emitterOffsetY: constant(62),
                particleDuration: constant(100),
                fields: [],
            },
            {
                ...defaults,
                image: 'particles/downarrow',
                particleLoops: true,
                systemLoops: true,
                systemDuration: constant(100),
                spawnMinActive: constant(1),
                particleDuration: constant(40),
                particleGreen: constant(0.9),
                particleBlue: constant(0.4),
                fields: [
                    position(constant(0), keyed([0, 0], [0.5, 10], [1, 0])),
                ],
            },
        ],
    },
    starburst: {
        emitters: [
            {
                ...defaults,
                image: 'particles/star40',
                additive: true,
                randomLaunchSpin: true,
                randomLaunchAngle: true,
                systemDuration: constant(50),
                spawnMinActive: constant(25),
                spawnMaxLaunched: constant(50),
                emitterRadius: range(1, 75),
                particleDuration: constant(50),
                systemAlpha: keyed([0.8, 1], [1, 0]),
                launchSpeed: range(500, 1800),
                particleGreen: constant(0.9),
                particleBlue: range(0, 0.4),
                particleSpinSpeed: keyed([0, -720, 720], [0.8, -90, 90]),
                particleScale: range(0.1, 0.3),
                fields: [
                    friction(constant(0.05), constant(0.05)),
                    acceleration(0.5),
                ],
            },
            {
                ...defaults,
                image: 'particles/star40',
                additive: true,
                randomLaunchSpin: true,
                randomLaunchAngle: true,
                systemDuration: constant(50),
                spawnMinActive: constant(20),
                spawnMaxLaunched: constant(50),
                emitterRadius: range(1, 75),
                particleDuration: constant(50),
                systemAlpha: keyed([0.8, 1], [1, 0]),
                launchSpeed: range(500, 1800),
                particleBlue: range(0.6, 0.8),
                particleSpinSpeed: keyed([0, -720, 720], [0.8, -90, 90]),
                particleScale: range(0.1, 0.3),
                fields: [
                    friction(constant(0.05), constant(0.05)),
                    acceleration(0.5),
                ],
            },
            {
                ...defaults,
                image: 'particles/awardrays_star',
                additive: true,
                randomLaunchSpin: true,
                randomLaunchAngle: true,
                systemDuration: constant(50),
                spawnMinActive: constant(5),
                spawnMaxLaunched: constant(50),
                emitterRadius: range(1, 75),
                particleDuration: constant(50),
                systemAlpha: keyed([0.8, 1], [1, 0]),
                launchSpeed: range(500, 1800),
                particleGreen: range(0.6, 0.7),
                particleBlue: constant(0),
                particleSpinSpeed: keyed([0, -720, 720], [0.8, -90, 90]),
                particleScale: range(0.1, 0.3),
                fields: [
                    friction(constant(0.05), constant(0.05)),
                    acceleration(0.5),
                ],
            },
        ],
    },
    'seed-packet-pickup': {
        emitters: [
            awardRay('particles/awardrays2', 270, -41, -70, 0.4, 0.02, 0.21),
            awardRay('particles/awardrays2', 90, -41, -70, 0.3, 0.02, 0.21),
            awardRay('particles/awardrays1', 180, -41, -70, 0.2, 0.02, 0.21),
            awardRay('particles/awardrays1', 0, -41, -70, 0.1, 0.02, 0.21),
            awardRay('particles/awardrays2', 270, -30, -60, 0.4, 0.01, 0.2),
            awardRay('particles/awardrays2', 90, -30, -60, 0.3, 0.01, 0.2),
            awardRay('particles/awardrays1', 180, -30, -60, 0.2, 0.01, 0.2),
            awardRay('particles/awardrays1', 0, -30, -60, 0.1, 0.01, 0.2),
            {
                ...defaults,
                image: 'particles/awardglow',
                additive: true,
                systemDuration: constant(1500),
                spawnMinActive: keyed([0.18, 0], [0.18, 1]),
                particleDuration: constant(1500),
                particleScale: keyedCurve('ease-in', [0, 0.1], [0.25, 150]),
                fields: [],
            },
            awardFlash(0.8),
            awardFlash(0.6),
            awardFlash(0.4),
            {
                ...defaults,
                image: 'particles/awardglow',
                additive: true,
                systemDuration: constant(30),
                spawnMinActive: constant(1),
                spawnMaxLaunched: constant(1),
                particleDuration: constant(30),
                particleGreen: constant(1),
                particleBlue: constant(0.5),
                particleAlpha: keyed([0.5, 0.6], [1, 0]),
                particleBrightness: constant(0.5),
                particleScale: keyed([0, 1], [1, 25]),
                fields: [],
            },
        ],
    },
    planting: {
        emitters: [{
            ...defaults,
            image: 'dirtsmall',
            imageColumns: 8,
            imageRows: 2,
            imageFrames: 8,
            randomLaunchSpin: true,
            systemDuration: constant(30),
            spawnMinActive: constant(8),
            particleDuration: constant(30),
            systemAlpha: keyed([0.85, 1], [1, 0]),
            launchSpeed: range(300, 500),
            launchAngle: range(110, 250),
            particleSpinSpeed: range(-520, 520),
            particleScale: range(0.7, 0.9),
            fields: [
                friction(constant(0.08), constant(0.08)),
                acceleration(8),
            ],
        }],
    },
}

export function evaluateTodTrack(track: TodFloatTrack, time: number, interpolation: number) {
    const nodes = track.nodes
    if (nodes.length === 0) return 0

    const valueAt = (node: TodTrackNode) => node.low + (node.high - node.low) * interpolation
    const curveFraction = (fraction: number, curve: TodTrackCurve | undefined) => {
        switch (curve) {
            case 'ease-in':
                return fraction * fraction
            case 'ease-out':
                return 1 - (1 - fraction) * (1 - fraction)
            case 'ease-in-out':
                return fraction * fraction * (3 - 2 * fraction)
            case 'linear':
            default:
                return fraction
        }
    }
    if (time <= nodes[0].time) return valueAt(nodes[0])

    for (let i = 1; i < nodes.length; i++) {
        const right = nodes[i]
        if (time > right.time) continue

        const left = nodes[i - 1]
        const span = right.time - left.time
        const fraction = span <= 0 ? 1 : (time - left.time) / span
        const curvedFraction = curveFraction(fraction, left.curve)
        return valueAt(left) + (valueAt(right) - valueAt(left)) * curvedFraction
    }

    return valueAt(nodes[nodes.length - 1])
}
