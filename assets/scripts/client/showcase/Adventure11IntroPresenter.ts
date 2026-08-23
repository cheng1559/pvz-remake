import { Node, Vec3 } from 'cc'
import { TodParticleSystem } from '@/core/Particle'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import { easeInOut, linearFloat } from '@/client/view/GameScreenMath'
import { Adventure11AudioPresenter } from './Adventure11AudioPresenter'
import type {
    Adventure11IntroSnapshotV2,
    Adventure11ParticleOwnerSnapshotV2,
} from './Adventure11PresentationSnapshotV2'
import type { ContentRegistry } from '@/client/content/ContentRegistry'
import type { ClientContentLoader } from '@/client/content/ClientContentLoader'

const WIDTH = 800
const HEIGHT = 600
const INTRO_END = 855
const PAN_RIGHT_START = 150
const PAN_RIGHT_END = 350
const PAN_LEFT_START = 450
const PAN_LEFT_END = 600
const ROLL_SOD_START = 600
const ROLL_SOD_END = 800
const LAWN_MOWER_START = 820
const LAWN_MOWER_END = 845
const SEED_BANK_START = 800
const SEED_BANK_END = 825
const HOUSE_NAME_DURATION = 250

export class Adventure11IntroPresenter {
    private ticks = 0
    private destroyed = false

    constructor(
        private readonly board: Node,
        private readonly sodClip: Node,
        private readonly sodRoll: ReanimPlayer,
        private readonly introZombies: Node[],
        private readonly bank: Node,
        private readonly houseName: Node,
        private readonly entityNodes: () => Iterable<Node>,
        private readonly audio: Adventure11AudioPresenter,
        private readonly registry: ContentRegistry,
        private readonly loader: ClientContentLoader,
    ) {}

    get complete(): boolean {
        return this.ticks >= INTRO_END
    }

    particleOwner(node: Node): Extract<Adventure11ParticleOwnerSnapshotV2, { kind: 'intro-preview' }> | null {
        for (let slot = 0; slot < this.introZombies.length; slot++) {
            const root = this.introZombies[slot]
            if (node !== root && !node.isChildOf(root)) continue
            const position = root.inverseTransformPoint(new Vec3(), node.worldPosition)
            return { kind: 'intro-preview', slot, x: position.x, y: position.y, z: position.z }
        }
        return null
    }

    particleParent(slot: number): Node | null {
        return this.introZombies[slot] ?? null
    }

    snapshot(): Adventure11IntroSnapshotV2 {
        return {
            ticks: this.ticks,
            previews: this.complete ? [] : this.introZombies.map((node, slot) => ({
                slot,
                x: node.position.x,
                y: node.position.y,
                z: node.position.z,
                reanim: node.getChildByName('ZombieAnimation')!.getComponent(ReanimPlayer)!.snapshot(),
            })),
        }
    }

    async restore(snapshot: Adventure11IntroSnapshotV2): Promise<void> {
        this.ticks = snapshot.ticks
        this.destroyed = this.complete
        if (this.complete) {
            for (const node of this.introZombies) if (node.isValid) node.destroy()
        } else {
            for (const preview of snapshot.previews) {
                const node = this.introZombies[preview.slot]
                if (!node?.isValid) throw new Error(`intro preview ${preview.slot} is unavailable`)
                node.setPosition(preview.x, preview.y, preview.z)
                let animationNode = node.getChildByName('ZombieAnimation')
                let player = animationNode?.getComponent(ReanimPlayer) ?? null
                if (!player || player.snapshot().id !== preview.reanim.id) {
                    if (animationNode?.isValid) animationNode.destroy()
                    animationNode = uiNode({
                        name: 'ZombieAnimation', parent: node, position: { x: 15, y: 8 },
                        anchor: { x: 0, y: 1 },
                    }).node
                    player = animationNode.addComponent(ReanimPlayer)
                    await player.load(preview.reanim.id, this.registry, this.loader)
                }
                player.restore(preview.reanim)
            }
        }
        this.sync()
    }

    update(dt: number): boolean {
        if (this.complete) return true
        const previous = this.ticks
        this.ticks = Math.min(INTRO_END, this.ticks + dt * 100)
        if (previous < ROLL_SOD_START && this.ticks >= ROLL_SOD_START) this.startSodRoll()
        this.sync()
        if (!this.complete) return false
        if (!this.destroyed) {
            this.destroyed = true
            for (const node of this.introZombies) if (node.isValid) node.destroy()
        }
        return true
    }

    sync(): void {
        const tick = this.ticks
        const boardX = tick <= PAN_RIGHT_START
            ? 220
            : tick <= PAN_RIGHT_END
                ? easeInOut(PAN_RIGHT_START, PAN_RIGHT_END, tick, 220, -380)
                : tick <= PAN_LEFT_START
                    ? -380
                    : tick <= PAN_LEFT_END
                        ? easeInOut(PAN_LEFT_START, PAN_LEFT_END, tick, -380, 0)
                        : 0
        this.board.setPosition(boardX, 0)

        const sodProgress = linearFloat(ROLL_SOD_START, ROLL_SOD_END, tick, 0, 1)
        const sodTransform = uiNode({ node: this.sodClip }).transform
        sodTransform.setContentSize(771 * sodProgress, sodTransform.height)
        this.sodRoll.node.active = tick >= ROLL_SOD_START && tick < ROLL_SOD_END
        if (this.sodRoll.node.active) this.sodRoll.seek((tick - ROLL_SOD_START) / 100)

        const houseNameTicks = Math.max(0, HOUSE_NAME_DURATION - tick)
        this.houseName.active = houseNameTicks > 0
        uiNode({ node: this.houseName, opacity: Math.min(255, houseNameTicks * 15) })

        const bankHeight = uiNode({ node: this.bank }).transform.height || 87
        this.bank.active = tick > SEED_BANK_START
        this.bank.setPosition(
            easeInOut(475, PAN_LEFT_END, tick, 0, 10),
            easeInOut(SEED_BANK_START, SEED_BANK_END, tick, bankHeight, 0),
        )

        for (const node of this.entityNodes()) {
            if (!node.getChildByName('CachedMower')) continue
            node.active = tick > LAWN_MOWER_START || this.complete
            if (node.active && !this.complete) {
                node.setPosition(
                    easeInOut(LAWN_MOWER_START, LAWN_MOWER_END, tick, -480, -421),
                    node.position.y,
                )
            }
        }
    }

    private startSodRoll(): void {
        TodParticleSystem.spawn({
            parent: this.board,
            effect: 'sodroll',
            x: 35 - WIDTH / 2,
            y: HEIGHT / 2 - 348,
            useGameTime: false,
        })
        this.audio.sodRollStarted()
    }
}
