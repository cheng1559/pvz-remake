import { _decorator, Component, EventKeyboard, game, Game, input, Input, KeyCode, Label } from 'cc'
import { DEBUG } from 'cc/env'
import { uiNode } from '@/client/view/uiNode'
import { installContentShowcaseProbe } from '@/client/showcase/ContentShowcase'
import { installPhase0PlatformProbe } from '@/platform/phase0/PlatformProbe'
import {
    createIntegratedAdventure11Controller,
    installIntegratedAdventure11Probe,
    type IntegratedAdventure11Controller,
} from './IntegratedAdventure11Probe'
import { ProfileStore } from './persistence/ProfileStore'

const { ccclass } = _decorator

@ccclass('GameApp')
export class GameApp extends Component {
    private controller: IntegratedAdventure11Controller | null = null
    private status: Label | null = null
    private loading = false

    start(): void {
        this.status = uiNode({
            name: 'Status', parent: this.node, size: { width: 760, height: 180 },
        }).node.addComponent(Label)
        this.status.fontSize = 22
        this.status.lineHeight = 32
        this.controller = createIntegratedAdventure11Controller(this.node, {
            onComplete: () => this.finish('Adventure 1-1 complete'),
            onGameOver: () => this.finish('Game over'),
        })
        if (DEBUG) {
            installPhase0PlatformProbe()
            installContentShowcaseProbe(this.node)
            installIntegratedAdventure11Probe(this.controller)
        }
        game.on(Game.EVENT_HIDE, this.save, this)
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this)
        void this.play()
    }

    private async play(forceNewGame = false): Promise<void> {
        if (this.loading || !this.controller) return
        this.loading = true
        this.showStatus('Loading Adventure 1-1...')
        try {
            const profile = ProfileStore.loadCurrentProfile() ?? ProfileStore.createProfile('Player')
            if (!profile) throw new Error('Could not create a player profile')
            await this.controller.play({ forceNewGame })
            if (this.status?.isValid) this.status.node.active = false
        } catch (error) {
            console.error('[GameApp] Failed to start Adventure 1-1', error)
            this.showStatus(`${error instanceof Error ? error.message : String(error)}\nR: start a new game`)
        } finally {
            this.loading = false
        }
    }

    private finish(message: string): void {
        this.controller?.deleteSave()
        this.controller?.hide()
        this.showStatus(`${message}\nR: play again`)
    }

    private showStatus(message: string): void {
        if (!this.status?.isValid) return
        this.status.string = message
        this.status.node.active = true
    }

    private onKeyDown(event: EventKeyboard): void {
        if (event.keyCode === KeyCode.ESCAPE && this.controller?.isRunning()) {
            if (this.controller.isPaused()) this.controller.resume()
            else this.controller.pause()
        } else if (event.keyCode === KeyCode.KEY_R && !this.controller?.isRunning()) {
            void this.play(true)
        }
    }

    private save(): void {
        void this.controller?.saveIfRunning().catch(error => {
            console.error('[GameApp] Failed to save Adventure 1-1', error)
        })
    }

    onDestroy(): void {
        this.save()
        game.off(Game.EVENT_HIDE, this.save, this)
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
    }
}
