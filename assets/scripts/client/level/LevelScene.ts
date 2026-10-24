import {
    _decorator,
    Component,
} from 'cc'
import { gameClock } from '@/core/GameClock'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { LevelAudioPresenter } from './LevelAudioPresenter'
import { LevelInputPresenter } from './LevelInputPresenter'
import { LevelView } from './LevelView'
import type { LevelGame, LevelStartOptions } from './LevelGame'
import type { ClientPresentationSnapshot } from '@/client/game/ClientPresentationSnapshot'

const { ccclass } = _decorator

export interface LevelLifecycle {
    onMenu?: () => void | Promise<void>
    onComplete?: () => void | Promise<void>
    onGameOver?: () => void | Promise<void>
}

@ccclass('LevelScene')
export class LevelScene extends Component {
    private game?: LevelGame
    private view?: LevelView
    private audio?: LevelAudioPresenter
    private input?: LevelInputPresenter
    private lifecycle: LevelLifecycle = {}
    private completing = false
    private gameOverNotified = false
    private introCompletionSent = false
    private stopAudioOnDestroy = true
    private snapshotting = false

    configure(
        game: LevelGame,
        view: LevelView,
        startOptions: LevelStartOptions,
        lifecycle: LevelLifecycle = {},
    ): void {
        this.game = game
        this.view = view
        this.audio = view.audio
        this.input = new LevelInputPresenter(this.node, game, view, () => { void this.lifecycle.onMenu?.() })
        this.lifecycle = lifecycle
        this.input.start()
        view.bindSeedChooser(command => { game.command(command); game.update(0); view.sync(game.render(), game.drainChanges(), game.drainEvents()) })
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

    async snapshotPresentation(): Promise<ClientPresentationSnapshot> {
        if (!this.game || !this.view || !this.input) throw new Error('Level scene is not configured')
        if (this.snapshotting) throw new Error('Level presentation snapshot is already in progress')
        this.snapshotting = true
        this.input.suspend()
        try {
            const level = await this.view.snapshot({
                introCompletionSent: this.introCompletionSent,
                completionStarted: this.completing,
            })
            return this.game.snapshotPresentation(level)
        } finally {
            this.snapshotting = false
            if (!this.game.render().paused) this.input.resume()
        }
    }

    async restorePresentation(value: unknown): Promise<void> {
        if (!this.game || !this.view) throw new Error('Level scene is not configured')
        const snapshot = this.game.restorePresentation(value)
        this.introCompletionSent = snapshot.flow.introCompletionSent
        this.completing = snapshot.flow.completionStarted
        this.view.sync(this.game.render(), this.game.drainChanges(), [])
        await this.view.restore(snapshot)
        this.view.setPaused(this.game.render().paused)
        if (this.game.render().paused) {
            this.input?.suspend()
            this.audio?.pause()
        }
    }

    prepareForReplacement(): void {
        this.stopAudioOnDestroy = false
    }

    update(dt: number): void {
        if (this.snapshotting || this.completing || this.gameOverNotified || !this.game || !this.view || !this.audio) return
        if (this.game.render().paused) {
            // Debug commands can create animation components after the initial pause.
            this.view.setPaused(true)
            return
        }
        dt = gameClock.delta(dt)
        const introComplete = this.view.updateIntro(dt)
        if (introComplete && !this.introCompletionSent) {
            this.introCompletionSent = true
            this.game.command({ type: 'completeIntro' })
            this.audio.startGameplay()
        }
        this.game.update(GameDebugSettings.perfLogicEnabled ? dt : 0)
        const snapshot = this.game.render()
        this.view.sync(snapshot, this.game.drainChanges(), this.game.drainEvents())
        this.audio.syncResult(snapshot.result)
        if (snapshot.result === 'lost') {
            this.input?.suspend()
            if (this.view.updateGameOver(dt) && !this.gameOverNotified && this.lifecycle.onGameOver) {
                this.gameOverNotified = true
                void Promise.resolve(this.lifecycle.onGameOver())
            }
            return
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
        this.view.setPaused(paused)
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
