import { Color, Graphics, UIOpacity } from 'cc'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { GameScreenIntroHud } from './GameScreenIntroHud'
import { SpriteLoader } from '@/core/SpriteLoader'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import { easeInOut, lerp } from './GameScreenMath'
import {
    BOARD_OFFSET,
    BOARD_ROOT_X,
    BOARD_ROOT_Y,
    CURSOR_PREVIEW_Z,
    GAME_OVER_BLACK_MAX_OPACITY,
    GAME_OVER_CHOMP_TICK_1,
    GAME_OVER_CHOMP_TICK_2,
    GAME_OVER_END_TICKS,
    GAME_OVER_FULLSCREEN_ALPHA_KEYS,
    GAME_OVER_GRAPHIC_SHAKE_END_TICKS,
    GAME_OVER_GRAPHIC_SHAKE_START_TICKS,
    GAME_OVER_GRAPHIC_START_TICKS,
    GAME_OVER_PAN_END_TICKS,
    GAME_OVER_PAN_START_TICKS,
    GAME_OVER_REANIM_RATE,
    GAME_OVER_SCREAM_TICK,
    GAME_OVER_TITLE_KEYS,
    GAME_OVER_TITLE_MAX_OPACITY,
    GAME_OVER_WINNER_WALK_START_TICKS,
    LEVEL_COMPLETE_FADE_DURATION_TICKS,
    LEVEL_COMPLETE_FADE_START_TICKS,
    LEVEL_COMPLETE_FADE_TICKS,
    LEVEL_COMPLETE_LIGHT_FILL_TICK,
} from './GameScreenCore'

export abstract class GameScreenEndSequences extends GameScreenIntroHud {
    protected _startLevelCompleteEffect() {
        if (this._levelCompleteActive) return

        this._levelCompleteActive = true
        this._levelCompleteTicks = 0
        this._levelCompleteLightFillPlayed = false
        this._levelAwardScreenShown = false
        const awardKind = this._session.level.awardKind ?? (this._session.level.awardSeedType ? 'seed' : null)
        this._levelAward = awardKind
            ? { kind: awardKind, seedType: this._session.level.awardSeedType ?? null }
            : null
        this._gameAccumulator = 0
        this._previousEntitySnapshots.clear()
        this._session.dispatch({ type: 'clearCursor' })
        this._clearAdvice()
        this._clearHugeWaveText()
        this._destroyReadySetPlant()
        this._destroyFinalWaveWarning()
        this._releasePlantCursorHoverBlock()
        this._ensureLevelCompleteOverlay()
        this._syncLevelCompleteEffect()
        void SoundLoader.play(SoundEffect.WinMusic)
    }

    protected _ensureLevelCompleteOverlay() {
        if (this._levelCompleteOverlayNode?.isValid) return

        this._levelCompleteOverlayNode = createUINode('LevelCompleteOverlay', {
            parent: this._uiLayer,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            z: CURSOR_PREVIEW_Z - 1,
        })

        this._levelCompleteFadeNode = createUINode('LevelCompleteFade', {
            parent: this._levelCompleteOverlayNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
        })
        this._levelCompleteFadeNode.addComponent(Graphics)
    }

    protected _updateLevelCompleteEffect(ticks: number) {
        if (ticks <= 0) return

        const previousTicks = this._levelCompleteTicks
        this._levelCompleteTicks = Math.min(LEVEL_COMPLETE_FADE_TICKS, this._levelCompleteTicks + ticks)
        if (
            !this._levelCompleteLightFillPlayed &&
            previousTicks < LEVEL_COMPLETE_LIGHT_FILL_TICK &&
            this._levelCompleteTicks >= LEVEL_COMPLETE_LIGHT_FILL_TICK
        ) {
            this._levelCompleteLightFillPlayed = true
            void SoundLoader.play(SoundEffect.LightFill)
        }
        if (this._levelCompleteTicks >= LEVEL_COMPLETE_FADE_TICKS) {
            this._requestLevelAwardScreen()
        }
        this._syncLevelCompleteEffect()
    }

    protected _syncLevelCompleteEffect() {
        if (!this._levelCompleteActive) return

        this._ensureLevelCompleteOverlay()
        if (this._levelCompleteOverlayNode?.isValid) {
            this._levelCompleteOverlayNode.active = true
            this._levelCompleteOverlayNode.setSiblingIndex(this._uiLayer.children.length - 1)
        }

        const graphics = this._levelCompleteFadeNode?.getComponent(Graphics)
        if (!graphics) return

        const fadeT = Math.max(0, this._levelCompleteTicks - LEVEL_COMPLETE_FADE_START_TICKS) /
            LEVEL_COMPLETE_FADE_DURATION_TICKS
        const alpha = Math.round(255 * Math.max(0, Math.min(1, fadeT)))
        this._levelCompleteFadeNode!.active = alpha > 0
        graphics.clear()
        if (alpha <= 0) return

        graphics.fillColor = new Color(255, 255, 255, alpha)
        graphics.fillRect(0, -600, 800, 600)
    }

    protected _requestLevelAwardScreen() {
        if (this._levelAwardScreenShown) return
        const award = this._levelAward
        if (!award) return

        this._levelAwardScreenShown = true
        this.onAwardScreenRequest?.(award)
    }

    protected _startGameOver(zombieId: number | null) {
        if (this._gameOverActive) return

        this._gameOverActive = true
        this._gameOverTicks = 0
        this._gameOverDialogRequested = false
        this._gameAccumulator = 0
        this._previousEntitySnapshots.clear()
        this._gameOverWinnerZombieId = zombieId
        this._session.dispatch({ type: 'clearCursor' })
        this._clearAdvice()
        this._clearHugeWaveText()
        this._destroyFinalWaveWarning()
        this._destroyReadySetPlant()
        this._releasePlantCursorHoverBlock()
        this._hideGameplayUiForGameOver()
        this._syncSceneAnimationState()
        this._ensureGameOverOverlay()
        this._syncGameOverScene()
        void SoundLoader.play(SoundEffect.LoseMusic)
    }

    protected _hideGameplayUiForGameOver() {
        if (this._seedBankNode?.isValid) this._seedBankNode.active = false
        if (this._menuButtonNode?.isValid) this._menuButtonNode.active = false
        if (this._shovelBankNode?.isValid) this._shovelBankNode.active = false
        if (this._shovelNode?.isValid) this._shovelNode.active = false
        if (this._progressMeterNode?.isValid) this._progressMeterNode.active = false
        if (this._levelLabel?.node?.isValid) this._levelLabel.node.active = false
    }

    protected _ensureGameOverOverlay() {
        if (this._gameOverOverlayNode?.isValid) return

        this._gameOverOverlayNode = createUINode('GameOverOverlay', {
            parent: this._uiLayer,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            z: CURSOR_PREVIEW_Z - 1,
        })

        this._gameOverBlackNode = createUINode('GameOverBlack', {
            parent: this._gameOverOverlayNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
        })
        const graphics = this._gameOverBlackNode.addComponent(Graphics)
        graphics.fillColor = Color.BLACK
        graphics.fillRect(0, -600, 800, 600)

        const title = SpriteLoader.get('zombieswon')
        if (title) {
            this._gameOverTitleNode = createSpriteNode({
                name: 'ZombiesWonTitle',
                spriteFrame: title,
                parent: this._gameOverOverlayNode,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
            })
            this._gameOverTitleNode.addComponent(UIOpacity).opacity = 0
            this._gameOverTitleNode.active = false
        }

        this._gameOverOverlayNode.active = false
    }

    protected _updateGameOver(ticks: number) {
        if (ticks <= 0) return
        if (this._gameOverTicks >= GAME_OVER_END_TICKS) {
            this._requestGameOverDialog()
            return
        }

        const previousTicks = this._gameOverTicks
        this._gameOverTicks = Math.min(GAME_OVER_END_TICKS, this._gameOverTicks + ticks)
        this._updateGameOverWinnerWalk(previousTicks, this._gameOverTicks)
        this._playGameOverTimedSounds(previousTicks, this._gameOverTicks)
        this._syncGameOverScene()
        this._requestGameOverDialog()
    }

    protected _requestGameOverDialog() {
        if (!this._gameOverActive || this._gameOverDialogRequested) return
        if (this._gameOverTicks < GAME_OVER_END_TICKS) return

        this._gameOverDialogRequested = true
        this.onGameOverRequest?.()
    }

    protected _updateGameOverWinnerWalk(previousTicks: number, currentTicks: number) {
        if (currentTicks <= GAME_OVER_WINNER_WALK_START_TICKS) return

        const walkingTicks = currentTicks - Math.max(previousTicks, GAME_OVER_WINNER_WALK_START_TICKS)
        if (walkingTicks <= 0) return

        const winner = this._session.zombies.find((zombie) => zombie.id === this._gameOverWinnerZombieId)
        winner?.advanceGameOverWalk(walkingTicks)
    }

    protected _playGameOverTimedSounds(previousTicks: number, currentTicks: number) {
        if (previousTicks < GAME_OVER_CHOMP_TICK_1 && currentTicks >= GAME_OVER_CHOMP_TICK_1) {
            void SoundLoader.playFoley(SoundEffect.Chomp)
        }
        if (previousTicks < GAME_OVER_CHOMP_TICK_2 && currentTicks >= GAME_OVER_CHOMP_TICK_2) {
            void SoundLoader.playFoley(SoundEffect.Chomp)
        }
        if (previousTicks < GAME_OVER_SCREAM_TICK && currentTicks >= GAME_OVER_SCREAM_TICK) {
            void SoundLoader.playFoley(SoundEffect.Scream)
        }
    }

    protected _syncGameOverScene() {
        if (!this._gameOverActive) return

        if (this._houseDoorBottomNode?.isValid) this._houseDoorBottomNode.active = true
        if (this._houseDoorTopNode?.isValid) this._houseDoorTopNode.active = true
        this._syncGameOverLayerOrder()
        const boardX = this._gameOverBoardX()
        this._boardRoot.setPosition(BOARD_ROOT_X, BOARD_ROOT_Y, 0)
        this._boardContent.setPosition(boardX, 0, 0)
        this._itemLayer.setPosition(boardX, 0, 0)

        this._ensureGameOverOverlay()
        if (this._gameOverOverlayNode?.isValid) {
            this._gameOverOverlayNode.active = true
            this._gameOverOverlayNode.setSiblingIndex(this._uiLayer.children.length - 1)
        }
        this._syncGameOverBlack()
        this._syncGameOverTitle()
    }

    protected _syncGameOverLayerOrder() {
        if (!this._gameOverActive || !this._entityLayer?.isValid) return

        if (this._houseDoorBottomNode?.isValid) {
            this._houseDoorBottomNode.setSiblingIndex(Math.max(0, this._entityLayer.getSiblingIndex()))
            this._entityLayer.setSiblingIndex(this._houseDoorBottomNode.getSiblingIndex() + 1)
        }
        if (this._houseDoorTopNode?.isValid) {
            this._houseDoorTopNode.setSiblingIndex(this._entityLayer.getSiblingIndex() + 1)
        }
    }

    protected _syncGameOverBlack() {
        if (!this._gameOverBlackNode?.isValid) return

        const frame = this._gameOverReanimFrame()
        const alpha = frame < 0
            ? 0
            : Math.round(255 * this._sampleNumberKeyframes(GAME_OVER_FULLSCREEN_ALPHA_KEYS, frame))
        this._gameOverBlackNode.active = alpha > 0
        const graphics = this._gameOverBlackNode.getComponent(Graphics)
        if (!graphics) return

        graphics.clear()
        graphics.fillColor = new Color(0, 0, 0, Math.min(GAME_OVER_BLACK_MAX_OPACITY, alpha))
        graphics.fillRect(0, -600, 800, 600)
    }

    protected _syncGameOverTitle() {
        if (!this._gameOverTitleNode?.isValid) return
        if (this._gameOverDialogRequested) {
            this._gameOverTitleNode.active = false
            return
        }

        const frame = this._gameOverReanimFrame()
        if (frame < 0) {
            this._gameOverTitleNode.active = false
            return
        }

        this._gameOverTitleNode.active = true
        const key = this._sampleGameOverTitleKey(frame)
        let x = key.x
        let y = key.y
        const scale = key.scale

        if (this._gameOverTicks >= GAME_OVER_GRAPHIC_SHAKE_START_TICKS &&
            this._gameOverTicks < GAME_OVER_GRAPHIC_SHAKE_END_TICKS) {
            const shake = this._gameOverTicks - GAME_OVER_GRAPHIC_SHAKE_START_TICKS
            x += Math.sin(shake * 0.75) * 3
            y += Math.cos(shake * 0.92) * 2
        }

        this._gameOverTitleNode.setPosition(x, -y, 0)
        this._gameOverTitleNode.setScale(scale, scale, 1)
        const opacity = this._gameOverTitleNode.getComponent(UIOpacity) ?? this._gameOverTitleNode.addComponent(UIOpacity)
        opacity.opacity = GAME_OVER_TITLE_MAX_OPACITY
    }

    protected _gameOverReanimFrame() {
        const elapsed = this._gameOverTicks - GAME_OVER_GRAPHIC_START_TICKS
        if (elapsed < 0) return -1
        return elapsed * GAME_OVER_REANIM_RATE / 100
    }

    protected _sampleNumberKeyframes(keys: readonly number[], frame: number) {
        if (frame <= 0) return keys[0] ?? 0

        const left = Math.min(keys.length - 1, Math.floor(frame))
        const right = Math.min(keys.length - 1, left + 1)
        const t = Math.max(0, Math.min(1, frame - left))
        return lerp(keys[left], keys[right], t)
    }

    protected _sampleGameOverTitleKey(frame: number) {
        if (frame <= 0) return GAME_OVER_TITLE_KEYS[0]

        const left = Math.min(GAME_OVER_TITLE_KEYS.length - 1, Math.floor(frame))
        const right = Math.min(GAME_OVER_TITLE_KEYS.length - 1, left + 1)
        const t = Math.max(0, Math.min(1, frame - left))
        const start = GAME_OVER_TITLE_KEYS[left]
        const end = GAME_OVER_TITLE_KEYS[right]
        return {
            x: lerp(start.x, end.x, t),
            y: lerp(start.y, end.y, t),
            scale: lerp(start.scale, end.scale, t),
        }
    }

    protected _gameOverBoardX() {
        if (this._gameOverTicks <= GAME_OVER_PAN_START_TICKS) return 0
        if (this._gameOverTicks >= GAME_OVER_PAN_END_TICKS) return BOARD_OFFSET
        return easeInOut(GAME_OVER_PAN_START_TICKS, GAME_OVER_PAN_END_TICKS, this._gameOverTicks, 0, BOARD_OFFSET)
    }

}
