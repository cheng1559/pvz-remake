import {
    _decorator,
    Color,
    Component,
    gfx,
    Material,
    Node,
    Rect,
    Size,
    Sprite,
    SpriteFrame,
    Vec2,
} from 'cc'
import { GAME_TICK_SECONDS, scaleGameDeltaTime } from '@/game/GameDefinitions'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import { SpriteLoader } from '../SpriteLoader'
import {
    evaluateTodTrack,
    TOD_PARTICLE_DEFINITIONS,
    type TodEmitterDefinition,
    type TodParticleEffect,
    type TodParticleFieldDefinition,
} from './ParticleDefinitions'

const { ccclass } = _decorator
const DEG_TO_RAD = Math.PI / 180
let additiveSpriteMaterial: Material | null = null

function getAdditiveSpriteMaterial() {
    if (additiveSpriteMaterial) return additiveSpriteMaterial

    additiveSpriteMaterial = new Material()
    additiveSpriteMaterial.initialize({
        effectName: 'for2d/builtin-sprite',
        defines: {
            USE_TEXTURE: true,
        },
        states: {
            blendState: {
                targets: [{
                    blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE,
                    blendSrcAlpha: gfx.BlendFactor.SRC_ALPHA,
                    blendDstAlpha: gfx.BlendFactor.ONE,
                }],
            },
        },
    })
    return additiveSpriteMaterial
}

interface ParticleTrackInterpolations {
    red: number
    green: number
    blue: number
    alpha: number
    brightness: number
    spinAngle: number
    spinSpeed: number
    scale: number
    stretch: number
    collisionReflect: number
    collisionSpin: number
}

class TodParticle {
    readonly node: Node
    readonly duration: number
    readonly trackInterpolations: ParticleTrackInterpolations
    readonly fieldInterpolations: Array<{ x: number; y: number }>
    readonly fieldLastValues: Array<{ x: number; y: number }>

    age = 0
    x = 0
    y = 0
    velocityX = 0
    velocityY = 0
    spin = 0
    spinVelocity = 0
    lastTime = -1

    constructor(
        parent: Node,
        spriteFrame: SpriteFrame,
        duration: number,
        launchSpeed: number,
        launchAngle: number,
        randomLaunchSpin: boolean,
        additive: boolean,
        fieldCount: number,
    ) {
        this.node = createSpriteNode({
            name: 'Particle',
            spriteFrame,
            parent,
            layer: parent.layer,
            anchorX: 0.5,
            anchorY: 0.5,
        })
        if (additive) {
            const sprite = this.node.getComponent(Sprite)
            if (sprite) sprite.customMaterial = getAdditiveSpriteMaterial()
        }
        this.duration = Math.max(1, Math.round(duration))
        this.velocityX = Math.sin(launchAngle) * launchSpeed
        this.velocityY = Math.cos(launchAngle) * launchSpeed
        this.spin = randomLaunchSpin ? Math.random() * Math.PI * 2 : 0
        this.trackInterpolations = {
            red: Math.random(),
            green: Math.random(),
            blue: Math.random(),
            alpha: Math.random(),
            brightness: Math.random(),
            spinAngle: Math.random(),
            spinSpeed: Math.random(),
            scale: Math.random(),
            stretch: Math.random(),
            collisionReflect: Math.random(),
            collisionSpin: Math.random(),
        }
        this.fieldInterpolations = Array.from({ length: fieldCount }, () => ({
            x: Math.random(),
            y: Math.random(),
        }))
        this.fieldLastValues = Array.from({ length: fieldCount }, () => ({
            x: 0,
            y: 0,
        }))
    }
}

class TodParticleEmitter {
    readonly node: Node
    readonly definition: TodEmitterDefinition
    readonly duration: number

    scaleOverride = 1
    private _particles: TodParticle[] = []
    private _age = -1
    private _dead = false
    private _spawnAccumulator = 0
    private _particlesSpawned = 0
    private _systemAlphaInterpolation = Math.random()
    private _systemRedInterpolation = Math.random()
    private _systemGreenInterpolation = Math.random()
    private _systemBlueInterpolation = Math.random()
    private _spawnRateInterpolation = Math.random()
    private _spawnMinActiveInterpolation = Math.random()
    private _spawnMaxActiveInterpolation = Math.random()
    private _spawnMaxLaunchedInterpolation = Math.random()
    private _systemFieldInterpolations: Array<{ x: number; y: number }>
    private _systemFieldLastValues: Array<{ x: number; y: number }>
    private _systemCenterX = 0
    private _systemCenterY = 0

    constructor(parent: Node, definition: TodEmitterDefinition) {
        this.node = createUINode('Emitter', {
            parent,
            layer: parent.layer,
            anchorX: 0,
            anchorY: 1,
        })
        this.definition = definition
        this.duration = Math.max(
            1,
            Math.round(evaluateTodTrack(definition.systemDuration, 0, Math.random())),
        )
        this._systemFieldInterpolations = definition.systemFields.map(() => ({
            x: Math.random(),
            y: Math.random(),
        }))
        this._systemFieldLastValues = definition.systemFields.map(() => ({
            x: 0,
            y: 0,
        }))
        this.step()
    }

    get dead() {
        return this._dead
    }

    step() {
        if (this._dead) return

        this._age++
        let dying = this._age >= this.duration
        if (dying && this.definition.systemLoops) {
            this._age = 0
            dying = false
            this._particlesSpawned = 0
            for (const lastValue of this._systemFieldLastValues) {
                lastValue.x = 0
                lastValue.y = 0
            }
        }
        if (dying) this._age = this.duration - 1
        const systemTime = this.duration <= 1 ? 1 : this._age / (this.duration - 1)
        this._updateSystemFields(systemTime)

        const liveParticles: TodParticle[] = []
        for (const particle of this._particles) {
            if (this._updateParticle(particle, systemTime)) {
                liveParticles.push(particle)
            } else if (particle.node.isValid) {
                particle.node.destroy()
            }
        }
        this._particles = liveParticles

        const minimumActive = Math.floor(evaluateTodTrack(
            this.definition.spawnMinActive,
            systemTime,
            this._spawnMinActiveInterpolation,
        ))
        this._spawnAccumulator += evaluateTodTrack(
            this.definition.spawnRate,
            systemTime,
            this._spawnRateInterpolation,
        ) * 0.01
        let spawnCount = Math.floor(this._spawnAccumulator)
        this._spawnAccumulator -= spawnCount
        if (minimumActive >= 0) {
            spawnCount = Math.max(spawnCount, minimumActive - this._particles.length)
        }

        const maximumActive = Math.floor(evaluateTodTrack(
            this.definition.spawnMaxActive,
            systemTime,
            this._spawnMaxActiveInterpolation,
        ))
        if (maximumActive >= 0) {
            spawnCount = Math.min(spawnCount, maximumActive - this._particles.length)
        }

        const maximumLaunched = Math.floor(evaluateTodTrack(
            this.definition.spawnMaxLaunched,
            systemTime,
            this._spawnMaxLaunchedInterpolation,
        ))
        if (maximumLaunched >= 0) {
            spawnCount = Math.min(spawnCount, maximumLaunched - this._particlesSpawned)
        }

        if (!dying) {
            for (let i = 0; i < Math.max(0, spawnCount); i++) {
                this._particles.push(this._spawnParticle(systemTime))
                this._particlesSpawned++
            }
        }

        if (dying) {
            if (this._particles.length === 0) {
                this._dead = true
            }
        }
    }

    private _spawnParticle(systemTime: number) {
        const durationInterpolation = Math.random()
        const speedInterpolation = Math.random()
        const angleInterpolation = Math.random()
        const duration = evaluateTodTrack(
            this.definition.particleDuration,
            systemTime,
            durationInterpolation,
        )
        const launchSpeed = evaluateTodTrack(
            this.definition.launchSpeed,
            systemTime,
            speedInterpolation,
        ) * 0.01
        const launchAngle = evaluateTodTrack(
            this.definition.launchAngle,
            systemTime,
            angleInterpolation,
        )
        const resolvedLaunchAngle = this.definition.randomLaunchAngle
            ? Math.random() * Math.PI * 2
            : launchAngle * DEG_TO_RAD
        const spriteFrame = this._pickSpriteFrame()
        const particle = new TodParticle(
            this.node,
            spriteFrame,
            duration,
            launchSpeed,
            resolvedLaunchAngle,
            this.definition.randomLaunchSpin,
            this.definition.additive,
            this.definition.fields.length,
        )
        particle.x = this._systemCenterX +
            evaluateTodTrack(this.definition.emitterOffsetX, systemTime, Math.random()) +
            evaluateTodTrack(this.definition.emitterBoxX, systemTime, Math.random())
        particle.y = this._systemCenterY +
            evaluateTodTrack(this.definition.emitterOffsetY, systemTime, Math.random()) +
            evaluateTodTrack(this.definition.emitterBoxY, systemTime, Math.random())
        const radius = evaluateTodTrack(
            this.definition.emitterRadius,
            systemTime,
            Math.random(),
        )
        if (radius !== 0) {
            const radiusAngle = Math.random() * Math.PI * 2
            particle.x += Math.sin(radiusAngle) * radius
            particle.y += Math.cos(radiusAngle) * radius
        }
        this._updateParticle(particle, systemTime)
        return particle
    }

    private _updateParticle(particle: TodParticle, systemTime: number) {
        if (particle.age >= particle.duration) {
            if (!this.definition.particleLoops) return false
            particle.age = 0
            particle.lastTime = -1
            for (const lastValue of particle.fieldLastValues) {
                lastValue.x = 0
                lastValue.y = 0
            }
        }

        const particleTime = particle.duration <= 1
            ? 1
            : particle.age / (particle.duration - 1)
        for (let i = 0; i < this.definition.fields.length; i++) {
            this._applyField(
                particle,
                this.definition.fields[i],
                particleTime,
                particle.fieldInterpolations[i],
                particle.fieldLastValues[i],
            )
        }

        particle.x += particle.velocityX
        particle.y += particle.velocityY
        const spinSpeed = evaluateTodTrack(
            this.definition.particleSpinSpeed,
            particleTime,
            particle.trackInterpolations.spinSpeed,
        ) * 0.01
        const spinAngle = evaluateTodTrack(
            this.definition.particleSpinAngle,
            particleTime,
            particle.trackInterpolations.spinAngle,
        )
        const lastSpinAngle = particle.lastTime < 0
            ? 0
            : evaluateTodTrack(
                this.definition.particleSpinAngle,
                particle.lastTime,
                particle.trackInterpolations.spinAngle,
            )
        particle.spin += (spinSpeed + spinAngle - lastSpinAngle) * DEG_TO_RAD +
            particle.spinVelocity

        particle.age++
        particle.lastTime = particleTime
        this._renderParticle(particle, systemTime, particleTime)
        return true
    }

    private _applyField(
        particle: TodParticle,
        field: TodParticleFieldDefinition,
        particleTime: number,
        interpolation: { x: number; y: number },
        lastValue: { x: number; y: number },
    ) {
        const x = evaluateTodTrack(field.x, particleTime, interpolation.x)
        const y = evaluateTodTrack(field.y, particleTime, interpolation.y)
        if (field.type === 'position') {
            particle.x += x - lastValue.x
            particle.y += y - lastValue.y
            lastValue.x = x
            lastValue.y = y
            return
        }
        if (field.type === 'friction') {
            particle.velocityX *= 1 - x
            particle.velocityY *= 1 - y
            return
        }
        if (field.type === 'acceleration') {
            particle.velocityX += x * 0.01
            particle.velocityY += y * 0.01
            return
        }

        if (field.type === 'ground-constraint' && particle.y > y) {
            particle.y = y
            const reflect = evaluateTodTrack(
                this.definition.collisionReflect,
                particleTime,
                particle.trackInterpolations.collisionReflect,
            )
            const collisionSpin = evaluateTodTrack(
                this.definition.collisionSpin,
                particleTime,
                particle.trackInterpolations.collisionSpin,
            ) / 1000
            particle.spinVelocity = particle.velocityY * collisionSpin
            particle.velocityX *= reflect
            particle.velocityY *= -reflect
        }
    }

    private _renderParticle(particle: TodParticle, systemTime: number, particleTime: number) {
        const scale = evaluateTodTrack(
            this.definition.particleScale,
            particleTime,
            particle.trackInterpolations.scale,
        ) * this.scaleOverride
        const stretch = evaluateTodTrack(
            this.definition.particleStretch,
            particleTime,
            particle.trackInterpolations.stretch,
        )
        const alpha = evaluateTodTrack(
            this.definition.systemAlpha,
            systemTime,
            this._systemAlphaInterpolation,
        ) * evaluateTodTrack(
            this.definition.particleAlpha,
            particleTime,
            particle.trackInterpolations.alpha,
        )
        const brightness = evaluateTodTrack(
            this.definition.particleBrightness,
            particleTime,
            particle.trackInterpolations.brightness,
        )
        const red = evaluateTodTrack(
            this.definition.systemRed,
            systemTime,
            this._systemRedInterpolation,
        ) * evaluateTodTrack(
            this.definition.particleRed,
            particleTime,
            particle.trackInterpolations.red,
        )
        const green = evaluateTodTrack(
            this.definition.systemGreen,
            systemTime,
            this._systemGreenInterpolation,
        ) * evaluateTodTrack(
            this.definition.particleGreen,
            particleTime,
            particle.trackInterpolations.green,
        )
        const blue = evaluateTodTrack(
            this.definition.systemBlue,
            systemTime,
            this._systemBlueInterpolation,
        ) * evaluateTodTrack(
            this.definition.particleBlue,
            particleTime,
            particle.trackInterpolations.blue,
        )

        particle.node.setPosition(particle.x, -particle.y, 0)
        particle.node.setScale(scale, scale * stretch, 1)
        particle.node.angle = -particle.spin / DEG_TO_RAD
        const sprite = particle.node.getComponent(Sprite)
        if (sprite) {
            sprite.color = new Color(
                Math.round(255 * red * brightness),
                Math.round(255 * green * brightness),
                Math.round(255 * blue * brightness),
                Math.round(255 * alpha * brightness),
            )
        }
    }

    private _updateSystemFields(systemTime: number) {
        for (let i = 0; i < this.definition.systemFields.length; i++) {
            const field = this.definition.systemFields[i]
            const interpolation = this._systemFieldInterpolations[i]
            const lastValue = this._systemFieldLastValues[i]
            const x = evaluateTodTrack(field.x, systemTime, interpolation.x)
            const y = evaluateTodTrack(field.y, systemTime, interpolation.y)
            this._systemCenterX += x - lastValue.x
            this._systemCenterY += y - lastValue.y
            lastValue.x = x
            lastValue.y = y
        }
    }

    private _pickSpriteFrame() {
        const atlas = SpriteLoader.get(this.definition.image)
        if (!atlas) {
            throw new Error(`[TodParticle] Required sprite '${this.definition.image}' is not loaded`)
        }
        atlas.packable = false
        const frameCount = Math.max(1, this.definition.imageFrames)
        const columnCount = Math.max(1, this.definition.imageColumns)
        const rowCount = Math.max(1, this.definition.imageRows)
        if (frameCount === 1 && columnCount === 1 && rowCount === 1) return atlas

        const frameIndex = Math.floor(Math.random() * frameCount)
        const width = atlas.originalSize.width / columnCount
        const height = atlas.originalSize.height / rowCount
        const frame = new SpriteFrame()
        frame.packable = false
        frame.reset({
            texture: atlas.texture,
            rect: new Rect(frameIndex * width, 0, width, height),
            originalSize: new Size(width, height),
            offset: new Vec2(0, 0),
            isRotate: false,
        })
        frame.packable = false
        return frame
    }
}

export interface TodParticleSpawnArgs {
    parent: Node
    effect: TodParticleEffect
    x: number
    y: number
    z?: number
    renderOrder?: number
}

@ccclass('TodParticleSystem')
export class TodParticleSystem extends Component {
    public renderOrder = 10000
    private _emitters: TodParticleEmitter[] = []
    private _accumulator = 0

    static spawn(args: TodParticleSpawnArgs) {
        const definition = TOD_PARTICLE_DEFINITIONS[args.effect]
        const node = createUINode(`ParticleSystem_${args.effect}`, {
            parent: args.parent,
            layer: args.parent.layer,
            anchorX: 0,
            anchorY: 1,
            x: args.x,
            y: args.y,
            z: args.z ?? 1000,
        })
        const system = node.addComponent(TodParticleSystem)
        system.renderOrder = args.renderOrder ?? 10000
        system._emitters = definition.emitters.map(
            (emitterDefinition) => new TodParticleEmitter(node, emitterDefinition),
        )
        return system
    }

    overrideScale(scale: number) {
        const resolvedScale = Math.max(0, scale)
        for (const emitter of this._emitters) {
            emitter.scaleOverride = resolvedScale
        }
    }

    protected update(dt: number) {
        this._accumulator += scaleGameDeltaTime(dt)
        while (this._accumulator >= GAME_TICK_SECONDS) {
            this._accumulator -= GAME_TICK_SECONDS
            for (const emitter of this._emitters) emitter.step()
            if (this._emitters.every((emitter) => emitter.dead)) {
                this.node.destroy()
                return
            }
        }
    }
}
