import { Node } from 'cc'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { uiNode } from '@/client/view/uiNode'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { LevelRulePresentation, PresentationSound } from '@/shared/content/presentation'
import type { ServerEvent, WorldSnapshot } from '@/shared/protocol'
import type { LevelAudioPresenter } from '../LevelAudioPresenter'
import type { LevelRuleView, LevelRuleViewContext } from './LevelRuleView'

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

function parseConfig(config: LevelRulePresentation): WhackPresentation {
    const fail = (field: string) => { throw new TypeError(`rules.pvz:whack-a-zombie.${field} is invalid`) }
    const object = (value: unknown, field: string) => typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown> : fail(field)
    const number = (value: unknown, field: string) => typeof value === 'number' && Number.isFinite(value) ? value : fail(field)
    const hammer = object(config.hammer, 'hammer'), bonk = object(config.bonk, 'bonk')
    if (typeof hammer.reanimId !== 'string' || typeof bonk.particle !== 'string') fail('hammer')
    for (const key of ['x', 'y', 'fps', 'swingTime']) number(hammer[key], `hammer.${key}`)
    for (const key of ['x', 'y']) number(bonk[key], `bonk.${key}`)
    if (!Array.isArray(config.swingSounds) || !Array.isArray(bonk.sounds)) fail('sounds')
    object(config.helmSounds, 'helmSounds')
    if (number(config.seedBankSlide, 'seedBankSlide') <= 0) fail('seedBankSlide')
    return config as unknown as WhackPresentation
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
    private bankY: number
    private lastTick?: number

    private constructor(
        private readonly config: WhackPresentation,
        private readonly kind: string,
        private readonly layer: Node,
        private readonly bank: Node,
        private readonly audio: LevelAudioPresenter,
        private readonly isSun: (typeId: string) => boolean,
        bankHeight: number,
    ) {
        this.bankY = bankHeight
    }

    static async create(context: LevelRuleViewContext): Promise<WhackAZombieView> {
        const { content } = context
        const config = parseConfig(context.config)
        const isSun = (typeId: string) => content.definitions.items[typeId] !== undefined && content.definitions.items[typeId].kind !== 'money'
        const view = new WhackAZombieView(config, context.kind, context.cursorLayer, context.bank, context.audio, isSun, context.bankHeight)
        const node = uiNode({ name: 'Hammer', parent: context.cursorLayer, anchor: { x: 0, y: 1 }, active: false }).node
        node.once(Node.EventType.NODE_DESTROYED, () => UIHoverManager.setIdleCursor('default'))
        const hammer = node.addComponent(ReanimPlayer)
        await hammer.load(config.hammer.reanimId, content.registry, content.loader)
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
        this.audio.sounds(this.config.swingSounds)
        return true
    }

    sync(snapshot: WorldSnapshot, events: readonly ServerEvent[], introComplete: boolean): void {
        for (const event of events) {
            if (event.type !== 'zombieWhacked') continue
            const helm = event.data.helm === undefined ? undefined : String(event.data.helm)
            if (helm !== undefined) { this.audio.sounds(this.config.helmSounds[helm]); continue }
            const { bonk } = this.config
            this.audio.sounds(bonk.sounds)
            const x = Number(event.data.x) + bonk.x, y = Number(event.data.y) + bonk.y
            ParticlePlayer.spawn({ parent: this.layer, id: bonk.particle, x, y: -y })
            this.hammer?.node.setSiblingIndex(this.layer.children.length - 1)
        }
        this.syncBank(snapshot, introComplete)
        const hammer = this.hammer
        if (!hammer?.node.isValid) return
        const point = this.touchSwing ?? this.pointer
        // The mallet is the cursor only in play, while nothing else is held and until the award puts it away.
        const visible = !!point && introComplete && snapshot.phase === 'gameplay' && snapshot.result === 'playing' && !snapshot.paused &&
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
        return (snapshot.extensions[this.kind] as { hammer?: boolean } | undefined)?.hammer === true
    }

    /** mSunMoney + CountSunBeingCollected(). */
    private hasSun(snapshot: WorldSnapshot): boolean {
        return snapshot.sun > 0 || snapshot.items.some(item => item.state === 'collecting' && this.isSun(item.typeId))
    }

    /** Challenge::Update: the hidden bank comes down 2 pixels a tick once there is sun, banked or on its way. */
    private syncBank(snapshot: WorldSnapshot, introComplete: boolean): void {
        if (!introComplete) return
        const ticks = this.lastTick === undefined ? 0 : Math.max(0, snapshot.gameplayTick - this.lastTick)
        this.lastTick = snapshot.gameplayTick
        if (this.bankY > 0 && this.hasSun(snapshot)) {
            this.bankY = Math.max(0, this.bankY - this.config.seedBankSlide * ticks)
        }
        this.bank.active = true
        this.bank.setPosition(this.bank.position.x, this.bankY)
    }
}
