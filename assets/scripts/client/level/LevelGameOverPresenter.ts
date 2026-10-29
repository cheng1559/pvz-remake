import { modResources } from '@/client/content/ModResources'
import type { BoardPresentation } from '@/shared/content/presentation'
import { Color, Graphics, Mask, Node, Sprite, UITransform, SpriteFrame } from 'cc'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { uiNode } from '@/client/view/uiNode'
import { fitViewport } from '@/client/view/ClientViewport'
import { easeInOut, lerp } from '@/client/view/GameScreenMath'
import type { ServerEvent, WorldSnapshot, ZombieSnapshot } from '@/shared/protocol'
import type { LevelAudioPresenter } from './LevelAudioPresenter'
import type { LevelEntityRenderer } from './LevelEntityRenderer'

// Original CutScene timings use 100 game ticks per second.
const PAN_START = 150
const PAN_END = 350
const GRAPHIC_START = 600
const END = 1100
const TITLE_KEYS = [
    [388.9, 293.4, 0.017], [365.2, 272.1, 0.106], [341.6, 250.8, 0.196],
    [317.9, 229.6, 0.285], [294.2, 208.3, 0.374], [270.6, 187.1, 0.464],
    [247.0, 165.8, 0.553], [223.3, 144.5, 0.642], [199.7, 123.3, 0.732],
    [176.0, 102.0, 0.821], [152.4, 80.8, 0.911], [129.9, 59.4, 1],
]
const BLACK_KEYS = [0, 0.05, 0.09, 0.14, 0.18, 0.23, 0.27, 0.32, 0.36, 0.41, 0.45, 0.5]

export class LevelGameOverPresenter {
    private ticks = -1
    private winner?: ZombieSnapshot
    private winnerLayer?: Node
    private title?: Node
    private black?: Graphics

    get active(): boolean { return this.ticks >= 0 }
    get winnerId(): number | undefined { return this.winner?.entityId }

    static async loadAssets(presentation: BoardPresentation['gameOver']): Promise<SpriteFrame[]> {
        const [frames] = await Promise.all([
            Promise.all(presentation.images.map(async name => {
                const frame = await modResources.asset(name, SpriteFrame)
                if (!frame) throw new Error(`Missing game-over image: ${name}`)
                return frame
            })),
            Promise.all([SoundEffect.LoseMusic, SoundEffect.Chomp, SoundEffect.Chomp2, SoundEffect.Scream].map(effect => SoundSystem.load(effect))),
        ])
        return frames
    }

    constructor(
        private readonly board: Node,
        private readonly bank: Node,
        private readonly entityLayer: Node,
        private readonly overlay: Node,
        private readonly entities: LevelEntityRenderer,
        private readonly audio: LevelAudioPresenter,
        private readonly frames: SpriteFrame[],
        private readonly presentation: BoardPresentation['gameOver'],
    ) {}

    sync(snapshot: WorldSnapshot, events: ServerEvent[]): void {
        if (this.active) {
            this.draw()
            return
        }
        this.ticks = 0
        const winnerId = events.find(event => event.type === 'levelLost')?.data.zombieId
        this.winner = snapshot.zombies.find(zombie => winnerId === undefined ? zombie.x <= -100 : zombie.entityId === winnerId)
        this.bank.active = false
        this.audio.stop()
        void SoundSystem.play(SoundEffect.LoseMusic)
        const image = (name: string, parent: Node, frame: SpriteFrame, x: number, y: number) => uiNode({
            name, parent, anchor: { x: 0, y: 1 }, position: { x, y },
            sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        const interior = image('GameOverDoorInterior', this.board, this.frames[1], this.presentation.interior.x - 400, 300 - this.presentation.interior.y)
        interior.setSiblingIndex(this.entityLayer.getSiblingIndex())
        // Clip the winner at board x=-123 as it walks behind the doorway.
        this.winnerLayer = uiNode({
            name: 'GameOverWinner', parent: this.board, size: { width: 1400, height: 600 },
            anchor: { x: (400 - this.presentation.clipX) / 1400, y: 0.5 }, mask: Mask.Type.GRAPHICS_RECT,
        }).node
        this.winnerLayer.setSiblingIndex(this.entityLayer.getSiblingIndex())
        const doorway = image('GameOverDoorMask', this.board, this.frames[2], this.presentation.doorway.x - 400, 300 - this.presentation.doorway.y)
        doorway.setSiblingIndex(this.entityLayer.getSiblingIndex())
        this.black = uiNode({ name: 'GameOverBlack', parent: this.overlay, graphics: true }).graphics!
        this.title = image('ZombiesWonTitle', this.overlay, this.frames[0], 0, 0)
        fitViewport(this.black.node, () => this.draw())
    }

    update(dt: number): boolean {
        if (this.ticks < 0) return false
        const previous = this.ticks
        this.ticks = Math.min(END, this.ticks + dt * 100)
        for (const tick of [510, 560]) if (previous < tick && this.ticks >= tick) void SoundSystem.playFoley(SoundEffect.Chomp)
        if (previous < GRAPHIC_START && this.ticks >= GRAPHIC_START) void SoundSystem.playFoley(SoundEffect.Scream)
        this.draw()
        return this.ticks >= END
    }

    private draw(): void {
        this.board.setPosition(easeInOut(PAN_START, PAN_END, this.ticks, 0, this.presentation.panX), 0)
        if (this.winner && this.winnerLayer) {
            // The original hides the winner while relocating it to the doorway row.
            // Keep that approach visible so a wide viewport never reveals a teleport.
            const y = easeInOut(0, PAN_START, this.ticks, this.winner.y, this.presentation.winnerY)
            const x = easeInOut(0, PAN_START, this.ticks, this.winner.x, Math.max(this.winner.x, this.presentation.clipX))
            // Late loss thresholds can put the root behind the doorway already.
            // Approach in front of the door, then start the clipped walk from its edge.
            this.entities.syncGameOverWinner({ ...this.winner, x }, this.ticks < PAN_START ? this.entityLayer : this.winnerLayer, true,
                Math.max(0, this.ticks - PAN_START), y, Math.min(this.ticks, PAN_START))
        }
        const frame = Math.max(0, (this.ticks - GRAPHIC_START) * 12 / 100)
        const left = Math.min(TITLE_KEYS.length - 1, Math.floor(frame))
        const right = Math.min(TITLE_KEYS.length - 1, left + 1)
        const t = Math.min(1, frame - left)
        this.black!.clear()
        const alpha = this.ticks < GRAPHIC_START ? 0 : Math.min(128, Math.round(255 * lerp(BLACK_KEYS[left], BLACK_KEYS[right], t)))
        if (alpha > 0) {
            this.black!.fillColor = new Color(0, 0, 0, alpha)
            const { width, height } = this.black!.node.getComponent(UITransform)!
            this.black!.fillRect(-width / 2, -height / 2, width, height)
        }
        this.title!.active = this.ticks >= GRAPHIC_START && this.ticks < END
        let x = lerp(TITLE_KEYS[left][0], TITLE_KEYS[right][0], t)
        let y = lerp(TITLE_KEYS[left][1], TITLE_KEYS[right][1], t)
        if (this.ticks >= 700 && this.ticks < 800) {
            x += Math.sin((this.ticks - 700) * 0.75) * 3
            y += Math.cos((this.ticks - 700) * 0.92) * 2
        }
        const scale = lerp(TITLE_KEYS[left][2], TITLE_KEYS[right][2], t)
        this.title!.setPosition(x - 400, 300 - y)
        this.title!.setScale(scale, scale, 1)
    }
}
