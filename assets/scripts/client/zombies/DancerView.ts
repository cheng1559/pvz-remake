import { Color, type Node, Sprite } from 'cc'
import { modResources } from '@/client/content/ModResources'
import { uiNode } from '@/client/view/uiNode'
import { renderOrder } from '@/shared/content/renderOrder'
import { ZOMBIE_BODY_LAYER, ZOMBIE_CLIPS } from '@/shared/content/gameplay'
import type { DanceSpotlight, GraveZombiePresentation } from '@/shared/content/presentation'
import type { WorldSnapshot, ZombieSnapshot } from '@/shared/protocol/index'
import type { StageEvent } from '@/client/level/LevelStage'
import { SoundSystem } from '@/client/sound/SoundSystem'
import { DANCE_PHASES, type DancePhase } from '@/shared/content/zombieStates'
import { nonNegativeInteger, oneOf } from '@/shared/validate'
import { type ShownZombie, ZombieView } from './ZombieView'
import { MIRRORED_SHIFT, ZOMBIE_PIVOT } from './zombieParts'

/**
 * A dancer (ZombieDefinition.dance, the presentation's `dance`): it moonwalks in turned round, a leader stands in its
 * spotlight once it has first snapped its fingers, and one called up into a troupe comes up out of the ground. Its
 * events start and stop the disco music and raise the dirt under one called up. Its own (Dancer.snapshotOwn): `phase`
 * and `age`.
 */
export class DancerView extends ZombieView {
    /**
     * Zombie::DrawDancerReanim: a leader's spotlight (DancePresentation.spotlight), on the board only: its floor under
     * the body and its beam over it, in the zombie's node, hidden until it shines.
     */
    private spotlight?: { floor: Node, beam: Node, look: DanceSpotlight }

    async initialize(): Promise<void> {
        await super.initialize()
        const look = this.presentation.dance?.spotlight, parent = this.context.node
        if (!this.context.stage || !look) return
        const [floor, beam] = await Promise.all([look.floor, look.beam].map(id => modResources.sprite(id)))
        const part = (name: string, frame: typeof floor, [x, y]: readonly [number, number]) => {
            const node = uiNode({
                name, parent, anchor: { x: 0, y: 1 }, active: false, position: { x, y: -y },
                sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false },
            }).node
            node.setScale(look.scale, look.scale, 1)
            return node
        }
        this.spotlight = { floor: part('SpotlightFloor', floor, look.floorOffset), beam: part('SpotlightBeam', beam, look.beamOffset), look }
        this.spotlight.floor.setSiblingIndex(this.root.getSiblingIndex())
    }

    sync(zombie: ZombieSnapshot, world: WorldSnapshot): void {
        super.sync(zombie, world)
        this.syncSpotlight(zombie, world)
    }

    /**
     * Zombie::UpdateZombieDancer and UpdateZombieBackupDancer go from beat to beat (walking, raising its arm, as it comes
     * up out of the ground too) blending over 10 ticks; its other changes (a snap, eating, the walk after its hold) take
     * any zombie's 20. A winner takes its walk into the house at once, as any does.
     */
    protected bodyBlend(zombie: ShownZombie): number {
        const beat = (clip: string | null) => clip === ZOMBIE_CLIPS.walk || clip === ZOMBIE_CLIPS.raise
        return !this.won && beat(this.bodyClip) && beat(zombie.animations[ZOMBIE_BODY_LAYER].clip) ? BEAT_BLEND_SECONDS : super.bodyBlend(zombie)
    }

    /** Its phase of the dance (Dancer.snapshotOwn's `phase`); none off the board. */
    private dancePhase(zombie: ShownZombie): DancePhase | undefined {
        return this.own(zombie, 'phase', (value, name) => oneOf(value, DANCE_PHASES, name))
    }

    /**
     * Its spotlight shines once it has first snapped its fingers, not while it moonwalks in, snaps for the first time or
     * falls, nor once the zombies have won; mowed, or burned where it stands (one burned with its head is gone, its
     * charred remains on their own), it shines whatever phase it was on, those being phases of their own that
     * DrawDancerReanim does not leave out. Its color goes by its age (Dancer.snapshotOwn's `age`). With its body drawn
     * turned round (on the plants' side) it turns round with it, about where the body turns (place), so the body stands
     * in its middle as one facing left does (the original draws it unturned, off a mind-controlled dancer's middle).
     */
    private syncSpotlight(zombie: ZombieSnapshot, world: WorldSnapshot): void {
        const spotlight = this.spotlight
        if (!spotlight || !spotlight.floor.isValid || !spotlight.beam.isValid) return
        const { floor, beam, look } = spotlight, phase = this.dancePhase(zombie)
        const shines = phase !== undefined && world.result !== 'lost' && (zombie.state === 'mowered' || zombie.state === 'burned' ||
            phase !== 'moonwalk' && phase !== 'summon' && (zombie.state === 'walking' || zombie.state === 'eating'))
        floor.active = beam.active = shines
        if (!shines) return
        const age = this.own(zombie, 'age', nonNegativeInteger) ?? 0, { colors, colorsFrom, colorTicks, colorStep } = look
        const [r, g, b] = colors[age >= colorsFrom ? Math.floor(age / colorTicks) * colorStep % colors.length : 0]
        const color = new Color(r, g, b, 255)
        const turnedAbout = this.turned
            ? this.clip(zombie.animations[ZOMBIE_BODY_LAYER].clip).x + ZOMBIE_PIVOT.x * (1 - this.scale) + MIRRORED_SHIFT * this.scale / 2 : undefined
        for (const [node, [x]] of [[floor, look.floorOffset], [beam, look.beamOffset]] as const) {
            node.getComponent(Sprite)!.color = color
            node.setPosition(turnedAbout === undefined ? x : 2 * turnedAbout - x, node.position.y)
            node.setScale(turnedAbout === undefined ? look.scale : -look.scale, look.scale, 1)
        }
        // The beam over all else in the node: the body, the ice.
        const last = beam.parent!.children.length - 1
        if (beam.getSiblingIndex() !== last) beam.setSiblingIndex(last)
    }

    /**
     * UpdateReanim's anOpposite: the other way round from its side's while it moonwalks in (PHASE_DANCER_DANCING_IN),
     * not while it eats, nor mowed, falling or burned, which are phases of their own.
     */
    protected turnedRound(zombie: ShownZombie): boolean {
        return super.turnedRound(zombie) !== (this.dancePhase(zombie) === 'moonwalk' && zombie.state === 'walking')
    }

    /** One called up into a troupe comes up out of the ground (DancePresentation.rise, PHASE_DANCER_RISING). */
    protected rise(zombie: ShownZombie): GraveZombiePresentation {
        return this.dancePhase(zombie) === 'rise' && this.presentation.dance?.rise || super.rise(zombie)
    }

    /**
     * Zombie::UpdateZombieDancer: a leader's first snap starts the disco music (DancePresentation.music, FOLEY_DANCER)
     * when the server says so, once at a time: heard on as it is, it is not started again.
     */
    static readonly snapped: StageEvent = (stage, event) => {
        const music = stage.content.presentation.zombies[String(event.data.typeId)]?.dance?.music
        if (event.data.music !== true || !music) return
        void SoundSystem.play(music, { channel: DISCO_CHANNEL, ifBusy: 'keep', pauseWithGame: true })
    }

    /**
     * Zombie::StopZombieSound, each frame: the disco music stops once no dancer (a zombie with a dancer's look,
     * DancePresentation) with its head dances on the board.
     */
    static readonly danced: StageEvent = (stage, _event, world) => {
        if (!SoundSystem.isChannelActive(DISCO_CHANNEL)) return
        const dancers = stage.content.presentation.zombies
        if (world.zombies.some(zombie => dancers[zombie.typeId]?.dance && zombie.hasHead && (zombie.state === 'walking' || zombie.state === 'eating'))) return
        SoundSystem.stopChannel(DISCO_CHANNEL)
    }

    /** Zombie::SummonBackupDancer: one called up into a troupe comes up with its own dirt and rumble (DancePresentation.rise). */
    static readonly calledUp: StageEvent = (stage, event, world) => {
        const zombie = world.zombies.find(candidate => candidate.entityId === event.data.entityId)
        const rise = zombie && stage.content.presentation.zombies[zombie.typeId]?.dance?.rise
        if (!rise) return
        void SoundSystem.playSounds(rise.sounds)
        stage.particle(rise.particle, zombie.x + 60, zombie.y + 110, renderOrder('particle', zombie.row))
    }
}

/** PlayZombieReanim's blend of 10 ticks from beat to beat (Zombie::UpdateZombieDancer, UpdateZombieBackupDancer). */
const BEAT_BLEND_SECONDS = 0.1

/** The disco music's channel (FOLEY_DANCER is one at a time), shared by every dancer. */
const DISCO_CHANNEL = 'dancer'
