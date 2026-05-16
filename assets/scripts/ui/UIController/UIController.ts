import {
    _decorator,
    Component,
    EventKeyboard,
    game,
    input,
    Input,
    Node,
    screen,
    sys,
} from 'cc'
import { FontLoader } from '@/core/FontLoader'
import { AdventureGameScreen } from '@/game/GameScreen'
import {
    ADVENTURE_1_1,
    ADVENTURE_1_2,
    ADVENTURE_1_3,
    ADVENTURE_1_4,
    ADVENTURE_1_5,
    ADVENTURE_LEVELS,
    popGlobalGamePause,
    pushGlobalGamePause,
    scaleGameDeltaTime,
} from '@/game/GameDefinitions'
import { AdviceWidget } from '../AdviceWidget'
import { AchievementScreen } from '../AchievementScreen'
import { AwardScreen } from '../AwardScreen'
import { AlmanacScreen } from '../AlmanacScreen/AlmanacScreen'
import { StoreScreen } from '../StoreScreen/StoreScreen'
import { ZenGardenScreen } from '../ZenGardenScreen/ZenGardenScreen'
import { ChallengePage, ChallengeScreen } from '../ChallengeScreen'
import { UIButton } from '../Button'
import { DebugCliDialog, executeDebugCliCommand } from '../DebugCliDialog'
import { DialogButtonMode, DialogResult, MessageBox } from '../MessageBox/MessageBox'
import { MessageBoxAssets } from '../MessageBox/MessageBoxAssets'
import { HelpScreen } from '../HelpScreen'
import { OptionsDialog } from '../OptionsDialog'
import { PauseDialog } from '../PauseDialog'
import { SelectorScreen } from '../SelectorScreen/SelectorScreen'
import { StartupResourceLoader } from '../StartupResourceLoader'
import { createStoneButton } from '../StoneButton'
import { createUINode } from '../UIFactory'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import type { LevelAward } from '@/game/GameTypes'
import type { LevelDefinition } from '@/game/GameTypes'
import { GameSettingsStore, type GameSettings } from '@/game/persistence/GameSettingsStore'
import { ProfileStore, type PlayerProfile } from '@/game/persistence/ProfileStore'

const { ccclass, property } = _decorator
const DEBUG_START_ADVENTURE_DIRECTLY = false
const DEBUG_CLI_KEY_CODE = 191
const GAME_OVER_MAIN_MENU_X = 235
const GAME_OVER_MAIN_MENU_Y = 310
const GAME_OVER_MAIN_MENU_WIDTH = 163
const GAME_OVER_MAIN_MENU_HEIGHT = 46
const ACHIEVEMENT_TRANSITION_SECONDS = 0.75
const ACHIEVEMENT_SELECTOR_HIDDEN_Y = 600
const ACHIEVEMENT_SCREEN_HIDDEN_Y = -599
const ACHIEVEMENT_SCREEN_SHOWN_Y = 1
const NATIVE_UNCAPPED_FRAME_RATE = 1000
const FULLSCREEN_CHANGE_EVENT = 'fullscreen-change' as never

interface StoreScreenOptions {
    initialPage?: number
    backButtonLabel?: string
    onBack?: () => void
}

interface AlmanacDialogOptions {
    onClose?: () => void
}

interface AchievementTransitionState {
    mode: 'show' | 'hide'
    elapsed: number
    selectorNode: Node
    achievementNode: Node
}

@ccclass('UIController')
export class UIController extends Component {
    @property(Node)
    uiRoot: Node | null = null

    private _currentScreen: Node | null = null
    private _selectorScreen: SelectorScreen | null = null
    private _adventureGameScreen: AdventureGameScreen | null = null
    private _achievementScreen: Node | null = null
    private _modalScreen: Node | null = null
    private _debugCliScreen: Node | null = null
    private _globalAdviceLayer: Node | null = null
    private _globalAdviceWidget: AdviceWidget | null = null
    private _globalAdviceTick = 0
    private _settings: GameSettings = GameSettingsStore.load()
    private _profile: PlayerProfile | null = null
    private _adventureLevel: LevelDefinition = ADVENTURE_1_1
    private _gameOverMainMenuButton: Node | null = null
    private _gameOverDialogDragging = false
    private _screenTransitioning = false
    private _achievementTransition: AchievementTransitionState | null = null

    onLoad() {
        if (!this.uiRoot) {
            this.uiRoot = this.node
        }

        this._profile = ProfileStore.loadCurrentProfile()
        this._applyPersistedSettings()
        this._adventureLevel = this._getProfileAdventureLevel()
        this._configurePlatformFrameRate()
        screen.on(FULLSCREEN_CHANGE_EVENT, this._onFullScreenChanged, this)
        input.on(Input.EventType.KEY_DOWN, this._onGlobalKeyDown, this)
        void this._bootstrap()
    }

    onDestroy() {
        screen.off(FULLSCREEN_CHANGE_EVENT, this._onFullScreenChanged, this)
        input.off(Input.EventType.KEY_DOWN, this._onGlobalKeyDown, this)
    }

    update(dt: number) {
        const scaledDt = scaleGameDeltaTime(dt)
        this._globalAdviceTick += scaledDt * 100
        this._globalAdviceWidget?.update(scaledDt * 100, this._globalAdviceTick)
        if (this._globalAdviceWidget?.node.active) this._placeGlobalAdviceLayer()
        this._updateAchievementTransition(scaledDt)
    }

    private _configurePlatformFrameRate() {
        if (sys.isNative && game.frameRate < NATIVE_UNCAPPED_FRAME_RATE) {
            game.frameRate = NATIVE_UNCAPPED_FRAME_RATE
        }
    }

    private async _bootstrap() {
        await StartupResourceLoader.preloadStartup()
        if (DEBUG_START_ADVENTURE_DIRECTLY) {
            this.showAdventureGame()
            return
        }
        if (this._shouldStartDebugAdventure()) {
            this.showAdventureGame()
            return
        }
        await this.showSelectorScreen()
    }

    async showSelectorScreen(): Promise<SelectorScreen | null> {
        const [animation, zombieArmAnimation] = await Promise.all([
            StartupResourceLoader.loadJson('animations/selectorscreen'),
            StartupResourceLoader.loadJson('animations/zombie_hand'),
        ])
        if (!animation || !zombieArmAnimation) return null

        const node = createUINode('SelectorScreen', { active: false, width: 800, height: 600 })

        const selectorScreen = node.addComponent(SelectorScreen)
        selectorScreen.animation = animation
        selectorScreen.zombieArmAnimation = zombieArmAnimation
        const playableAdventureLevel = this._getProfileAdventureLevel()
        this._adventureLevel = playableAdventureLevel
        selectorScreen.adventureLevel = playableAdventureLevel.adventureLevel
        selectorScreen.finishedAdventure = this._profile?.finishedAdventure ?? 0
        selectorScreen.setAccessState({
            minigamesLocked: !this._canShowMinigames(),
            puzzleLocked: !this._canShowPuzzle(),
            survivalLocked: !this._canShowSurvival(),
            almanacAvailable: this._canShowAlmanac(),
            storeAvailable: this._canShowStore(),
            zenGardenAvailable: this._canShowZenGarden(),
        })
        selectorScreen.onLockedModeClick = (name) => {
            const message =
                name === 'miniGames'
                    ? 'Play more Adventure to \nunlock the Mini-games.'
                    : name === 'Puzzle'
                        ? 'Play more Adventure to \nunlock Puzzle Mode.'
                        : 'Play more Adventure to \nunlock Survival Mode.'
            void this._showSelectorLockedDialog('Locked!', message)
        }
        selectorScreen.onMessageBoxRequest = () => {
            this.showMessageBox('Message', 'Hello from SelectorScreen!')
        }
        selectorScreen.onOptionsRequest = () => {
            this.showOptionsDialog()
        }
        selectorScreen.onHelpRequest = () => {
            this.showHelpScreen()
        }
        selectorScreen.onQuitRequest = () => {
            void this.confirmQuit()
        }
        selectorScreen.onChallengePageRequest = (page) => {
            if (
                (page === ChallengePage.MiniGames && !this._canShowMinigames()) ||
                (page === ChallengePage.Puzzle && !this._canShowPuzzle()) ||
                (page === ChallengePage.Survival && !this._canShowSurvival())
            ) {
                selectorScreen.onLockedModeClick?.(
                    page === ChallengePage.MiniGames
                        ? 'miniGames'
                        : page === ChallengePage.Puzzle
                            ? 'Puzzle'
                            : 'Survival',
                )
                return
            }
            this.showChallengeScreen(page)
        }
        selectorScreen.onAchievementRequest = () => {
            this.showAchievementScreen()
        }
        selectorScreen.onZenGardenRequest = () => {
            if (!this._canShowZenGarden()) {
                return
            }
            this.showZenGardenScreen()
        }
        selectorScreen.onStoreRequest = () => {
            if (!this._canShowStore()) {
                return
            }
            this.showStoreDialog()
        }
        selectorScreen.onAlmanacRequest = () => {
            if (!this._canShowAlmanac()) {
                return
            }
            this.showAlmanacDialog()
        }
        selectorScreen.onAdventureRequest = () => {
            this.showAdventureGame(this._getProfileAdventureLevel())
        }

        this._selectorScreen = null
        this._adventureGameScreen = null
        this._setCurrentScreen(node)
        this._selectorScreen = selectorScreen
        return selectorScreen
    }

    showAdventureGame(level: LevelDefinition = this._adventureLevel): AdventureGameScreen | null {
        this._adventureLevel = level
        this._selectorScreen = null
        const node = createUINode('AdventureGameScreen', { active: false, width: 800, height: 600 })
        const gameScreen = node.addComponent(AdventureGameScreen)
        gameScreen.levelDefinition = level
        gameScreen.firstTimeAdventure = (this._profile?.finishedAdventure ?? 0) <= 0
        gameScreen.initialMoney = this._profile?.coins ?? 0
        gameScreen.onBackToMenu = () => {
            void this.showSelectorScreen()
        }
        gameScreen.onMenuRequest = () => {
            this.showGameOptionsDialog(gameScreen)
        }
        gameScreen.onPauseRequest = () => {
            this.showPauseDialog(gameScreen)
        }
        gameScreen.onGameOverRequest = () => {
            this.showGameOverDialog()
        }
        gameScreen.onAwardScreenRequest = (award) => {
            const profileAdventureLevel = this._advanceAdventureProgress(gameScreen.levelDefinition.adventureLevel)
            this.showAwardScreen(award, profileAdventureLevel)
        }
        gameScreen.onMoneyChanged = (amount) => {
            this._setProfileCoins(amount)
        }

        this._setCurrentScreen(node)
        this._adventureGameScreen = gameScreen
        return gameScreen
    }

    showAwardScreen(
        award: LevelAward,
        adventureLevel = this._profile?.adventureLevel ?? this._adventureLevel.adventureLevel,
    ): AwardScreen | null {
        const node = createUINode('AwardScreen', { active: false, width: 800, height: 600 })
        const awardScreen = node.addComponent(AwardScreen)
        awardScreen.awardKind = award.kind
        awardScreen.seedType = award.seedType
        awardScreen.adventureLevel = adventureLevel
        awardScreen.onNextLevelRequest = () => {
            const nextLevel = this._nextAdventureLevel()
            if (nextLevel.id === this._adventureLevel.id) {
                void this.showSelectorScreen()
                return
            }
            this.showAdventureGame(nextLevel)
        }
        awardScreen.onBackToMenu = () => {
            void this.showSelectorScreen()
        }

        void awardScreen.ensureRendered().then(() => {
            if (!node.isValid) return
            this._selectorScreen = null
            this._adventureGameScreen = null
            this._setCurrentScreen(node)
        }).catch((error) => {
            console.error('[UIController] Failed to prepare AwardScreen', error)
            if (node.isValid) node.destroy()
        })
        return awardScreen
    }

    showHelpScreen(): HelpScreen | null {
        const node = createUINode('HelpScreen', { active: false, width: 800, height: 600 })
        const helpScreen = node.addComponent(HelpScreen)
        helpScreen.onBackToMenu = () => {
            void this.showSelectorScreen()
        }

        void helpScreen.ensureRendered().then(() => {
            if (!node.isValid) return
            this._setCurrentScreen(node)
        }).catch((error) => {
            console.error('[UIController] Failed to prepare HelpScreen', error)
            if (node.isValid) node.destroy()
        })
        return helpScreen
    }

    showAlmanacScreen(): AlmanacScreen | null {
        const node = createUINode('AlmanacScreen', { active: false, width: 800, height: 600 })
        const almanacScreen = node.addComponent(AlmanacScreen)
        almanacScreen.onBackToMenu = () => {
            void this.showSelectorScreen()
        }

        void almanacScreen.ensureRendered().then(() => {
            if (!node.isValid) return
            this._selectorScreen = null
            this._adventureGameScreen = null
            this._setCurrentScreen(node)
        }).catch((error) => {
            console.error('[UIController] Failed to prepare AlmanacScreen', error)
            if (node.isValid) node.destroy()
        })
        return almanacScreen
    }

    showChallengeScreen(page: ChallengePage): ChallengeScreen | null {
        const node = createUINode('ChallengeScreen', { active: false, width: 800, height: 600 })
        const challengeScreen = node.addComponent(ChallengeScreen)
        challengeScreen.page = page
        challengeScreen.onBackToMenu = () => {
            void this.showSelectorScreen()
        }

        void challengeScreen.ensureRendered().then(() => {
            if (!node.isValid) return
            this._selectorScreen = null
            this._adventureGameScreen = null
            this._setCurrentScreen(node)
        }).catch((error) => {
            console.error('[UIController] Failed to prepare ChallengeScreen', error)
            if (node.isValid) node.destroy()
        })
        return challengeScreen
    }

    showZenGardenScreen(): ZenGardenScreen | null {
        const node = createUINode('ZenGardenScreen', { active: false, width: 800, height: 600 })
        const zenGardenScreen = node.addComponent(ZenGardenScreen)
        zenGardenScreen.onBackToMenu = () => {
            void this.showSelectorScreen()
        }
        zenGardenScreen.onStoreRequest = () => {
            this.showStoreScreen({
                initialPage: 2,
                backButtonLabel: 'GO BACK',
                onBack: () => {
                    this.showZenGardenScreen()
                },
            })
        }

        void zenGardenScreen.ensureRendered().then(() => {
            if (!node.isValid) return
            this._selectorScreen = null
            this._adventureGameScreen = null
            this._setCurrentScreen(node)
        }).catch((error) => {
            console.error('[UIController] Failed to prepare ZenGardenScreen', error)
            if (node.isValid) node.destroy()
        })
        return zenGardenScreen
    }

    showStoreScreen(options: StoreScreenOptions = {}): StoreScreen | null {
        const node = createUINode('StoreScreen', { active: false, width: 800, height: 600 })
        const storeScreen = node.addComponent(StoreScreen)
        storeScreen.initialPage = options.initialPage ?? 0
        storeScreen.backButtonLabel = options.backButtonLabel ?? 'MAIN MENU'
        storeScreen.onBackToMenu = options.onBack ?? (() => {
            void this.showSelectorScreen()
        })

        void storeScreen.ensureRendered().then(() => {
            if (!node.isValid) return
            this._selectorScreen = null
            this._adventureGameScreen = null
            this._setCurrentScreen(node)
        }).catch((error) => {
            console.error('[UIController] Failed to prepare StoreScreen', error)
            if (node.isValid) node.destroy()
        })
        return storeScreen
    }

    showStoreDialog(): StoreScreen | null {
        if (
            this._screenTransitioning ||
            this._modalScreen?.isValid ||
            !this._currentScreen?.isValid ||
            !this._selectorScreen?.node.isValid
        ) {
            return null
        }

        const node = createUINode('StoreDialog', { active: false, width: 800, height: 600 })
        const storeScreen = node.addComponent(StoreScreen)
        storeScreen.onBackToMenu = () => {
            this.hideModalScreen()
        }

        this.uiRoot!.addChild(node)
        node.active = true
        this._modalScreen = node
        this._selectorScreen.setButtonsInteractable(false)
        return storeScreen
    }

    showAlmanacDialog(options: AlmanacDialogOptions = {}): AlmanacScreen | null {
        if (
            this._screenTransitioning ||
            this._modalScreen?.isValid ||
            !this._currentScreen?.isValid
        ) {
            return null
        }

        const node = createUINode('AlmanacDialog', { active: false, width: 800, height: 600 })
        const almanacScreen = node.addComponent(AlmanacScreen)
        almanacScreen.onBackToMenu = () => {
            this.hideModalScreen()
            options.onClose?.()
        }

        this.uiRoot!.addChild(node)
        node.active = true
        this._modalScreen = node
        this._selectorScreen?.setButtonsInteractable(false)
        return almanacScreen
    }

    hideModalScreen() {
        if (!this._modalScreen?.isValid) return

        const dialogNode = this._modalScreen
        this._modalScreen = null
        dialogNode.destroy()
        this._selectorScreen?.setButtonsInteractable(true)
    }

    showAchievementScreen(): AchievementScreen | null {
        if (
            this._screenTransitioning ||
            this._achievementScreen?.isValid ||
            !this._currentScreen?.isValid ||
            !this._selectorScreen?.node.isValid
        ) {
            return null
        }

        const node = createUINode('AchievementScreen', { active: false, width: 800, height: 600 })
        const achievementScreen = node.addComponent(AchievementScreen)
        achievementScreen.earnedAchievements = this._profile?.earnedAchievements ?? []
        achievementScreen.onBackToMenu = () => {
            this.hideAchievementScreen()
        }

        this.uiRoot!.addChild(node)
        node.setPosition(0, -599, 0)
        node.active = true
        this._achievementScreen = node

        this._selectorScreen?.setButtonsInteractable(false)
        this._startAchievementTransition('show', this._currentScreen, node)

        return achievementScreen
    }

    hideAchievementScreen() {
        if (
            this._screenTransitioning ||
            !this._achievementScreen?.isValid ||
            !this._currentScreen?.isValid
        ) {
            return
        }

        const achievementNode = this._achievementScreen
        this._startAchievementTransition('hide', this._currentScreen, achievementNode)
    }

    private _startAchievementTransition(mode: 'show' | 'hide', selectorNode: Node, achievementNode: Node) {
        this._screenTransitioning = true
        this._achievementTransition = {
            mode,
            elapsed: 0,
            selectorNode,
            achievementNode,
        }
        this._applyAchievementTransition(this._achievementTransition, 0)
    }

    private _updateAchievementTransition(dt: number) {
        const transition = this._achievementTransition
        if (!transition) return

        if (!transition.selectorNode.isValid || !transition.achievementNode.isValid) {
            this._achievementTransition = null
            this._screenTransitioning = false
            return
        }

        transition.elapsed = Math.min(ACHIEVEMENT_TRANSITION_SECONDS, transition.elapsed + dt)
        const progress = transition.elapsed / ACHIEVEMENT_TRANSITION_SECONDS
        this._applyAchievementTransition(transition, this._easeInOut(progress))
        if (transition.elapsed < ACHIEVEMENT_TRANSITION_SECONDS) return

        this._finishAchievementTransition(transition)
    }

    private _applyAchievementTransition(transition: AchievementTransitionState, eased: number) {
        if (transition.mode === 'show') {
            transition.selectorNode.setPosition(0, this._lerp(0, ACHIEVEMENT_SELECTOR_HIDDEN_Y, eased), 0)
            transition.achievementNode.setPosition(0, this._lerp(ACHIEVEMENT_SCREEN_HIDDEN_Y, ACHIEVEMENT_SCREEN_SHOWN_Y, eased), 0)
        } else {
            transition.selectorNode.setPosition(0, this._lerp(ACHIEVEMENT_SELECTOR_HIDDEN_Y, 0, eased), 0)
            transition.achievementNode.setPosition(0, this._lerp(ACHIEVEMENT_SCREEN_SHOWN_Y, ACHIEVEMENT_SCREEN_HIDDEN_Y, eased), 0)
        }
    }

    private _finishAchievementTransition(transition: AchievementTransitionState) {
        this._applyAchievementTransition(transition, 1)
        this._achievementTransition = null
        if (transition.mode === 'hide') {
            if (transition.achievementNode.isValid) transition.achievementNode.destroy()
            if (this._achievementScreen === transition.achievementNode) this._achievementScreen = null
            this._selectorScreen?.setButtonsInteractable(true)
        }
        this._screenTransitioning = false
    }

    private _easeInOut(t: number) {
        return this._curveS(this._curveS(t))
    }

    private _curveS(t: number) {
        return 3 * t * t - 2 * t * t * t
    }

    private _lerp(start: number, end: number, t: number) {
        return start + (end - start) * t
    }

    showOptionsDialog(): OptionsDialog | null {
        const node = createUINode('OptionsDialog', { active: false, width: 423, height: 498 })
        const optionsDialog = node.addComponent(OptionsDialog)
        this._configureOptionsDialog(optionsDialog)
        optionsDialog.onClose = () => {
            this._commitOptionsDialogSettings(optionsDialog)
        }

        this.uiRoot!.addChild(node)
        node.active = true
        return optionsDialog
    }

    showGameOptionsDialog(gameScreen?: AdventureGameScreen): OptionsDialog | null {
        const node = createUINode('GameOptionsDialog', { active: false, width: 423, height: 498 })
        const optionsDialog = node.addComponent(OptionsDialog)
        optionsDialog.gameMenu = true
        optionsDialog.backButtonLabel = 'Back To Game'
        this._configureOptionsDialog(optionsDialog)
        optionsDialog.onClose = () => {
            this._commitOptionsDialogSettings(optionsDialog)
            gameScreen?.resumeGame()
        }
        optionsDialog.onRestartLevel = () => {
            void this.confirmRestartLevel().then((confirmed) => {
                if (!confirmed) return
                void SoundLoader.play(SoundEffect.ButtonClick)
                this._commitOptionsDialogSettings(optionsDialog)
                if (node.isValid) node.destroy()
                this.showAdventureGame()
            })
        }
        optionsDialog.onMainMenu = () => {
            void this.confirmBackToMainMenu().then((confirmed) => {
                if (!confirmed) return
                void SoundLoader.play(SoundEffect.ButtonClick)
                this._commitOptionsDialogSettings(optionsDialog)
                if (node.isValid) node.destroy()
                void this.showSelectorScreen()
            })
        }

        this.uiRoot!.addChild(node)
        node.active = true
        return optionsDialog
    }

    showPauseDialog(gameScreen?: AdventureGameScreen): PauseDialog | null {
        if (this._modalScreen?.isValid) return null

        const node = createUINode('PauseDialog', { active: false, width: 100, height: 100 })
        const pauseDialog = node.addComponent(PauseDialog)

        this.uiRoot!.addChild(node)
        node.active = true
        this._modalScreen = node

        void pauseDialog.waitForResult().then(() => {
            if (this._modalScreen === node) this._modalScreen = null
            gameScreen?.resumeGame()
        })
        return pauseDialog
    }

    showDebugCliDialog(initialCommand = ''): DebugCliDialog | null {
        if (this._debugCliScreen?.isValid) return null

        const gameScreenNode = this._adventureGameScreen?.node as Node | null | undefined
        const gameScreen = gameScreenNode?.isValid === true ? this._adventureGameScreen : null
        const wasGamePaused = gameScreen?.isPaused() ?? true
        if (gameScreen && !wasGamePaused) {
            gameScreen.pauseGame()
        }
        pushGlobalGamePause()

        const node = createUINode('DebugCliDialog', { active: false, width: 100, height: 100 })
        const dialog = node.addComponent(DebugCliDialog)
        let finalized = false
        let pendingCommandResult: ReturnType<typeof executeDebugCliCommand> | null = null
        const finalizeDebugCli = (commandResult: ReturnType<typeof executeDebugCliCommand> | null) => {
            if (finalized) return
            finalized = true

            if (this._debugCliScreen === node) this._debugCliScreen = null
            popGlobalGamePause()

            const commandAction = commandResult?.action ?? null
            if (commandResult && !commandResult.ok && commandResult.failure === 'condition') {
                this._showGlobalAdvice(commandResult.message)
            }
            if (commandAction === 'restart') {
                this.showAdventureGame(this._adventureLevel)
                return
            }
            if (commandAction === 'home') {
                void this.showSelectorScreen()
                return
            }
            if (commandAction === 'quit') {
                game.end()
                return
            }
            if (commandAction === 'help') {
                this.showHelpScreen()
                return
            }
            if (commandAction === 'store') {
                if (this._showStoreFromDebugCommand()) return
            }
            if (commandAction === 'almanac') {
                if (this._showAlmanacFromDebugCommand(gameScreen, !wasGamePaused)) return
            }
            if (commandAction === 'zenGarden') {
                if (this._showZenGardenFromDebugCommand()) return
            }
            if (commandAction === 'level' && commandResult?.levelId) {
                const level = this._findAdventureLevel(commandResult.levelId)
                if (level) this.showAdventureGame(level)
                return
            }

            const currentGameScreenNode = gameScreen?.node as Node | null | undefined
            if (currentGameScreenNode?.isValid && !wasGamePaused) {
                gameScreen.resumeGame()
            }
        }
        const isNavigationDebugCommand = (result: ReturnType<typeof executeDebugCliCommand>) =>
            result.action === 'restart' ||
            result.action === 'home' ||
            result.action === 'level' ||
            result.action === 'quit' ||
            result.action === 'help' ||
            result.action === 'store' ||
            result.action === 'almanac' ||
            result.action === 'zenGarden'
        dialog.initialCommand = initialCommand
        dialog.onCommand = (command) => {
            const currentGameScreenNode = gameScreen?.node as Node | null | undefined
            const activeGameScreen = currentGameScreenNode?.isValid === true ? gameScreen : null
            const result = executeDebugCliCommand(command, activeGameScreen)
            if (result.ok) {
                console.info(`[DebugCliDialog] ${result.message}`)
            } else {
                console.warn(`[DebugCliDialog] ${result.message}`)
            }
            if (result.ok || result.failure === 'condition') {
                pendingCommandResult = result
                if (!result.ok || !isNavigationDebugCommand(result)) {
                    this.scheduleOnce(() => finalizeDebugCli(result), 0)
                }
            }
            return result
        }

        this.uiRoot!.addChild(node)
        node.active = true
        this._debugCliScreen = node
        void SoundLoader.play(SoundEffect.GraveButton)

        void dialog.waitForResult().then(() => {
            const result = dialog.lastCommandResult ?? pendingCommandResult
            this.scheduleOnce(() => finalizeDebugCli(result), 0)
        })
        return dialog
    }

    showMessageBox(title: string, message: string): MessageBox | null {
        const node = createUINode('MessageBox', { active: false, width: 100, height: 100 })

        const messageBox = node.addComponent(MessageBox)
        messageBox.dialogWidth = 500
        messageBox.dialogHeight = 300
        messageBox.title = title
        messageBox.message = message
        messageBox.setButtonMode(DialogButtonMode.Footer, 'OK')

        this.uiRoot!.addChild(node)
        node.active = true
        return messageBox
    }

    showGameOverDialog(): MessageBox | null {
        if (this._modalScreen?.isValid) return null

        const node = createUINode('GameOverDialog', { active: false, width: 100, height: 100 })
        const dialog = node.addComponent(MessageBox)
        dialog.title = 'GAME OVER'
        dialog.message = ''
        dialog.contentInsetTopExtra = 15
        dialog.setButtonMode(DialogButtonMode.Footer, 'Try Again')
        dialog.onDragStateChange = (dragging) => {
            this._gameOverDialogDragging = dragging
            const button = this._gameOverMainMenuButton?.getComponent(UIButton)
            if (!button) return

            button.interactable = !dragging
        }

        this.uiRoot!.addChild(node)
        node.active = true
        this._modalScreen = node
        void this._createGameOverMainMenuButton()

        void dialog.waitForResult().then((result) => {
            if (this._modalScreen === node) this._modalScreen = null
            this._destroyGameOverMainMenuButton()
            if (result !== DialogResult.Footer && result !== DialogResult.Ok) return

            void SoundLoader.play(SoundEffect.ButtonClick)
            this.showAdventureGame()
        })
        return dialog
    }

    private async _createGameOverMainMenuButton() {
        this._destroyGameOverMainMenuButton()

        const [sprites, fonts] = await Promise.all([
            MessageBoxAssets.loadButtonSprites(),
            MessageBoxAssets.loadButtonFonts(),
        ])
        if (!sprites || !fonts || this._gameOverMainMenuButton?.isValid) return
        if (!this._modalScreen?.isValid || !this.uiRoot?.isValid) return

        const button = createStoneButton({
            name: 'GameOverMainMenuButton',
            parent: this.uiRoot,
            layer: this.uiRoot.layer,
            label: 'Main Menu',
            x: GAME_OVER_MAIN_MENU_X,
            y: GAME_OVER_MAIN_MENU_Y,
            width: GAME_OVER_MAIN_MENU_WIDTH,
            height: GAME_OVER_MAIN_MENU_HEIGHT,
            sprites,
            fonts: {
                normal: fonts.normal,
                highlight: fonts.highlight,
            },
            rightClickTriggers: true,
            onClick: () => {
                this._destroyGameOverMainMenuButton()
                this._modalScreen?.getComponent(MessageBox)?.close()
                this._modalScreen = null
                void SoundLoader.play(SoundEffect.ButtonClick)
                void this.showSelectorScreen()
            },
        })
        this._gameOverMainMenuButton = button
        const buttonState = button.getComponent(UIButton)
        if (buttonState) buttonState.interactable = !this._gameOverDialogDragging
    }

    private _destroyGameOverMainMenuButton() {
        if (this._gameOverMainMenuButton?.isValid) {
            this._gameOverMainMenuButton.destroy()
        }
        this._gameOverMainMenuButton = null
        this._gameOverDialogDragging = false
    }

    async showConfirmBox(title: string, message: string): Promise<boolean> {
        const dialog = this.showMessageBox(title, message)
        if (!dialog) return false
        dialog.setButtonMode(DialogButtonMode.YesNo)
        const result = await dialog.waitForResult()
        return result === DialogResult.Yes
    }

    async confirmQuit(): Promise<void> {
        const dialog = this.showMessageBox('Quit', 'Are you sure you wish to \nquit the game?')
        if (!dialog) return

        dialog.setMessageLayout(0, 0, 2)
        dialog.setButtonMode(DialogButtonMode.OkCancel, 'Quit', 'Cancel')
        const result = await dialog.waitForResult()
        if (result === DialogResult.Ok) {
            game.end()
        }
    }

    async confirmRestartLevel(): Promise<boolean> {
        const dialog = this.showMessageBox(
            'Restart Level?',
            'Do you want to try this level \nagain from the beginning?',
        )
        if (!dialog) return false

        dialog.setMessageLayout(0, 0, 2)
        dialog.setButtonMode(DialogButtonMode.OkCancel, 'RESTART', 'CANCEL')
        const result = await dialog.waitForResult()
        return result === DialogResult.Ok
    }

    async confirmBackToMainMenu(): Promise<boolean> {
        const dialog = this.showMessageBox(
            'Leave Game?',
            'Do you want to return\nto the main menu?\n\nYour game will be saved.',
        )
        if (!dialog) return false

        dialog.setMessageLayout(0, 0, 2)
        dialog.setButtonMode(DialogButtonMode.OkCancel, 'LEAVE', 'CANCEL')
        const result = await dialog.waitForResult()
        return result === DialogResult.Ok
    }

    private _setCurrentScreen(node: Node) {
        this._destroyCurrentScreen()
        this._currentScreen = node
        this.uiRoot!.addChild(node)
        node.active = true
    }

    private _destroyCurrentScreen() {
        if (this._achievementScreen?.isValid) {
            this._achievementScreen.destroy()
        }
        this._achievementScreen = null
        if (this._modalScreen?.isValid) {
            this._modalScreen.destroy()
        }
        this._modalScreen = null
        if (this._debugCliScreen?.isValid) {
            this._debugCliScreen.destroy()
        }
        this._debugCliScreen = null
        this._destroyGameOverMainMenuButton()
        this._screenTransitioning = false
        if (this._currentScreen?.isValid) {
            this._currentScreen.destroy()
        }
        this._currentScreen = null
        this._selectorScreen = null
        this._adventureGameScreen = null
    }

    private _onGlobalKeyDown(event: EventKeyboard) {
        if (event.keyCode !== DEBUG_CLI_KEY_CODE) return
        if (this._debugCliScreen?.isValid) return

        event.propagationStopped = true
        this.showDebugCliDialog('/')
    }

    private _showGlobalAdvice(message: string) {
        if (!this.uiRoot?.isValid) return

        if (!this._globalAdviceWidget?.node.isValid) {
            if (!this._globalAdviceLayer?.isValid) {
                this._globalAdviceLayer = createUINode('GlobalAdviceLayer', {
                    parent: this.uiRoot,
                    layer: this.uiRoot.layer,
                    anchorX: 0,
                    anchorY: 1,
                    width: 800,
                    height: 600,
                    x: -400,
                    y: 300,
                })
            }
            this._globalAdviceWidget = new AdviceWidget({
                parent: this._globalAdviceLayer,
                layer: this.uiRoot.layer,
                font: FontLoader.get('houseofterror28') ?? null,
            })
        }
        this._placeGlobalAdviceLayer()
        this._globalAdviceWidget.show(message, 'hint')
    }

    private _placeGlobalAdviceLayer() {
        if (!this.uiRoot?.isValid || !this._globalAdviceLayer?.isValid) return

        this._globalAdviceLayer.setSiblingIndex(this.uiRoot.children.length - 1)
    }

    private _advanceAdventureProgress(completedLevel: number) {
        const profile = this._profile ?? ProfileStore.loadCurrentProfile()
        this._profile = ProfileStore.advanceAdventureProgress(profile, completedLevel)
        return this._profile.adventureLevel
    }

    private _setProfileCoins(amount: number) {
        const profile = this._profile ?? ProfileStore.loadCurrentProfile()
        if (profile.coins === amount) return

        this._profile = ProfileStore.saveProfile({
            ...profile,
            coins: amount,
        })
    }

    private _applyPersistedSettings() {
        this._settings = GameSettingsStore.load()
        SoundLoader.setMusicVolume(this._settings.musicVolume)
        SoundLoader.setSfxVolume(this._settings.sfxVolume)
        void this._applyFullScreenPreference(this._settings.fullScreen)
    }

    private _configureOptionsDialog(optionsDialog: OptionsDialog) {
        optionsDialog.musicVolume = this._settings.musicVolume
        optionsDialog.sfxVolume = this._settings.sfxVolume
        optionsDialog.fullScreen = this._settings.fullScreen
        optionsDialog.onMusicVolumeChanged = (value) => {
            this._settings = GameSettingsStore.update({ musicVolume: value })
            SoundLoader.setMusicVolume(this._settings.musicVolume)
        }
        optionsDialog.onSfxVolumeChanged = (value) => {
            this._settings = GameSettingsStore.update({ sfxVolume: value })
            SoundLoader.setSfxVolume(this._settings.sfxVolume)
        }
        optionsDialog.onFullScreenChanged = (checked) => {
            optionsDialog.fullScreen = checked
        }
    }

    private _commitOptionsDialogSettings(optionsDialog: OptionsDialog) {
        const fullScreen = !!optionsDialog.fullScreen
        if (this._settings.fullScreen === fullScreen) return

        this._settings = GameSettingsStore.update({ fullScreen })
        void this._applyFullScreenPreference(fullScreen)
    }

    private async _applyFullScreenPreference(fullScreen: boolean) {
        if (!screen.supportsFullScreen) return

        try {
            if (fullScreen) {
                if (!screen.fullScreen()) await screen.requestFullScreen()
                return
            }

            if (screen.fullScreen()) await screen.exitFullScreen()
        } catch (error) {
            console.warn('[UIController] Failed to apply fullscreen preference', error)
        }
    }

    private _onFullScreenChanged() {
        const fullScreen = screen.fullScreen()
        if (this._settings.fullScreen === fullScreen) return

        this._settings = GameSettingsStore.update({ fullScreen })
    }

    private _showStoreFromDebugCommand() {
        if (this._selectorScreen?.node.isValid && this._currentScreen?.isValid) {
            return !!this.showStoreDialog()
        }

        return !!this.showStoreScreen()
    }

    private _showAlmanacFromDebugCommand(gameScreen?: AdventureGameScreen | null, resumeGameOnClose = false) {
        if (this._currentScreen?.isValid) {
            return !!this.showAlmanacDialog({
                onClose: () => {
                    if (resumeGameOnClose) gameScreen?.resumeGame()
                },
            })
        }

        return !!this.showAlmanacScreen()
    }

    private _showZenGardenFromDebugCommand() {
        return !!this.showZenGardenScreen()
    }

    private _getProfileAdventureLevel() {
        return this._resolveAdventureLevel(this._profile?.adventureLevel ?? 1)
    }

    private _canShowMinigames() {
        const profile = this._profile
        if (!profile) return false
        return profile.finishedAdventure > 0 || profile.hasUnlockedMinigames
    }

    private _canShowPuzzle() {
        const profile = this._profile
        if (!profile) return false
        return profile.finishedAdventure > 0 || profile.hasUnlockedPuzzleMode
    }

    private _canShowSurvival() {
        const profile = this._profile
        if (!profile) return false
        return profile.finishedAdventure > 0 || profile.hasUnlockedSurvivalMode
    }

    private _canShowAlmanac() {
        const profile = this._profile
        if (!profile) return false
        return profile.finishedAdventure > 0 || profile.adventureLevel >= 15
    }

    private _canShowStore() {
        const profile = this._profile
        if (!profile) return false
        return profile.finishedAdventure > 0 || profile.hasSeenUpsell || profile.adventureLevel >= 25
    }

    private _canShowZenGarden() {
        const profile = this._profile
        if (!profile) return false
        return profile.finishedAdventure > 0 || profile.adventureLevel >= 45
    }

    private async _showSelectorLockedDialog(title: string, message: string) {
        const dialog = this.showMessageBox(title, message)
        dialog?.setMessageLayout(277, 0, 2)
    }

    private _resolveAdventureLevel(progressLevel: number): LevelDefinition {
        const target = Math.max(1, Math.floor(progressLevel) || 1)
        let resolved = ADVENTURE_LEVELS[0]
        for (const level of ADVENTURE_LEVELS) {
            if (level.adventureLevel <= target) {
                resolved = level
            }
        }
        return resolved
    }

    private _nextAdventureLevel(): LevelDefinition {
        if (this._adventureLevel.id === 'adventure-1-1') return ADVENTURE_1_2
        if (this._adventureLevel.id === 'adventure-1-2') return ADVENTURE_1_3
        if (this._adventureLevel.id === 'adventure-1-3') return ADVENTURE_1_4
        if (this._adventureLevel.id === 'adventure-1-4') return ADVENTURE_1_5
        return this._adventureLevel
    }

    private _findAdventureLevel(levelId: LevelDefinition['id']) {
        return ADVENTURE_LEVELS.find((level) => level.id === levelId) ?? null
    }

    private _shouldStartDebugAdventure() {
        const locationLike = globalThis as typeof globalThis & {
            location?: { search?: string }
        }
        return locationLike.location?.search?.includes('game=adventure-1-1') === true
    }
}
