import { modResources } from '@/client/content/ModResources'
import type { BoardPresentation, BoardTimePresentation } from '@/shared/content/presentation'
import { Color, Graphics, Mask, Node, Sprite, UITransform, SpriteFrame } from 'cc'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { SpriteBlend } from '@/client/view/SpriteBlend'
import { uiNode } from '@/client/view/uiNode'
import { fitViewport } from '@/client/view/ClientViewport'
import { animateCurve, animateCurveFloat } from '@/shared/content/animation'
import type { ServerEvent, WorldSnapshot, ZombieSnapshot } from '@/shared/protocol'
import type { LevelAudioPresenter } from './LevelAudioPresenter'
import type { LevelEntityRenderer } from './LevelEntityRenderer'
import type { TimeBlend } from './TimeBlends'

// Original CutScene timings use 100 game ticks per second.
const PAN_START = 150
const PAN_END = 350
const GRAPHIC_START = 600
const SHAKE_START = 700
const SHAKE_END = 800
const END = 1100
const TITLE_KEYS = [
    [388.9, 293.4, 0.017], [365.2, 272.1, 0.106], [341.6, 250.8, 0.196],
    [317.9, 229.6, 0.285], [294.2, 208.3, 0.374], [270.6, 187.1, 0.464],
    [247.0, 165.8, 0.553], [223.3, 144.5, 0.642], [199.7, 123.3, 0.732],
    [176.0, 102.0, 0.821], [152.4, 80.8, 0.911], [129.9, 59.4, 1],
]
const BLACK_KEYS = [0, 0.05, 0.09, 0.14, 0.18, 0.23, 0.27, 0.32, 0.36, 0.41, 0.45, 0.5]

/** The door's two pictures: its inside, under the winner, and the doorway's frame, over it. */
export type DoorPart = keyof BoardTimePresentation['door']
const DOOR_PARTS: readonly DoorPart[] = ['interior', 'doorway']

/** A time of day's house door, open as the zombies win: its pictures' sprite IDs (BoardTimePresentation.door) and the pictures (loadDoor). */
export interface GameOverDoor {
    readonly images: BoardTimePresentation['door']
    readonly frames: Readonly<Record<DoorPart, SpriteFrame>>
}

export class LevelGameOverPresenter {
    private ticks = -1
    /** The door's pictures as the zombies win, each blending as the house does (drawDoors). */
    private doors?: Record<DoorPart, { sprite: Sprite, blend: SpriteBlend }>
    /** The door a change of time of day blends into (timeBlend) and its weight, once its pictures are loaded. */
    private blending?: { door: GameOverDoor, weight: number }
    private winner?: ZombieSnapshot
    private winnerLayer?: Node
    private title?: Node
    private black?: Graphics
    private shake = { x: 0, y: 0 }

    get active(): boolean { return this.ticks >= 0 }
    get winnerId(): number | undefined { return this.winner?.entityId }

    /** The board's game over: its title's picture, and its sounds loaded. */
    static async loadAssets(presentation: BoardPresentation['gameOver']): Promise<SpriteFrame> {
        const [title] = await Promise.all([
            modResources.sprite(presentation.title),
            Promise.all([SoundEffect.LoseMusic, SoundEffect.Chomp, SoundEffect.Chomp2, SoundEffect.Scream].map(effect => SoundSystem.load(effect))),
        ])
        return title
    }

    /** A time of day's door with its pictures. */
    static async loadDoor(images: BoardTimePresentation['door']): Promise<GameOverDoor> {
        const [interior, doorway] = await Promise.all(DOOR_PARTS.map(part => modResources.sprite(images[part])))
        return { images, frames: { interior, doorway } }
    }

    constructor(
        private readonly board: Node,
        private readonly bank: Node,
        private readonly entityLayer: Node,
        private readonly overlay: Node,
        private readonly entities: LevelEntityRenderer,
        private readonly audio: LevelAudioPresenter,
        private readonly presentation: BoardPresentation['gameOver'],
        private readonly titleFrame: SpriteFrame,
        /** The door of the time of day the level is at. */
        private door: GameOverDoor,
    ) {}

    /**
     * `/time`'s change of time of day as the house is seen (TimeBlends; `doorOf`, the level's door at a time): the
     * zombies winning while one goes on, the door blends into that time's as the lawn does, held at the weight the level
     * stopped at. Once none goes on, it is the door of the time the level is at.
     */
    timeBlend(doorOf: (time: string) => BoardTimePresentation['door']): TimeBlend {
        let showing = '', changing = false, weight = 0, door: GameOverDoor | undefined
        const settle = () => {
            if (door && !changing) {
                this.door = door
                door = undefined
            }
            this.blending = changing && door ? { door, weight } : undefined
            this.drawDoors()
        }
        return {
            begin: () => {
                changing = true
                weight = 0
            },
            show: async time => {
                showing = time
                door = undefined
                const loaded = await LevelGameOverPresenter.loadDoor(doorOf(time))
                // A later change shows its own.
                if (showing !== time) return
                door = loaded
                settle()
            },
            blend: to => {
                weight = to
                settle()
            },
            end: () => {
                changing = false
                settle()
            },
        }
    }

    /** A door's pictures as the game over draws them. A Mod that draws a house its own way wraps it (the widescreen Mod's TV pictures). */
    doorFrames(door: GameOverDoor): Readonly<Record<DoorPart, SpriteFrame>> {
        return door.frames
    }

    sync(snapshot: WorldSnapshot, events: ServerEvent[]): void {
        if (this.active) {
            this.draw()
            return
        }
        this.ticks = 0
        // Board::ZombiesWon: a loss without a zombie (the debug command's) has nobody walking in.
        const winnerId = events.find(event => event.type === 'levelLost')?.data.zombieId
        this.winner = winnerId === undefined ? undefined : snapshot.zombies.find(zombie => zombie.entityId === winnerId)
        this.bank.active = false
        this.audio.stop()
        void SoundSystem.play(SoundEffect.LoseMusic)
        const image = (name: string, parent: Node, frame: SpriteFrame | null, x: number, y: number) => uiNode({
            name, parent, anchor: { x: 0, y: 1 }, position: { x, y },
            sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).sprite!
        // Board::DrawHouseDoorBottom and Board::DrawHouseDoorTop, under the entities, the winner's layer between the two.
        const door = (name: string, part: DoorPart) => {
            const place = this.presentation[part], sprite = image(name, this.board, null, place.x - 400, 300 - place.y)
            sprite.node.setSiblingIndex(this.entityLayer.getSiblingIndex())
            return { sprite, blend: new SpriteBlend(sprite, true) }
        }
        const interior = door('GameOverDoorInterior', 'interior')
        // Clip the winner at board x=-123 as it walks behind the doorway.
        this.winnerLayer = uiNode({
            name: 'GameOverWinner', parent: this.board, size: { width: 1400, height: 600 },
            anchor: { x: (400 - this.presentation.clipX) / 1400, y: 0.5 }, mask: Mask.Type.GRAPHICS_RECT,
        }).node
        this.winnerLayer.setSiblingIndex(this.entityLayer.getSiblingIndex())
        this.doors = { interior, doorway: door('GameOverDoorMask', 'doorway') }
        this.drawDoors()
        this.black = uiNode({ name: 'GameOverBlack', parent: this.overlay, graphics: true }).graphics!
        this.title = image('ZombiesWonTitle', this.overlay, this.titleFrame, 0, 0).node
        fitViewport(this.black.node, () => this.draw())
    }

    update(dt: number): boolean {
        if (this.ticks < 0) return false
        const previous = this.ticks
        this.ticks = Math.min(END, this.ticks + dt * 100)
        for (const tick of [510, 560]) if (previous < tick && this.ticks >= tick) void SoundSystem.play(SoundEffect.Chomp, { foley: true })
        if (previous < GRAPHIC_START && this.ticks >= GRAPHIC_START) void SoundSystem.play(SoundEffect.Scream, { foley: true })
        // CutScene::UpdateZombiesWon shakes the title by up to 1 each way (SetShakeOverride), anew every tick.
        if (Math.floor(previous) !== Math.floor(this.ticks)) this.shake = this.ticks >= SHAKE_START && this.ticks < SHAKE_END
            ? { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 } : { x: 0, y: 0 }
        this.draw()
        return this.ticks >= END
    }

    /**
     * The door of the time the level is at, blending into the door a change of time blends into as the lawn's copy does
     * (SpriteBlend's cover): every time's pictures of the door lie alike, whole or not drawn (tools/pvz/doors.py), so the
     * old one going out over the new one is the two times' houses blended.
     */
    private drawDoors(): void {
        const doors = this.doors
        if (!doors) return
        const blending = this.blending, from = this.doorFrames(this.door), to = blending && this.doorFrames(blending.door)
        for (const part of DOOR_PARTS) {
            const { sprite, blend } = doors[part]
            if (!sprite.isValid) continue
            sprite.spriteFrame = from[part]
            if (blending && to) blend.show(from[part], to[part], blending.weight)
            else blend.end()
        }
    }

    private draw(): void {
        this.board.setPosition(animateCurve(PAN_START, PAN_END, this.ticks, 0, this.presentation.panX, 'ease-in-out'), 0)
        if (this.winner && this.winnerLayer) {
            // The original hides the winner while relocating it to the doorway row.
            // Keep that approach visible so a wide viewport never reveals a teleport.
            const y = animateCurve(0, PAN_START, this.ticks, this.winner.y, this.presentation.winnerY, 'ease-in-out')
            const x = animateCurve(0, PAN_START, this.ticks, this.winner.x, Math.max(this.winner.x, this.presentation.clipX), 'ease-in-out')
            // Late loss thresholds can put the root behind the doorway already.
            // Approach in front of the door, then start the clipped walk from its edge.
            this.entities.syncGameOverWinner({ ...this.winner, x }, this.ticks < PAN_START ? this.entityLayer : this.winnerLayer,
                Math.max(0, this.ticks - PAN_START), y, Math.min(this.ticks, PAN_START))
        }
        const frame = Math.max(0, (this.ticks - GRAPHIC_START) * 12 / 100)
        const left = Math.min(TITLE_KEYS.length - 1, Math.floor(frame))
        const right = Math.min(TITLE_KEYS.length - 1, left + 1)
        const t = Math.min(1, frame - left)
        this.black!.clear()
        const alpha = this.ticks < GRAPHIC_START ? 0 : Math.min(128, Math.round(255 * animateCurveFloat(0, 1, t, BLACK_KEYS[left], BLACK_KEYS[right])))
        if (alpha > 0) {
            this.black!.fillColor = new Color(0, 0, 0, alpha)
            const { width, height } = this.black!.node.getComponent(UITransform)!
            this.black!.fillRect(-width / 2, -height / 2, width, height)
        }
        this.title!.active = this.ticks >= GRAPHIC_START && this.ticks < END
        const x = animateCurveFloat(0, 1, t, TITLE_KEYS[left][0], TITLE_KEYS[right][0]) + this.shake.x
        const y = animateCurveFloat(0, 1, t, TITLE_KEYS[left][1], TITLE_KEYS[right][1]) + this.shake.y
        const scale = animateCurveFloat(0, 1, t, TITLE_KEYS[left][2], TITLE_KEYS[right][2])
        this.title!.setPosition(x - 400, 300 - y)
        this.title!.setScale(scale, scale, 1)
    }
}
