import {
    _decorator,
    Component,
} from 'cc'
import type { ClientWorldChanges } from '@/client/game/ClientWorld'
import type { GameplayDefinitionsV2 } from '@/shared/content/gameplay'
import type {
    GameCommand,
    ServerEvent,
    StartSessionPacket,
    WorldSnapshot,
} from '@/shared/protocol/index'
import { Adventure11AudioPresenter } from './Adventure11AudioPresenter'
import { Adventure11InputPresenter } from './Adventure11InputPresenter'
import { Adventure11View } from './Adventure11View'
import type { Adventure11PresentationSnapshotV2 } from './Adventure11PresentationSnapshotV2'
import type { ClientPresentationSnapshotV2 } from '@/client/game/ClientPresentationSnapshot'

const { ccclass } = _decorator
type Adventure11StartOptions = Omit<StartSessionPacket, 'protocolVersion' | 'sequence' | 'type'>

export interface IntegratedAdventure11Lifecycle {
    onComplete?: () => void | Promise<void>
    onGameOver?: () => void | Promise<void>
}

const DEFAULT_START_OPTIONS: Adventure11StartOptions = {
    levelId: 'pvz:adventure-1-1',
    randomSeed: 0x50565a31,
    initialMoney: 0,
    firstAdventure: true,
    mods: [],
}

export interface Adventure11Game {
    readonly definitions: GameplayDefinitionsV2
    start(options: Adventure11StartOptions): void
    command(command: GameCommand): void
    update(dtSeconds: number): void
    render(): WorldSnapshot
    drainEvents(): ServerEvent[]
    drainChanges(): ClientWorldChanges
    snapshotPresentation(adventure11: Adventure11PresentationSnapshotV2): ClientPresentationSnapshotV2
    restorePresentation(value: unknown): Adventure11PresentationSnapshotV2
}

@ccclass('IntegratedAdventure11Showcase')
export class IntegratedAdventure11Showcase extends Component {
    private game?: Adventure11Game
    private view?: Adventure11View
    private audio?: Adventure11AudioPresenter
    private input?: Adventure11InputPresenter
    private lifecycle: IntegratedAdventure11Lifecycle = {}
    private completing = false
    private gameOverNotified = false
    private introCompletionSent = false
    private stopAudioOnDestroy = true
    private snapshotting = false

    configure(
        game: Adventure11Game,
        view: Adventure11View,
        lifecycle: IntegratedAdventure11Lifecycle = {},
        startOptions: Adventure11StartOptions = DEFAULT_START_OPTIONS,
    ): void {
        this.game = game
        this.view = view
        this.audio = view.audio
        this.input = new Adventure11InputPresenter(this.node, game, view)
        this.lifecycle = lifecycle
        this.input.start()
        game.start(startOptions)
        if (startOptions.save === undefined) this.audio.startChoosing()
        view.sync(game.render(), game.drainChanges(), game.drainEvents())
    }

    isPaused(): boolean {
        return this.game?.render().paused ?? false
    }

    pause(): void {
        this.setPaused(true)
    }

    resume(): void {
        this.setPaused(false)
    }

    async snapshotPresentation(): Promise<ClientPresentationSnapshotV2> {
        if (!this.game || !this.view || !this.input) throw new Error('Adventure 1-1 showcase is not configured')
        if (this.snapshotting) throw new Error('Adventure 1-1 presentation snapshot is already in progress')
        this.snapshotting = true
        this.input.suspend()
        try {
            const adventure11 = await this.view.snapshot({
                introCompletionSent: this.introCompletionSent,
                completionStarted: this.completing,
            })
            return this.game.snapshotPresentation(adventure11)
        } finally {
            this.snapshotting = false
            if (!this.game.render().paused) this.input.resume()
        }
    }

    async restorePresentation(value: unknown): Promise<void> {
        if (!this.game || !this.view) throw new Error('Adventure 1-1 showcase is not configured')
        const snapshot = this.game.restorePresentation(value)
        this.introCompletionSent = snapshot.flow.introCompletionSent
        this.completing = snapshot.flow.completionStarted
        this.view.sync(this.game.render(), this.game.drainChanges(), [])
        await this.view.restore(snapshot)
        if (this.game.render().paused) {
            this.input?.suspend()
            this.audio?.pause()
        }
    }

    prepareForReplacement(): void {
        this.stopAudioOnDestroy = false
    }

    update(dt: number): void {
        if (this.snapshotting || this.completing || this.gameOverNotified || !this.game || !this.view || !this.audio || this.game.render().paused) return
        const introComplete = this.view.updateIntro(dt)
        if (introComplete && !this.introCompletionSent) {
            this.introCompletionSent = true
            this.game.command({ type: 'completeIntro' })
            this.audio.startGameplay()
        }
        this.game.update(dt)
        const snapshot = this.game.render()
        this.view.sync(snapshot, this.game.drainChanges(), this.game.drainEvents())
        this.audio.syncResult(snapshot.result)
        if (snapshot.result === 'lost' && !this.gameOverNotified && this.lifecycle.onGameOver) {
            this.gameOverNotified = true
            void Promise.resolve(this.lifecycle.onGameOver())
        }
        if (!introComplete) return
        if (this.view.updateLevelComplete(dt) && !this.completing) {
            this.completing = true
            if (!this.lifecycle.onComplete) return
            const destroy = () => {
                if (this.node.isValid) this.node.destroy()
            }
            Promise.resolve(this.lifecycle.onComplete()).then(destroy, destroy)
        }
    }

    private setPaused(paused: boolean): void {
        if (!this.game || !this.view || this.game.render().paused === paused) return
        this.game.command({ type: paused ? 'pause' : 'resume' })
        this.game.update(0)
        this.view.sync(this.game.render(), this.game.drainChanges(), this.game.drainEvents())
        if (paused) {
            this.input?.suspend()
            this.audio?.pause()
        } else {
            this.input?.resume()
            this.audio?.resume()
        }
    }

    protected onDestroy(): void {
        this.input?.destroy()
        if (this.stopAudioOnDestroy) this.audio?.stop()
    }
}
