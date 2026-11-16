import { Node } from 'cc'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { uiNode } from '@/client/view/uiNode'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { presentationSounds, type LevelRulePresentation, type PresentationSound } from '@/shared/content/presentation'
import { allFields, finite, named, nonEmptyString, positiveFinite } from '@/shared/validate'
import { levelStandsStill, type ServerEvent, type WorldSnapshot } from '@/shared/protocol'
import type { LevelRuleView, LevelRuleViewContext } from './LevelRuleView'
import { boolean, record } from '@/shared/validate'

/** Converted Reanim clips play at 12 frames per second at rate 1. */
const CLIP_FPS = 12
/** CursorObject::Update draws the cursor at the pointer minus (25, 35); the mallet sits at its (x, y) from there. */
const CURSOR_OFFSET = { x: -25, y: -35 }

/** `rules["pvz:whack-a-zombie"]`: the mallet and its blows, from Challenge::StartLevel and MouseDownWhackAZombie. */
interface WhackPresentation {
    /** The cursor animation at `x`, `y` from the pointer; a click restarts it at `swingTime` of the clip. */
    readonly hammer: { readonly reanimId: string; readonly x: number; readonly y: number; readonly fps: number; readonly swingTime: number }
    readonly swingSounds: readonly PresentationSound[]
    /** Per helm type, the sound a mallet blow on it plays; a bare zombie gets `bonk` and its particle at its offset. */
    readonly helmSounds: Readonly<Record<string, readonly PresentationSound[]>>
    readonly bonk: { readonly sounds: readonly PresentationSound[]; readonly particle: string; readonly x: number; readonly y: number }
    /** The seed bank waits above the screen until there is sun, then comes down this many pixels per tick. */
    readonly seedBankSlide: number
}

/** The rule's own presentation, beside the `graveRise` that parsePresentationDefinitions reads. */
function parseConfig(config: LevelRulePresentation, name: string): WhackPresentation {
    const { graveRise: _graveRise, ...own } = config
    return allFields<WhackPresentation>(own, name, {
        hammer: (value, name) => allFields<WhackPresentation['hammer']>(value, name, { reanimId: nonEmptyString, x: finite, y: finite, fps: finite, swingTime: finite }),
        swingSounds: presentationSounds,
        helmSounds: (value, name) => named(value, name, presentationSounds),
        bonk: (value, name) => allFields<WhackPresentation['bonk']>(value, name, { sounds: presentationSounds, particle: nonEmptyString, x: finite, y: finite }),
        seedBankSlide: positiveFinite,
    })
}

/**
 * Whack-a-Zombie on the client (Challenge::StartLevel, MouseDownWhackAZombie, Challenge::Update): the mallet cursor,
 * the blows' sounds and POW, and the seed bank coming down once there is sun.
 */
export class WhackAZombieView implements LevelRuleView {
    private hammer?: ReanimPlayer
    private pointer?: { x: number; y: number }
    /** A touch swing keeps the mallet where it came down until the swing ends. */
    private touchSwing?: { x: number; y: number }
    /** Where the bank starts once the intro is over: above the screen. From then on its place is its node's. */
    private bankY?: number
    private lastTick?: number

    private constructor(
        private readonly config: WhackPresentation,
        private readonly kind: string,
        private readonly effects: Node,
        private readonly bank: Node,
        private readonly isSun: (typeId: string) => boolean,
        bankHeight: number,
    ) {
        this.bankY = bankHeight
    }

    static async create(context: LevelRuleViewContext): Promise<WhackAZombieView> {
        const { content } = context
        const config = parseConfig(context.config, `rules.${context.kind}`)
        const isSun = (typeId: string) => content.definitions.items[typeId] !== undefined && content.definitions.items[typeId].kind !== 'money'
        const view = new WhackAZombieView(config, context.kind, context.effectLayer, context.bank, isSun, context.bankHeight)
        const node = uiNode({ name: 'Hammer', parent: context.cursorLayer, anchor: { x: 0, y: 1 }, active: false }).node
        node.once(Node.EventType.NODE_DESTROYED, () => UIHoverManager.setIdleCursor('default'))
        const hammer = node.addComponent(ReanimPlayer)
        await hammer.load(config.hammer.reanimId)
        // Challenge::StartLevel: held on its last frame until the first blow.
        hammer.play({ loop: false, rate: config.hammer.fps / CLIP_FPS, timeSeconds: hammer.durationSeconds, hideOnFinish: false })
        view.hammer = hammer
        // A restored game with sun already has its bank down.
        if (view.hasSun(context.initial)) view.bankY = 0
        return view
    }

    setPointer(pointer?: { x: number; y: number }): void { this.pointer = pointer }

    /** Challenge::MouseDownWhackAZombie: the swing restarts from `swingTime` of the clip, whatever it hits. */
    click(snapshot: WorldSnapshot, point: { x: number; y: number }, touch: boolean): boolean {
        const hammer = this.hammer
        if (!this.hammerOut(snapshot) || !hammer?.node.isValid) return false
        if (touch) this.touchSwing = point
        hammer.play({
            loop: false, rate: this.config.hammer.fps / CLIP_FPS, timeSeconds: this.config.hammer.swingTime * hammer.durationSeconds,
            hideOnFinish: false, onFinish: () => { if (this.touchSwing === point) this.touchSwing = undefined },
        })
        SoundSystem.playSounds(this.config.swingSounds)
        return true
    }

    sync(snapshot: WorldSnapshot, events: readonly ServerEvent[], introComplete: boolean): void {
        for (const event of events) {
            // Board::DropLootPiece: FOLEY_SPAWN_SUN for the three suns a whacked zombie can drop.
            if (event.type === 'sunDropped') { void SoundSystem.playFoley(SoundEffect.Throw, 10); continue }
            // A blow on a plant (`plantWhacked`) lands as one on a bare zombie: its bonk, and the POW when it ends it.
            if (event.type !== 'zombieWhacked' && event.type !== 'plantWhacked') continue
            const helm = event.data.helm === undefined ? undefined : String(event.data.helm)
            if (helm !== undefined) { SoundSystem.playSounds(this.config.helmSounds[helm]); continue }
            const { bonk } = this.config
            SoundSystem.playSounds(bonk.sounds)
            if (event.data.killed !== true) continue
            const x = Number(event.data.x) + bonk.x, y = Number(event.data.y) + bonk.y
            ParticlePlayer.spawn({ parent: this.effects, id: bonk.particle, x, y: -y })
        }
        this.syncBank(snapshot, introComplete)
        const hammer = this.hammer
        if (!hammer?.node.isValid) return
        const point = this.touchSwing ?? this.pointer
        // The mallet is the cursor only in play, while nothing else is held and until the award puts it away.
        const visible = !!point && introComplete && snapshot.phase === 'gameplay' && snapshot.result === 'playing' && !levelStandsStill(snapshot) &&
            snapshot.cursor.mode === 'none' && this.hammerOut(snapshot)
        hammer.node.active = visible
        // Board::UpdateCursor: over nothing clickable, the mallet replaces the system cursor.
        UIHoverManager.setIdleCursor(visible && !GameDebugSettings.isMobileMode() ? 'none' : 'default')
        if (visible) {
            const { x, y } = this.config.hammer
            hammer.node.setPosition(point.x + CURSOR_OFFSET.x + x, -(point.y + CURSOR_OFFSET.y + y))
        }
    }

    /** The server's CURSOR_TYPE_HAMMER, put away once the award has dropped (Challenge::ClearCursor). */
    private hammerOut(snapshot: WorldSnapshot): boolean {
        return parseSnapshot(snapshot.extensions[this.kind], this.kind).hammer
    }

    /** mSunMoney + CountSunBeingCollected(). */
    private hasSun(snapshot: WorldSnapshot): boolean {
        return snapshot.sun > 0 || snapshot.items.some(item => item.state === 'collecting' && this.isSun(item.typeId))
    }

    /**
     * Challenge::Update: the hidden bank comes down 2 pixels a tick once there is sun, banked or on its way. Something
     * else may move it meanwhile (a repick brings it down to choose into and puts it back): its place is its node's.
     */
    private syncBank(snapshot: WorldSnapshot, introComplete: boolean): void {
        if (!introComplete) return
        const ticks = this.lastTick === undefined ? 0 : Math.max(0, snapshot.gameplayTick - this.lastTick)
        this.lastTick = snapshot.gameplayTick
        let y = this.bankY ?? this.bank.position.y
        this.bankY = undefined
        if (y > 0 && this.hasSun(snapshot)) y = Math.max(0, y - this.config.seedBankSlide * ticks)
        this.bank.active = true
        this.bank.setPosition(this.bank.position.x, y)
    }
}

/** What the server's rule shows the client (its `snapshot`), the snapshot's `extensions["pvz:whack-a-zombie"]`. */
interface WhackSnapshot {
    /** The empty cursor is the mallet (CURSOR_TYPE_HAMMER), until the award puts it away. */
    readonly hammer: boolean
}

function parseSnapshot(value: unknown, kind: string): WhackSnapshot {
    const name = `snapshot.extensions.${kind}`
    return { hammer: boolean(record(value, name).hammer, `${name}.hammer`) }
}
