import {
    _decorator,
    BlockInputEvents,
    Component,
    EventKeyboard,
    EventTouch,
    game,
    Game,
    input,
    Input,
    Mask,
    Node,
    screen,
    sys,
    UITransform,
    UIOpacity,
} from 'cc'
import { DEBUG } from 'cc/env'
import { FontLoader } from '@/core/FontLoader'
import { LawnStringLoader } from '@/core/LawnStringLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import { AdventureGameScreen } from '@/game/GameScreen'
import { resetMoreSunTutorialState } from '@/game/GameSession'
import {
    ADVENTURE_1_1,
    ADVENTURE_1_2,
    ADVENTURE_1_3,
    ADVENTURE_1_4,
    ADVENTURE_1_5,
    ADVENTURE_LEVELS,
    DEBUG_LEVELS,
    GAME_TICK_SECONDS,
    getLevelIntroMusicTune,
    popGlobalGamePause,
    pushGlobalGamePause,
    scaleGameDeltaTime,
} from '@/game/GameDefinitions'
import { AdviceWidget } from '@/client/hud/advice/AdviceWidget'
import { AchievementScreen } from '../AchievementScreen'
import { AwardScreen } from '../AwardScreen'
import { AlmanacScreen } from '../AlmanacScreen/AlmanacScreen'
import { StoreScreen } from '../StoreScreen/StoreScreen'
import { NewUserDialog } from '../UserDialog/NewUserDialog'
import { UserDialog } from '../UserDialog/UserDialog'
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
import { StartupScreen } from '../StartupScreen/StartupScreen'
import { StartupResourceLoader } from '../StartupResourceLoader'
import { createStoneButton } from '../StoneButton'
import { createSpriteNode, createUINode } from '../UIFactory'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../MenuScreenBase'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { LevelAward, LevelDefinition, ZombieType } from '@/game/GameTypes'
import { MusicSystem, type MusicTuneId } from '@/client/music/MusicSystem'
import { AdventureProgressStore } from '@/game/persistence/AdventureProgressStore'
import { GameSettingsStore, type GameSettings } from '@/game/persistence/GameSettingsStore'
import { ProfileStore, type PlayerProfile } from '@/app/persistence/ProfileStore'
import { installPhase0PlatformProbe } from '@/platform/phase0/PlatformProbe'
import { loadInstalledMods } from '@/client/content/ModLoader'
import { installContentShowcaseProbe } from '@/client/showcase/ContentShowcase'
import {
    createIntegratedAdventure11Controller,
    installIntegratedAdventure11Probe,
    type IntegratedAdventure11Controller,
} from '@/app/IntegratedAdventure11Probe'

const { ccclass, property } = _decorator
const DEBUG_START_ADVENTURE_DIRECTLY = false
const DEBUG_CLI_KEY_CODE = 191
const ESCAPE_KEY_CODE = 27
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
const FULLSCREEN_ERROR_TITLE = 'Full Screen Unavailable'
const FULLSCREEN_LOCKED_TITLE = 'Full Screen Required'
const MOBILE_NATIVE_NO_WINDOWED_MESSAGE = 'Windowed mode is not available on mobile devices.'
const NO_FULLSCREEN_MESSAGE = 'This browser does not support full screen mode.'
const HARDWARE_ACCELERATION_LOCKED_TITLE = '3D Acceleration Required'
const HARDWARE_ACCELERATION_LOCKED_MESSAGE = '3D acceleration is required for this version.'
const MOBILE_DEBUG_CLI_CORNER_SIZE = 100
const MOBILE_DEBUG_CLI_DOUBLE_TAP_MS = 350
const MOBILE_TEXT_INPUT_DIALOG_OFFSET_Y = 150
const CONTINUE_GAME_RESULT_RESTART = 2001
const FINAL_ADVENTURE_GITHUB_RESULT = 2002
const PROJECT_GITHUB_URL = 'https://github.com/cheng1559/pvz-remake'

interface StoreScreenOptions {
    initialPage?: number
    backButtonLabel?: string
    onBack?: () => void
}

interface StoreDialogOptions {
    initialPage?: number
    backButtonLabel?: string
    onClose?: () => void
    useOverlayMusic?: boolean
}

interface AlmanacDialogOptions {
    onClose?: () => void
    initialZombieType?: ZombieType
}

interface DebugCliDialogOptions {
    offsetY?: number
}

interface AchievementTransitionState {
    mode: 'show' | 'hide'
    elapsed: number
    selectorNode: Node
    achievementNode: Node
}

interface AdventureLaunchOptions {
    skipSavedGamePrompt?: boolean
    forceNewGame?: boolean
}

@ccclass('UIController')
export class UIController extends Component {
    @property(Node)
    uiRoot: Node | null = null

    private _currentScreen: Node | null = null
    private _screenClipRoot: Node | null = null
    private _backgroundLeft: Node | null = null
    private _backgroundRight: Node | null = null
    private _startupScreen: Node | null = null
    private _selectorScreen: SelectorScreen | null = null
    private _adventureGameScreen: AdventureGameScreen | null = null
    private _integratedAdventure11: IntegratedAdventure11Controller | null = null
    private _achievementScreen: Node | null = null
    private _modalScreen: Node | null = null
    private _debugCliScreen: Node | null = null
    private _userSubDialog: Node | null = null
    private _optionsDialog: OptionsDialog | null = null
    private _globalAdviceLayer: Node | null = null
    private _globalAdviceWidget: AdviceWidget | null = null
    private _globalAdviceTick = 0
    private _settings: GameSettings = GameSettingsStore.load()
    private _profile: PlayerProfile | null = null
    private _adventureLevel: LevelDefinition = ADVENTURE_1_1
    private _gameOverMainMenuButton: Node | null = null
    private _lastMobileDebugCliTapTime = 0
    private _lastMobileDebugCliRawTapTime = 0
    private _lastMobileDebugCliRawTapId: number | null = null
    private _lastMobileDebugCliRawTapX = 0
    private _lastMobileDebugCliRawTapY = 0
    private _gameOverDialogDragging = false
    private _screenTransitioning = false
    private _achievementTransition: AchievementTransitionState | null = null
    private _bootstrapPromise: Promise<void> | null = null

    onLoad() {
        if (DEBUG) installPhase0PlatformProbe()

        if (!this.uiRoot) {
            this.uiRoot = this.node
        }
        this._integratedAdventure11 = createIntegratedAdventure11Controller(this.uiRoot, {
            onComplete: () => this._completeIntegratedAdventure11(),
            onGameOver: () => this._handleIntegratedAdventure11GameOver(),
        })
        if (DEBUG) {
            installContentShowcaseProbe(this.uiRoot)
            installIntegratedAdventure11Probe(this._integratedAdventure11)
        }

        this._profile = ProfileStore.loadCurrentProfile()
        resetMoreSunTutorialState()
        this._applyPersistedSettings()
        this._adventureLevel = this._getProfileAdventureLevel()
        this._configureFrameRate()
        screen.on(FULLSCREEN_CHANGE_EVENT, this._onFullScreenChanged, this)
        input.on(Input.EventType.KEY_DOWN, this._onGlobalKeyDown, this)
        input.on(Input.EventType.TOUCH_START, this._onGlobalTouchStart, this)
        game.on(Game.EVENT_HIDE, this._onGameHidden, this)
        void this._bootstrap()
    }

    onDestroy() {
        this._saveAdventureGame(this._adventureGameScreen)
        void this._integratedAdventure11?.saveIfRunning().catch((error) => {
            console.error('[UIController] Failed to save integrated Adventure 1-1', error)
        })
        screen.off(FULLSCREEN_CHANGE_EVENT, this._onFullScreenChanged, this)
        input.off(Input.EventType.KEY_DOWN, this._onGlobalKeyDown, this)
        input.off(Input.EventType.TOUCH_START, this._onGlobalTouchStart, this)
        game.off(Game.EVENT_HIDE, this._onGameHidden, this)
        MusicSystem.stop()
    }

    update(dt: number) {
        const scaledDt = scaleGameDeltaTime(dt)
        this._globalAdviceTick += scaledDt * 100
        this._globalAdviceWidget?.update(scaledDt * 100, this._globalAdviceTick)
        if (this._globalAdviceWidget?.node.active) this._placeGlobalAdviceLayer()
        this._updateAchievementTransition(scaledDt)
        if (this._currentScreen?.name !== 'AdventureGameScreen') {
            MusicSystem.update(scaledDt / GAME_TICK_SECONDS, { zombiesOnScreen: 0 })
        }
    }

    private _configureFrameRate() {
        if (game.frameRate < NATIVE_UNCAPPED_FRAME_RATE) {
            game.frameRate = NATIVE_UNCAPPED_FRAME_RATE
        }
    }

    private _bootstrap(): Promise<void> {
        return this._bootstrapPromise ??= this._runBootstrap().finally(() => {
            this._bootstrapPromise = null
        })
    }

    private async _runBootstrap() {
        try {
            await loadInstalledMods()
        } catch (error) {
            console.error('[UIController] Failed to load Mods', error)
            if (this.node.isValid) this.showMessageBox('Mod Load Failed', error instanceof Error ? error.message : String(error))
            return
        }
        if (!this.node.isValid) return
        const backgroundsReady = this._ensurePersistentWidescreenBackgrounds()
        await this._playStartupScreen()
        await backgroundsReady
        if (!this.node.isValid) return
        if (DEBUG_START_ADVENTURE_DIRECTLY && this._profile) {
            this.showAdventureGame()
            return
        }
        if (this._shouldStartDebugAdventure() && this._profile) {
            this.showAdventureGame()
            return
        }
        await this.showSelectorScreen()
    }

    private async _playStartupScreen() {
        const node = createUINode('StartupScreen', { active: false, width: 800, height: 600 })
        const startupScreen = node.addComponent(StartupScreen)
        this._startupScreen = node
        this.uiRoot!.addChild(node)
        node.active = true

        try {
            await startupScreen.play()
        } catch (error) {
            console.error('[UIController] Failed to play startup screen', error)
            await StartupResourceLoader.preloadStartup()
        } finally {
            if (this._startupScreen === node) this._startupScreen = null
            if (node.isValid) node.destroy()
        }
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
        selectorScreen.hasProfile = this._profile != null
        const playableAdventureLevel = this._getProfileAdventureLevel()
        this._adventureLevel = playableAdventureLevel
        selectorScreen.profileName = this._profile?.name ?? ''
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
            void this._showSelectorLockedDialog(
                name === 'miniGames'
                    ? 'MINIGAME_LOCKED_MESSAGE'
                    : name === 'Puzzle'
                        ? 'PUZZLE_LOCKED_MESSAGE'
                        : 'SURVIVAL_LOCKED_MESSAGE',
            )
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
        selectorScreen.onStartAdventureTransition = () => {
            MusicSystem.stop()
        }
        selectorScreen.onChangeUserRequest = () => {
            void this.showUserDialog()
        }
        selectorScreen.onCreateUserRequired = () => {
            if (!this._profile) {
                void this.showNewUserDialog()
            }
        }

        this._selectorScreen = null
        this._adventureGameScreen = null
        this._setCurrentScreen(node)
        this._selectorScreen = selectorScreen
        this._playInterfaceMusic('title_theme')
        return selectorScreen
    }

    showAdventureGame(
        level: LevelDefinition = this._adventureLevel,
        options: AdventureLaunchOptions = {},
    ): AdventureGameScreen | null {
        if (!this._profile) {
            void this._requireProfileBeforePlaying()
            return null
        }

        if (level.id === ADVENTURE_1_1.id) {
            this._adventureLevel = level
            void this._showIntegratedAdventure11(options)
            return null
        }

        const savedSnapshot = options.forceNewGame ? null : this._loadAdventureSnapshot(level)
        this._adventureLevel = level
        this._selectorScreen = null
        const node = createUINode('AdventureGameScreen', { active: false, width: 800, height: 600 })
        node.addComponent(BlockInputEvents)
        const gameScreen = node.addComponent(AdventureGameScreen)
        gameScreen.levelDefinition = level
        gameScreen.firstTimeAdventure = (this._profile?.finishedAdventure ?? 0) <= 0
        gameScreen.initialMoney = this._profile?.coins ?? 0
        gameScreen.initialSnapshot = savedSnapshot
        if (savedSnapshot && !options.skipSavedGamePrompt) {
            gameScreen.onReady = () => {
                if (!gameScreen.node?.isValid) return
                gameScreen.pauseGame()
                void this.showContinueGameDialog(gameScreen)
            }
        }
        gameScreen.onBackToMenu = () => {
            this._saveAdventureGame(gameScreen)
            void this.showSelectorScreen()
        }
        gameScreen.onMenuRequest = () => {
            this.showGameOptionsDialog(gameScreen)
        }
        gameScreen.onPauseRequest = () => {
            this.showPauseDialog(gameScreen)
        }
        gameScreen.onAlmanacRequest = (zombieType) => {
            if (!this._canShowAlmanac()) return
            gameScreen.pauseGame()
            this.showAlmanacDialog({
                initialZombieType: zombieType,
                onClose: () => gameScreen.resumeGame(),
            })
        }
        gameScreen.onSeedChooserWarningRequest = (warningKey, continueStart) => {
            void this.confirmSeedChooserWarning(warningKey).then((confirmed) => {
                if (confirmed) continueStart()
            })
        }
        gameScreen.onGameOverRequest = () => {
            this._deleteAdventureSave()
            void this.showGameOverDialog()
        }
        gameScreen.onAwardScreenRequest = (award) => {
            this._deleteAdventureSave()
            const profileAdventureLevel = this._advanceAdventureProgress(gameScreen.levelDefinition.adventureLevel)
            this.showAwardScreen(award, profileAdventureLevel)
        }
        gameScreen.onMoneyChanged = (amount) => {
            this._setProfileCoins(amount)
        }

        const previousScreen = this._currentScreen?.isValid ? this._currentScreen : null
        const onReady = gameScreen.onReady
        const introMusic = getLevelIntroMusicTune(level)
        gameScreen.onReady = () => {
            if (previousScreen?.isValid) previousScreen.destroy()
            if (savedSnapshot?.state.music === undefined) {
                if (introMusic) this._playInterfaceMusic(introMusic, true)
                else MusicSystem.stop()
            }
            onReady?.()
        }
        this._setCurrentScreen(node, { keepPreviousScreen: true })
        this._adventureGameScreen = gameScreen
        return gameScreen
    }

    private async _showIntegratedAdventure11(options: AdventureLaunchOptions) {
        const controller = this._integratedAdventure11
        if (!controller) return

        try {
            const root = await controller.play({ forceNewGame: options.forceNewGame })
            if (!this.node.isValid || !root.isValid) return
            this._selectorScreen = null
            this._adventureGameScreen = null
            if (this._currentScreen !== root) this._setCurrentScreen(root)
            void this._createIntegratedAdventure11MenuButton(root)
        } catch (error) {
            console.error('[UIController] Failed to start integrated Adventure 1-1', error)
            if (this.node.isValid) {
                this.showMessageBox(
                    'Adventure 1-1 Load Failed',
                    error instanceof Error ? error.message : String(error),
                )
            }
        }
    }

    private async _createIntegratedAdventure11MenuButton(root: Node) {
        const layout = root.getChildByName('adventure11') ?? root.children[0]
        const hud = layout?.getChildByName('HUD')
        if (!hud || hud.getChildByName('MenuButton')) return
        const [sprites, fonts, strings] = await Promise.all([
            MessageBoxAssets.loadButtonSprites(),
            MessageBoxAssets.loadButtonFonts(),
            LawnStringLoader.load(),
        ])
        if (!sprites || !root.isValid || !hud.isValid || this._currentScreen !== root) return

        createStoneButton({
            name: 'MenuButton',
            parent: hud,
            layer: root.layer,
            label: this._lawnString(strings, 'MENU_BUTTON', 'Menu'),
            x: 681,
            y: 10,
            width: 117,
            height: 46,
            sprites,
            fonts,
            rightClickTriggers: false,
            onClick: () => {
                this._integratedAdventure11?.pause()
                void SoundLoader.play(SoundEffect.Pause)
                this._showIntegratedAdventure11OptionsDialog()
            },
        })
    }

    private _showIntegratedAdventure11OptionsDialog(): OptionsDialog | null {
        const controller = this._integratedAdventure11
        if (!controller?.isRunning()) return null
        const activeOptionsDialog = this._activeOptionsDialog()
        if (activeOptionsDialog) return activeOptionsDialog

        controller.pause()
        void controller.saveIfRunning().catch((error) => {
            console.error('[UIController] Failed to save integrated Adventure 1-1', error)
        })
        const node = createUINode('GameOptionsDialog', { active: false, width: 423, height: 498 })
        const optionsDialog = node.addComponent(OptionsDialog)
        this._optionsDialog = optionsDialog
        optionsDialog.gameMenu = true
        optionsDialog.showRestartLevel = true
        optionsDialog.backButtonLabel = '[BACK_TO_GAME]'
        this._configureOptionsDialog(optionsDialog)
        optionsDialog.onClose = () => {
            this._commitOptionsDialogSettings(optionsDialog)
            if (this._optionsDialog === optionsDialog) this._optionsDialog = null
            controller.resume()
        }
        optionsDialog.onRestartLevel = () => {
            void this.confirmRestartLevel().then((confirmed) => {
                if (!confirmed) return
                void SoundLoader.play(SoundEffect.ButtonClick)
                controller.deleteSave()
                this._commitOptionsDialogSettings(optionsDialog)
                if (this._optionsDialog === optionsDialog) this._optionsDialog = null
                if (node.isValid) node.destroy()
                this.showAdventureGame(ADVENTURE_1_1, { forceNewGame: true, skipSavedGamePrompt: true })
            })
        }
        optionsDialog.onMainMenu = () => {
            void this.confirmBackToMainMenu().then(async (confirmed) => {
                if (!confirmed) return
                try {
                    await controller.save()
                } catch (error) {
                    console.error('[UIController] Failed to save integrated Adventure 1-1', error)
                    this.showMessageBox('Save Failed', error instanceof Error ? error.message : String(error))
                    return
                }
                void SoundLoader.play(SoundEffect.ButtonClick)
                this._commitOptionsDialogSettings(optionsDialog)
                if (this._optionsDialog === optionsDialog) this._optionsDialog = null
                if (node.isValid) node.destroy()
                void this.showSelectorScreen()
            })
        }

        this._addToScreenClipRoot(node)
        node.active = true
        return optionsDialog
    }

    private _completeIntegratedAdventure11() {
        this._integratedAdventure11?.deleteSave()
        const adventureLevel = this._advanceAdventureProgress(ADVENTURE_1_1.adventureLevel)
        this.showAwardScreen({ kind: 'seed', seedType: 'sunflower' }, adventureLevel)
    }

    private _handleIntegratedAdventure11GameOver() {
        this._integratedAdventure11?.deleteSave()
        void this.showGameOverDialog()
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
        let finalAdventureDialogQueued = false
        const showSelectorAfterFinalAdventure = () => {
            if (finalAdventureDialogQueued) return
            finalAdventureDialogQueued = true
            void this.showSelectorScreen().then((selectorScreen) => {
                if (!selectorScreen) return
                const dialog = this.showMessageBox(
                    'Thanks for Playing!',
                    'More levels are in development.\nFollow cheng1559/pvz-remake on GitHub for future updates.',
                )
                dialog?.setButtons([
                    {
                        label: 'GitHub',
                        result: FINAL_ADVENTURE_GITHUB_RESULT,
                        localize: false,
                        finishOnClick: false,
                        onClick: () => sys.openURL(PROJECT_GITHUB_URL),
                    },
                    {
                        label: 'OK',
                        result: DialogResult.Ok,
                    },
                ])
            })
        }
        awardScreen.onNextLevelRequest = () => {
            const nextLevel = this._nextAdventureLevel()
            if (nextLevel.id === this._adventureLevel.id) {
                showSelectorAfterFinalAdventure()
                return
            }
            this.showAdventureGame(nextLevel, { forceNewGame: true, skipSavedGamePrompt: true })
        }
        awardScreen.onBackToMenu = () => {
            if (this._nextAdventureLevel().id === this._adventureLevel.id) {
                showSelectorAfterFinalAdventure()
                return
            }
            void this.showSelectorScreen()
        }

        void awardScreen.ensureRendered().then(() => {
            if (!node.isValid) return
            this._selectorScreen = null
            this._adventureGameScreen = null
            this._setCurrentScreen(node)
            this._playInterfaceMusic('zen_garden')
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
            MusicSystem.stop()
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
            this._playInterfaceMusic('choose_seeds')
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
        challengeScreen.onChallengeSelected = (challengeName) => {
            if (challengeName === 'Wall-nut Bowling') {
                this.showAdventureGame(ADVENTURE_1_5, { forceNewGame: true, skipSavedGamePrompt: true })
            }
        }

        void challengeScreen.ensureRendered().then(() => {
            if (!node.isValid) return
            this._selectorScreen = null
            this._adventureGameScreen = null
            this._setCurrentScreen(node)
            this._playInterfaceMusic('choose_seeds')
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
            this.showStoreDialog({
                initialPage: 2,
                backButtonLabel: 'GO BACK',
            })
        }

        void zenGardenScreen.ensureRendered().then(() => {
            if (!node.isValid) return
            this._selectorScreen = null
            this._adventureGameScreen = null
            this._setCurrentScreen(node)
            this._playInterfaceMusic('zen_garden')
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
            this._playInterfaceMusic('title_theme')
        }).catch((error) => {
            console.error('[UIController] Failed to prepare StoreScreen', error)
            if (node.isValid) node.destroy()
        })
        return storeScreen
    }

    showStoreDialog(options: StoreDialogOptions = {}): StoreScreen | null {
        if (
            this._screenTransitioning ||
            this._modalScreen?.isValid ||
            !this._currentScreen?.isValid
        ) {
            return null
        }

        const node = createUINode('StoreDialog', { active: false, width: SCREEN_WIDTH, height: SCREEN_HEIGHT })
        node.addComponent(BlockInputEvents)
        const storeScreen = node.addComponent(StoreScreen)
        storeScreen.initialPage = options.initialPage ?? 0
        storeScreen.backButtonLabel = options.backButtonLabel ?? 'MAIN MENU'
        storeScreen.onBackToMenu = () => {
            this.hideModalScreen()
            options.onClose?.()
        }

        this._addToScreenClipRoot(node)
        this._modalScreen = node
        this._selectorScreen?.setButtonsInteractable(false)
        void storeScreen.ensureRendered().then(() => {
            if (!node.isValid || this._modalScreen !== node) return
            node.active = true
            if (options.useOverlayMusic) {
                void MusicSystem.playOverlayTune('title_theme')
            } else {
                this._playInterfaceMusic('title_theme')
            }
        }).catch((error) => {
            console.error('[UIController] Failed to prepare StoreDialog', error)
            if (this._modalScreen === node) {
                this._modalScreen = null
                this._selectorScreen?.setButtonsInteractable(true)
                this._restoreCurrentScreenMusic()
            }
            if (node.isValid) node.destroy()
        })
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

        const node = createUINode('AlmanacDialog', { active: false, width: SCREEN_WIDTH, height: SCREEN_HEIGHT })
        const almanacScreen = node.addComponent(AlmanacScreen)
        if (options.initialZombieType) almanacScreen.openZombieType(options.initialZombieType)
        almanacScreen.onBackToMenu = () => {
            this.hideModalScreen()
            options.onClose?.()
        }

        this._addToScreenClipRoot(node)
        node.active = true
        this._modalScreen = node
        this._selectorScreen?.setButtonsInteractable(false)
        if (this._currentScreen?.name !== 'AdventureGameScreen') {
            this._playInterfaceMusic('choose_seeds')
        }
        return almanacScreen
    }

    hideModalScreen() {
        if (!this._modalScreen?.isValid) return

        const dialogNode = this._modalScreen
        this._modalScreen = null
        dialogNode.destroy()
        this._selectorScreen?.setButtonsInteractable(true)
        this._restoreCurrentScreenMusic()
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

        const node = createUINode('AchievementScreen', { active: false, width: SCREEN_WIDTH, height: SCREEN_HEIGHT })
        const achievementScreen = node.addComponent(AchievementScreen)
        achievementScreen.earnedAchievements = this._profile?.earnedAchievements ?? []
        achievementScreen.onBackToMenu = () => {
            this.hideAchievementScreen()
        }

        this._addToScreenClipRoot(node)
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
        const activeOptionsDialog = this._activeOptionsDialog()
        if (activeOptionsDialog) return activeOptionsDialog

        const node = createUINode('OptionsDialog', { active: false, width: 423, height: 498 })
        const optionsDialog = node.addComponent(OptionsDialog)
        this._optionsDialog = optionsDialog
        this._configureOptionsDialog(optionsDialog)
        optionsDialog.onClose = () => {
            this._commitOptionsDialogSettings(optionsDialog)
            if (this._optionsDialog === optionsDialog) this._optionsDialog = null
        }

        this._addToScreenClipRoot(node)
        node.active = true
        return optionsDialog
    }

    showGameOptionsDialog(gameScreen?: AdventureGameScreen): OptionsDialog | null {
        const activeOptionsDialog = this._activeOptionsDialog()
        if (activeOptionsDialog) return activeOptionsDialog

        const node = createUINode('GameOptionsDialog', { active: false, width: 423, height: 498 })
        const optionsDialog = node.addComponent(OptionsDialog)
        this._optionsDialog = optionsDialog
        const choosingSeeds = gameScreen?.isChoosingSeeds() === true
        const shouldResumeGame = gameScreen?.isPaused() === true
        optionsDialog.gameMenu = true
        optionsDialog.showRestartLevel = !choosingSeeds
        optionsDialog.backButtonLabel = '[BACK_TO_GAME]'
        this._configureOptionsDialog(optionsDialog)
        optionsDialog.onClose = () => {
            this._commitOptionsDialogSettings(optionsDialog)
            if (this._optionsDialog === optionsDialog) this._optionsDialog = null
            if (shouldResumeGame) gameScreen?.resumeGame({ resumeMusic: !choosingSeeds })
        }
        optionsDialog.onRestartLevel = () => {
            void this.confirmRestartLevel().then((confirmed) => {
                if (!confirmed) return
                void SoundLoader.play(SoundEffect.ButtonClick)
                this._deleteAdventureSave()
                this._commitOptionsDialogSettings(optionsDialog)
                if (this._optionsDialog === optionsDialog) this._optionsDialog = null
                if (node.isValid) node.destroy()
                this.showAdventureGame(undefined, { forceNewGame: true, skipSavedGamePrompt: true })
            })
        }
        optionsDialog.onMainMenu = () => {
            if (choosingSeeds) {
                void SoundLoader.play(SoundEffect.ButtonClick)
                this._commitOptionsDialogSettings(optionsDialog)
                if (this._optionsDialog === optionsDialog) this._optionsDialog = null
                if (node.isValid) node.destroy()
                void this.showSelectorScreen()
                return
            }
            void this.confirmBackToMainMenu().then((confirmed) => {
                if (!confirmed) return
                void SoundLoader.play(SoundEffect.ButtonClick)
                this._saveAdventureGame(gameScreen)
                this._commitOptionsDialogSettings(optionsDialog)
                if (this._optionsDialog === optionsDialog) this._optionsDialog = null
                if (node.isValid) node.destroy()
                void this.showSelectorScreen()
            })
        }

        this._addToScreenClipRoot(node)
        node.active = true
        return optionsDialog
    }

    private _activeOptionsDialog() {
        if (this._optionsDialog?.node?.isValid) return this._optionsDialog
        this._optionsDialog = null
        return null
    }

    showPauseDialog(gameScreen?: AdventureGameScreen): PauseDialog | null {
        if (this._modalScreen?.isValid) return null

        const choosingSeeds = gameScreen?.isChoosingSeeds() === true
        const shouldResumeGame = gameScreen?.isPaused() === true
        if (!choosingSeeds) this._saveAdventureGame(gameScreen)
        const node = createUINode('PauseDialog', { active: false, width: 100, height: 100 })
        const pauseDialog = node.addComponent(PauseDialog)

        this._addToScreenClipRoot(node)
        node.active = true
        this._modalScreen = node

        void pauseDialog.waitForResult().then(() => {
            if (this._modalScreen === node) this._modalScreen = null
            if (shouldResumeGame) gameScreen?.resumeGame({ resumeMusic: !choosingSeeds })
        })
        return pauseDialog
    }

    showDebugCliDialog(initialCommand = '', options: DebugCliDialogOptions = {}): DebugCliDialog | null {
        if (this._debugCliScreen?.isValid) return null
        if (this._isStartupScreenActive()) return null

        const gameScreenNode = this._adventureGameScreen?.node as Node | null | undefined
        const gameScreen = gameScreenNode?.isValid === true ? this._adventureGameScreen : null
        const wasGamePaused = gameScreen?.isPaused() ?? true
        if (gameScreen && !wasGamePaused) {
            gameScreen.pauseGame()
        }
        pushGlobalGamePause()

        const helpScreen = this._currentScreen?.getComponent(HelpScreen) ?? null
        const previousHelpKeyboardExitEnabled = helpScreen?.keyboardExitEnabled ?? true
        if (helpScreen) helpScreen.keyboardExitEnabled = false

        const node = createUINode('DebugCliDialog', { active: false, width: 100, height: 100 })
        if (options.offsetY) node.setPosition(0, options.offsetY, 0)
        const dialog = node.addComponent(DebugCliDialog)
        let finalized = false
        let pendingCommandResult: ReturnType<typeof executeDebugCliCommand> | null = null
        const finalizeDebugCli = (commandResult: ReturnType<typeof executeDebugCliCommand> | null) => {
            if (finalized) return
            finalized = true

            if (this._debugCliScreen === node) this._debugCliScreen = null
            popGlobalGamePause()
            if (helpScreen?.node?.isValid) {
                helpScreen.keyboardExitEnabled = previousHelpKeyboardExitEnabled
            }

            const commandAction = commandResult?.action ?? null
            if (commandResult && !commandResult.ok && commandResult.failure === 'condition') {
                this._showGlobalAdvice(commandResult.message)
            }
            if (commandAction === 'restart') {
                this._deleteAdventureSave()
                this.showAdventureGame(this._adventureLevel, { forceNewGame: true, skipSavedGamePrompt: true })
                return
            }
            if (commandAction === 'reload') {
                void this._reloadGame()
                return
            }
            if (commandAction === 'home') {
                this._saveAdventureGame(gameScreen)
                void this.showSelectorScreen()
                return
            }
            if (commandAction === 'quit') {
                this._quitGame()
                return
            }
            if (commandAction === 'help') {
                this.showHelpScreen()
                return
            }
            if (commandAction === 'menu') {
                if (gameScreen?.node?.isValid) {
                    this.showGameOptionsDialog(gameScreen)
                } else {
                    this.showOptionsDialog()
                }
                return
            }
            if (commandAction === 'store') {
                if (this._showStoreFromDebugCommand(gameScreen, !wasGamePaused)) return
            }
            if (commandAction === 'almanac') {
                if (this._showAlmanacFromDebugCommand(gameScreen, !wasGamePaused)) return
            }
            if (commandAction === 'zenGarden') {
                if (this._showZenGardenFromDebugCommand()) return
            }
            if (commandAction === 'level' && commandResult?.levelId) {
                const level = this._findAdventureLevel(commandResult.levelId)
                if (level) {
                    if (!this._isDebugLevel(level)) {
                        this._setAdventureProgress(level.adventureLevel)
                        this._deleteAdventureSave()
                    }
                    this.showAdventureGame(level, { forceNewGame: true, skipSavedGamePrompt: true })
                }
                return
            }

            const currentGameScreenNode = gameScreen?.node as Node | null | undefined
            if (currentGameScreenNode?.isValid && !wasGamePaused) {
                gameScreen.resumeGame()
            }
        }
        const isNavigationDebugCommand = (result: ReturnType<typeof executeDebugCliCommand>) =>
            result.action === 'restart' ||
            result.action === 'reload' ||
            result.action === 'home' ||
            result.action === 'level' ||
            result.action === 'quit' ||
            result.action === 'help' ||
            result.action === 'menu' ||
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
                if (result.settingsChanged) this._reloadPersistedSettings()
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

        this._addToScreenClipRoot(node)
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

        this._addToScreenClipRoot(node)
        node.active = true
        return messageBox
    }

    async showUserDialog(): Promise<UserDialog | null> {
        const strings = await LawnStringLoader.load()
        if (!this._currentScreen?.isValid) return null

        const node = createUINode('UserDialog', { active: false, width: 100, height: 100 })
        const dialog = node.addComponent(UserDialog)
        dialog.configure({
            profiles: ProfileStore.loadProfiles(),
            currentProfileId: this._profile?.id ?? null,
            strings: {
                title: this._lawnString(strings, 'WHO_ARE_YOU', 'WHO ARE YOU?'),
                createNewUser: this._lawnString(strings, 'CREATE_NEW_USER', '(Create a New User)'),
                rename: this._lawnString(strings, 'RENAME_BUTTON', 'Rename'),
                delete: this._lawnString(strings, 'DELETE_BUTTON', 'Delete'),
                ok: this._lawnString(strings, 'BUTTON_OK', 'Ok'),
                cancel: this._lawnString(strings, 'BUTTON_CANCEL', 'Cancel'),
            },
        })
        dialog.onCreateUserRequest = () => {
            void this.showNewUserDialog(dialog)
        }
        dialog.onRenameUserRequest = (name) => {
            void this.showRenameUserDialog(dialog, name)
        }
        dialog.onDeleteUserRequest = (name) => {
            void this.showConfirmDeleteUserDialog(dialog, name)
        }
        dialog.onSelectUserRequest = (name) => {
            this._runWithSwitchUserLoading(() => {
                const profile = ProfileStore.loadProfileByName(name)
                if (profile) this._setCurrentProfile(profile)
                dialog.close()
            })
        }

        this._addToScreenClipRoot(node)
        node.active = true
        return dialog
    }

    async showNewUserDialog(userDialog: UserDialog | null = null): Promise<NewUserDialog | null> {
        const strings = await LawnStringLoader.load()
        if (userDialog && !userDialog.node?.isValid) return null
        if (!userDialog && !this._currentScreen?.isValid) return null
        if (this._userSubDialog?.isValid) return this._userSubDialog.getComponent(NewUserDialog)

        const node = createUINode('NewUserDialog', { active: false, width: 100, height: 100 })
        if (GameDebugSettings.isMobileMode()) node.setPosition(0, MOBILE_TEXT_INPUT_DIALOG_OFFSET_Y, 0)
        const dialog = node.addComponent(NewUserDialog)
        dialog.configure({
            mode: 'new',
            strings: {
                title: this._lawnString(strings, 'NEW_USER', 'NEW USER'),
                prompt: this._lawnString(strings, 'PLEASE_ENTER_NAME', 'Please enter your name:'),
                ok: this._lawnString(strings, 'BUTTON_OK', 'Ok'),
                cancel: this._lawnString(strings, 'BUTTON_CANCEL', 'Cancel'),
            },
        })
        dialog.requireNameBeforeCancel = !this._profile
        dialog.onEmptyName = () => {
            void this.showEnterYourNameDialog(dialog)
        }
        dialog.onSubmitName = (name) => {
            this._runWithSwitchUserLoading(() => {
                const profile = ProfileStore.createProfile(name)
                if (!profile) {
                    void this.showNameConflictDialog(dialog)
                    return
                }

                this._setCurrentProfile(profile)
                dialog.finishInputDialog()
                if (userDialog?.node?.isValid) userDialog.close()
                if (!userDialog) this._selectorScreen?.showProfileSign()
            })
        }

        this._addToScreenClipRoot(node)
        node.active = true
        this._userSubDialog = node
        void dialog.waitForResult().then(() => {
            if (this._userSubDialog === node) this._userSubDialog = null
        })
        return dialog
    }

    async showRenameUserDialog(userDialog: UserDialog, name: string): Promise<NewUserDialog | null> {
        const strings = await LawnStringLoader.load()
        if (!userDialog.node?.isValid) return null
        if (this._userSubDialog?.isValid) return this._userSubDialog.getComponent(NewUserDialog)

        const node = createUINode('RenameUserDialog', { active: false, width: 100, height: 100 })
        if (GameDebugSettings.isMobileMode()) node.setPosition(0, MOBILE_TEXT_INPUT_DIALOG_OFFSET_Y, 0)
        const dialog = node.addComponent(NewUserDialog)
        dialog.configure({
            mode: 'rename',
            initialName: name,
            strings: {
                title: this._lawnString(strings, 'RENAME_USER', 'RENAME USER'),
                prompt: this._lawnString(strings, 'PLEASE_ENTER_NAME', 'Please enter your name:'),
                ok: this._lawnString(strings, 'BUTTON_OK', 'Ok'),
                cancel: this._lawnString(strings, 'BUTTON_CANCEL', 'Cancel'),
            },
        })
        dialog.onSubmitName = (newName) => {
            const renamingCurrent = this._sameProfileName(this._profile?.name ?? '', name)
            if (!ProfileStore.renameProfile(name, newName)) {
                void this.showNameConflictDialog(dialog)
                return
            }

            if (renamingCurrent) {
                const profile = ProfileStore.loadProfileByName(newName)
                if (profile) this._setCurrentProfile(profile)
            }
            userDialog.finishRenameUser(newName)
            dialog.finishInputDialog()
        }

        this._addToScreenClipRoot(node)
        node.active = true
        this._userSubDialog = node
        void dialog.waitForResult().then(() => {
            if (this._userSubDialog === node) this._userSubDialog = null
        })
        return dialog
    }

    async showConfirmDeleteUserDialog(userDialog: UserDialog, name: string): Promise<MessageBox | null> {
        const strings = await LawnStringLoader.load()
        if (!userDialog.node?.isValid) return null
        if (this._userSubDialog?.isValid) return this._userSubDialog.getComponent(MessageBox)

        const warning = this._lawnString(
            strings,
            'DELETE_USER_WARNING',
            "This will permanently remove '%s' from the player roster!",
        ).replace('%s', name)
        const dialog = this.showMessageBox(
            this._lawnString(strings, 'ARE_YOU_SURE', 'Are You Sure?'),
            warning,
        )
        if (!dialog) return null
        this._userSubDialog = dialog.node

        dialog.setButtons([
            {
                label: this._lawnString(strings, 'BUTTON_YES', 'Yes'),
                result: DialogResult.Yes,
                localize: false,
            },
            {
                label: this._lawnString(strings, 'BUTTON_NO', 'No'),
                result: DialogResult.No,
                localize: false,
            },
        ])
        void dialog.waitForResult().then((result) => {
            if (this._userSubDialog === dialog.node) this._userSubDialog = null
            if (result === DialogResult.Yes && userDialog.node?.isValid) {
                this._runWithSwitchUserLoading(() => {
                    const deletingCurrent = this._sameProfileName(this._profile?.name ?? '', name)
                    if (!ProfileStore.deleteProfile(name)) return

                    userDialog.finishDeleteUser()
                    if (deletingCurrent) {
                        const selectedName = userDialog.selectedName()
                        const nextProfile = selectedName
                            ? ProfileStore.loadProfileByName(selectedName)
                            : ProfileStore.getAnyProfile()
                        this._setCurrentProfile(nextProfile)
                    } else {
                        this._syncSelectorProfile()
                    }
                    if (!this._profile || !userDialog.selectedName()) {
                        void this.showNewUserDialog(userDialog)
                    }
                })
            }
        })
        return dialog
    }

    async showEnterYourNameDialog(nameDialog: NewUserDialog): Promise<MessageBox | null> {
        const strings = await LawnStringLoader.load()
        if (!nameDialog.node?.isValid) return null
        if (this._userSubDialog?.isValid && this._userSubDialog !== nameDialog.node) {
            return this._userSubDialog.getComponent(MessageBox)
        }

        const dialog = this.showMessageBox(
            this._lawnString(strings, 'ENTER_YOUR_NAME', 'Enter Your Name'),
            this._lawnString(
                strings,
                'USER_ERROR_MESSAGE',
                'Please enter your name to create a new user profile for storing high score data and game progress.',
            ),
        )
        if (!dialog) return null
        this._userSubDialog = dialog.node

        dialog.setButtonMode(DialogButtonMode.Footer, this._lawnString(strings, 'DIALOG_BUTTON_OK', 'OK'))
        void dialog.waitForResult().then(() => {
            if (this._userSubDialog === dialog.node) this._userSubDialog = null
            if (nameDialog.node?.isValid) nameDialog.requestInputFocus()
        })
        return dialog
    }

    async showNameConflictDialog(nameDialog: NewUserDialog): Promise<MessageBox | null> {
        const strings = await LawnStringLoader.load()
        if (!nameDialog.node?.isValid) return null
        if (this._userSubDialog?.isValid && this._userSubDialog !== nameDialog.node) {
            return this._userSubDialog.getComponent(MessageBox)
        }

        const dialog = this.showMessageBox(
            this._lawnString(strings, 'NAME_CONFLICT', 'Name Conflict'),
            this._lawnString(
                strings,
                'ENTER_UNIQUE_PLAYER_NAME',
                'The name you entered is already being used.  Please enter a unique player name.',
            ),
        )
        if (!dialog) return null
        this._userSubDialog = dialog.node

        dialog.setButtonMode(DialogButtonMode.Footer, this._lawnString(strings, 'DIALOG_BUTTON_OK', 'OK'))
        void dialog.waitForResult().then(() => {
            if (this._userSubDialog === dialog.node) this._userSubDialog = null
            if (nameDialog.node?.isValid) nameDialog.requestInputFocus()
        })
        return dialog
    }

    showSwitchUserLoadingDialog(): MessageBox | null {
        if (!this._currentScreen?.isValid) return null

        const node = createUINode('SwitchUserLoadingDialog', { active: false, width: 100, height: 100 })
        const dialog = node.addComponent(MessageBox)
        dialog.title = 'Loading...'
        dialog.message = ''
        dialog.setButtonMode(DialogButtonMode.None)

        this._addToScreenClipRoot(node)
        node.active = true
        return dialog
    }

    private _runWithSwitchUserLoading<T>(operation: () => T): T {
        const loadingDialog = this.showSwitchUserLoadingDialog()
        try {
            return operation()
        } finally {
            if (loadingDialog?.node?.isValid) loadingDialog.node.destroy()
        }
    }

    async showGameOverDialog(): Promise<MessageBox | null> {
        if (this._modalScreen?.isValid) return null
        const strings = await LawnStringLoader.load()
        if (this._modalScreen?.isValid) return null

        const node = createUINode('GameOverDialog', { active: false, width: 100, height: 100 })
        const dialog = node.addComponent(MessageBox)
        dialog.title = this._lawnString(strings, 'GAME_OVER', 'GAME OVER')
        dialog.message = ''
        dialog.contentInsetTopExtra = 15
        dialog.setButtonMode(DialogButtonMode.Footer, this._lawnString(strings, 'TRY_AGAIN', 'Try Again'))
        dialog.onDragStateChange = (dragging) => {
            this._gameOverDialogDragging = dragging
            const button = this._gameOverMainMenuButton?.getComponent(UIButton)
            if (!button) return

            button.interactable = !dragging
        }

        this._addToScreenClipRoot(node)
        node.active = true
        this._modalScreen = node
        void this._createGameOverMainMenuButton()

        void dialog.waitForResult().then((result) => {
            if (this._modalScreen === node) this._modalScreen = null
            this._destroyGameOverMainMenuButton()
            if (result !== DialogResult.Footer && result !== DialogResult.Ok) return

            void SoundLoader.play(SoundEffect.ButtonClick)
            this.showAdventureGame(undefined, { forceNewGame: true, skipSavedGamePrompt: true })
        })
        return dialog
    }

    private async _createGameOverMainMenuButton() {
        this._destroyGameOverMainMenuButton()

        const [sprites, fonts, lawnStrings] = await Promise.all([
            MessageBoxAssets.loadButtonSprites(),
            MessageBoxAssets.loadButtonFonts(),
            LawnStringLoader.load(),
        ])
        if (!sprites || !fonts || this._gameOverMainMenuButton?.isValid) return
        if (!this._modalScreen?.isValid || !this.uiRoot?.isValid) return

        const button = createStoneButton({
            name: 'GameOverMainMenuButton',
            parent: this._ensureScreenClipRoot(),
            layer: this.uiRoot.layer,
            label: this._lawnString(lawnStrings, 'MAIN_MENU_BUTTON', 'Main Menu'),
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

    private _lawnString(strings: Record<string, string>, key: string, fallback: string) {
        return LawnStringLoader.translateOptional(`[${key}]`, strings) || fallback
    }

    async confirmQuit(): Promise<void> {
        const strings = await LawnStringLoader.load()
        const dialog = this.showMessageBox(
            this._lawnString(strings, 'QUIT_HEADER', 'Quit'),
            this._lawnString(strings, 'QUIT_MESSAGE', 'Are you sure you wish to \nquit the game?'),
        )
        if (!dialog) return

        dialog.setMessageLayout(0, 0, 2)
        dialog.setButtonMode(
            DialogButtonMode.OkCancel,
            this._lawnString(strings, 'QUIT_BUTTON', 'Quit'),
            this._lawnString(strings, 'DIALOG_BUTTON_CANCEL', 'Cancel'),
        )
        const result = await dialog.waitForResult()
        if (result === DialogResult.Ok) {
            this._quitGame()
        }
    }

    async confirmRestartLevel(): Promise<boolean> {
        const strings = await LawnStringLoader.load()
        const dialog = this.showMessageBox(
            this._lawnString(strings, 'RESTART_LEVEL_HEADER', 'Restart Level?'),
            this._lawnString(strings, 'RESTART_LEVEL_BODY', 'Do you want to try this level \nagain from the beginning?'),
        )
        if (!dialog) return false

        dialog.setMessageLayout(0, 0, 2)
        dialog.setButtonMode(
            DialogButtonMode.OkCancel,
            this._lawnString(strings, 'DIALOG_BUTTON_OK', 'OK'),
            this._lawnString(strings, 'DIALOG_BUTTON_CANCEL', 'CANCEL'),
        )
        const result = await dialog.waitForResult()
        return result === DialogResult.Ok
    }

    async confirmSeedChooserWarning(warningKey: string): Promise<boolean> {
        const strings = await LawnStringLoader.load()
        const dialog = this.showMessageBox(
            this._lawnString(strings, 'DIALOG_WARNING', 'Warning'),
            this._lawnString(strings, warningKey, 'Are you sure you want to continue?'),
        )
        if (!dialog) return false

        dialog.setButtonMode(
            DialogButtonMode.OkCancel,
            this._lawnString(strings, 'DIALOG_BUTTON_YES', 'YES'),
            this._lawnString(strings, 'REPICK_BUTTON', 'Re-pick'),
        )
        const result = await dialog.waitForResult()
        return result === DialogResult.Ok
    }

    async confirmBackToMainMenu(): Promise<boolean> {
        const strings = await LawnStringLoader.load()
        const dialog = this.showMessageBox(
            this._lawnString(strings, 'LEAVE_GAME_HEADER', 'Leave Game?'),
            this._lawnString(strings, 'LEAVE_GAME', 'Do you want to return\nto the main menu?\n\nYour game will be saved.'),
        )
        if (!dialog) return false

        dialog.setMessageLayout(0, 0, 2)
        dialog.setButtonMode(
            DialogButtonMode.OkCancel,
            this._lawnString(strings, 'LEAVE_BUTTON', 'LEAVE'),
            this._lawnString(strings, 'DIALOG_BUTTON_CANCEL', 'CANCEL'),
        )
        const result = await dialog.waitForResult()
        return result === DialogResult.Ok
    }

    async showContinueGameDialog(gameScreen: AdventureGameScreen): Promise<MessageBox | null> {
        const strings = await LawnStringLoader.load()
        const dialog = this.showMessageBox(
            this._lawnString(strings, 'CONTINUE_GAME_HEADER', 'CONTINUE GAME?'),
            this._lawnString(
                strings,
                'CONTINUE_GAME_OR_RESTART',
                'Do you want to continue your current game or restart the level?',
            ),
        )
        if (!dialog) return null

        dialog.dialogType = 1
        dialog.extraWidth = 10
        dialog.extraHeight = 60
        dialog.setMessageLayout(0, 0, 2)
        let restarting = false
        dialog.setButtons([
            {
                label: this._lawnString(strings, 'CONTINUE_BUTTON', 'Continue'),
                result: DialogResult.Yes,
                localize: false,
            },
            {
                label: this._lawnString(strings, 'RESTART_LEVEL_BUTTON', 'Restart Level'),
                result: CONTINUE_GAME_RESULT_RESTART,
                localize: false,
                finishOnClick: false,
                onClick: () => {
                    void this.confirmRestartLevel().then((confirmed) => {
                        if (!confirmed) return
                        restarting = true
                        dialog.close()
                        this._deleteAdventureSave()
                        this.showAdventureGame(gameScreen.levelDefinition, { forceNewGame: true, skipSavedGamePrompt: true })
                    })
                },
            },
            {
                label: this._lawnString(strings, 'DIALOG_BUTTON_CANCEL', 'Cancel'),
                result: DialogResult.Cancel,
                localize: false,
            },
        ])
        const result = await dialog.waitForResult()
        if (restarting) return dialog
        if (result === DialogResult.Yes) {
            gameScreen.resumeGame()
        } else if (result === DialogResult.Cancel) {
            void this.showSelectorScreen()
        }
        return dialog
    }

    private _setCurrentScreen(node: Node, options: { keepPreviousScreen?: boolean } = {}) {
        this._destroyCurrentScreen({
            keepScreenClipRoot: true,
            keepCurrentScreen: options.keepPreviousScreen,
        })
        this._currentScreen = node
        this._addToScreenClipRoot(node)
        node.active = true
        this._placePersistentWidescreenBackgrounds()
    }

    private _addToScreenClipRoot(node: Node) {
        const root = this._ensureScreenClipRoot()
        root.addChild(node)
        root.setSiblingIndex((this.uiRoot?.children.length ?? 1) - 1)
    }

    private _ensureScreenClipRoot() {
        if (this._screenClipRoot?.isValid) return this._screenClipRoot

        const root = createUINode('ScreenClipRoot', {
            parent: this.uiRoot!,
            layer: this.uiRoot!.layer,
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT,
        })
        this._ensureScreenClip(root)
        this._screenClipRoot = root
        return root
    }

    private _ensureScreenClip(node: Node) {
        const transform = node.getComponent(UITransform)
        if (transform) transform.setContentSize(SCREEN_WIDTH, SCREEN_HEIGHT)
        const mask = node.getComponent(Mask) ?? node.addComponent(Mask)
        mask.type = Mask.Type.GRAPHICS_RECT
    }

    private async _ensurePersistentWidescreenBackgrounds() {
        if (!this.uiRoot?.isValid || this._backgroundLeft?.isValid || this._backgroundRight?.isValid) return

        const [left, right] = await Promise.all([
            SpriteLoader.load('background_left'),
            SpriteLoader.load('background_right'),
        ])
        if (!this.uiRoot?.isValid) return

        if (left) {
            this._backgroundLeft = createSpriteNode({
                name: 'PersistentBackgroundLeft',
                spriteFrame: left,
                parent: this.uiRoot,
                layer: this.uiRoot.layer,
                anchorX: 1,
                anchorY: 1,
            })
        }
        if (right) {
            this._backgroundRight = createSpriteNode({
                name: 'PersistentBackgroundRight',
                spriteFrame: right,
                parent: this.uiRoot,
                layer: this.uiRoot.layer,
                anchorX: 0,
                anchorY: 1,
            })
        }
        this._placePersistentWidescreenBackgrounds()
    }

    private _placePersistentWidescreenBackgrounds() {
        this._layoutSideBackground(this._backgroundLeft, -SCREEN_WIDTH / 2)
        this._layoutSideBackground(this._backgroundRight, SCREEN_WIDTH / 2)
        this._backgroundRight?.setSiblingIndex(0)
        this._backgroundLeft?.setSiblingIndex(0)
        this._applyWidescreenBackgroundVisibility()
    }

    private _layoutSideBackground(node: Node | null, x: number) {
        if (!node?.isValid) return

        const transform = node.getComponent(UITransform)
        const height = transform?.contentSize.height ?? SCREEN_HEIGHT
        const scale = height > 0 ? SCREEN_HEIGHT / height : 1
        node.setPosition(x, SCREEN_HEIGHT / 2, 0)
        node.setScale(scale, scale, 1)
    }

    private _applyWidescreenBackgroundVisibility() {
        const visible = this._widescreenBackgroundsVisible()
        this._setWidescreenBackgroundVisible(this._backgroundLeft, visible)
        this._setWidescreenBackgroundVisible(this._backgroundRight, visible)
    }

    private _widescreenBackgroundsVisible() {
        return GameDebugSettings.widescreenBackgroundsVisible
    }

    private _setWidescreenBackgroundVisible(node: Node | null, visible: boolean) {
        if (!node?.isValid) return

        node.active = true
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity)
        opacity.opacity = visible ? 255 : 0
    }

    private _destroyCurrentScreen(options: { keepScreenClipRoot?: boolean, keepCurrentScreen?: boolean } = {}) {
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
        if (!options.keepScreenClipRoot && this._screenClipRoot?.isValid) {
            this._screenClipRoot.destroy()
            this._screenClipRoot = null
        }
        this._globalAdviceLayer = null
        this._globalAdviceWidget = null
        this._screenTransitioning = false
        this._startupScreen = null
        if (!options.keepCurrentScreen && this._currentScreen?.isValid) {
            this._currentScreen.destroy()
        }
        if (!options.keepCurrentScreen) this._currentScreen = null
        this._selectorScreen = null
        this._adventureGameScreen = null
    }

    private async _reloadGame() {
        if (this._bootstrapPromise) return
        this._destroyCurrentScreen()
        await this._bootstrap()
    }

    private _isStartupScreenActive() {
        return this._startupScreen?.isValid === true
    }

    private _playInterfaceMusic(tune: MusicTuneId, restart = false) {
        void MusicSystem.playTune(tune, restart)
    }

    private _restoreCurrentScreenMusic() {
        const screenName = this._currentScreen?.name
        if (!screenName || screenName === 'AdventureGameScreen') return

        if (screenName === 'AlmanacScreen' || screenName === 'ChallengeScreen') {
            this._playInterfaceMusic('choose_seeds')
            return
        }
        if (screenName === 'AwardScreen' || screenName === 'ZenGardenScreen') {
            this._playInterfaceMusic('zen_garden')
            return
        }
        this._playInterfaceMusic('title_theme')
    }

    private _onGlobalKeyDown(event: EventKeyboard) {
        if (
            event.keyCode === ESCAPE_KEY_CODE &&
            this._currentScreen?.name === 'IntegratedAdventure11' &&
            this._integratedAdventure11?.isRunning()
        ) {
            event.propagationStopped = true
            this._showIntegratedAdventure11OptionsDialog()
            return
        }
        if (event.keyCode !== DEBUG_CLI_KEY_CODE) return
        if (this._debugCliScreen?.isValid) return

        event.propagationStopped = true
        this.showDebugCliDialog('/')
    }

    private _onGameHidden() {
        void this._integratedAdventure11?.saveIfRunning().catch((error) => {
            console.error('[UIController] Failed to save integrated Adventure 1-1', error)
        })
    }

    private _onGlobalTouchStart(event: EventTouch) {
        this._handleMobileDebugCliTap(event)
    }

    private _handleMobileDebugCliTap(event: EventTouch) {
        if (!GameDebugSettings.isMobileMode() || this._debugCliScreen?.isValid || this._isStartupScreenActive()) {
            this._lastMobileDebugCliTapTime = 0
            return false
        }

        const location = event.getLocation()
        const touchId = event.getID()
        const now = Date.now()
        if (
            now - this._lastMobileDebugCliRawTapTime < 50 &&
            touchId === this._lastMobileDebugCliRawTapId &&
            Math.abs(location.x - this._lastMobileDebugCliRawTapX) < 1 &&
            Math.abs(location.y - this._lastMobileDebugCliRawTapY) < 1
        ) {
            return false
        }
        this._lastMobileDebugCliRawTapTime = now
        this._lastMobileDebugCliRawTapId = touchId
        this._lastMobileDebugCliRawTapX = location.x
        this._lastMobileDebugCliRawTapY = location.y

        const windowSize = screen.windowSize
        const cornerSize = MOBILE_DEBUG_CLI_CORNER_SIZE * screen.devicePixelRatio
        if (location.x < windowSize.width - cornerSize || location.y > cornerSize) {
            this._lastMobileDebugCliTapTime = 0
            return false
        }

        if (now - this._lastMobileDebugCliTapTime > MOBILE_DEBUG_CLI_DOUBLE_TAP_MS) {
            this._lastMobileDebugCliTapTime = now
            return false
        }

        event.propagationStopped = true
        this._lastMobileDebugCliTapTime = 0
        this.showDebugCliDialog('/', { offsetY: MOBILE_TEXT_INPUT_DIALOG_OFFSET_Y })?.requestNativeTextInputFocus()
        return true
    }

    private _showGlobalAdvice(message: string) {
        if (!this.uiRoot?.isValid) return

        if (!this._globalAdviceWidget?.node.isValid) {
            if (!this._globalAdviceLayer?.isValid) {
                this._globalAdviceLayer = createUINode('GlobalAdviceLayer', {
                    parent: this._ensureScreenClipRoot(),
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
        if (!this._screenClipRoot?.isValid || !this._globalAdviceLayer?.isValid) return

        this._globalAdviceLayer.setSiblingIndex(this._screenClipRoot.children.length - 1)
    }

    private _advanceAdventureProgress(completedLevel: number) {
        const profile = this._profile ?? ProfileStore.loadCurrentProfile()
        if (!profile) return this._adventureLevel.adventureLevel

        this._profile = AdventureProgressStore.advanceProgress(profile, completedLevel)
        return this._profile.adventureLevel
    }

    private _setAdventureProgress(adventureLevel: number) {
        const profile = this._profile ?? ProfileStore.loadCurrentProfile()
        if (!profile) return

        this._profile = AdventureProgressStore.setProgress(profile, adventureLevel)
        this._adventureLevel = this._resolveAdventureLevel(adventureLevel)
        this._syncSelectorProfile()
    }

    private _setProfileCoins(amount: number) {
        const profile = this._profile ?? ProfileStore.loadCurrentProfile()
        if (!profile) return

        this._profile = AdventureProgressStore.setCoins(profile, amount)
    }

    private _applyPersistedSettings() {
        this._settings = GameSettingsStore.load()
        if (this._isNativeMobileFullScreenForced() && !this._settings.fullScreen) {
            this._settings = GameSettingsStore.update({ fullScreen: true })
        }
        SoundLoader.setMusicVolume(this._settings.musicVolume)
        SoundLoader.setSfxVolume(this._settings.sfxVolume)
        void this._applyFullScreenPreference(this._settings.fullScreen)
    }

    private _reloadPersistedSettings() {
        this._settings = GameSettingsStore.load()
        if (this._isNativeMobileFullScreenForced() && !this._settings.fullScreen) {
            this._settings = GameSettingsStore.update({ fullScreen: true })
        }
        this._syncOpenOptionsDialogSettings()
        this._applyWidescreenBackgroundVisibility()
    }

    private _syncOpenOptionsDialogSettings() {
        const optionsDialog = this._optionsDialog
        if (!optionsDialog?.node?.isValid) {
            this._optionsDialog = null
            return
        }

        const forceFullScreen = this._isNativeMobileFullScreenForced()
        optionsDialog.musicVolume = this._settings.musicVolume
        optionsDialog.sfxVolume = this._settings.sfxVolume
        optionsDialog.forceFullScreen = forceFullScreen
        optionsDialog.fullScreen = forceFullScreen ? true : this._settings.fullScreen
        optionsDialog.hardwareAcceleration = true
        void optionsDialog.renderDialog()
    }

    private _configureOptionsDialog(optionsDialog: OptionsDialog) {
        const forceFullScreen = this._isNativeMobileFullScreenForced()
        optionsDialog.musicVolume = this._settings.musicVolume
        optionsDialog.sfxVolume = this._settings.sfxVolume
        optionsDialog.forceFullScreen = forceFullScreen
        optionsDialog.fullScreen = forceFullScreen ? true : this._settings.fullScreen
        optionsDialog.hardwareAcceleration = true
        optionsDialog.onMusicVolumeChanged = (value) => {
            this._settings = GameSettingsStore.update({ musicVolume: value })
            SoundLoader.setMusicVolume(this._settings.musicVolume)
        }
        optionsDialog.onSfxVolumeChanged = (value) => {
            this._settings = GameSettingsStore.update({ sfxVolume: value })
            SoundLoader.setSfxVolume(this._settings.sfxVolume)
        }
        optionsDialog.onFullScreenChanged = (checked) => {
            if (checked && !this._canRequestFullScreen()) {
                optionsDialog.fullScreen = false
                void optionsDialog.renderDialog()
                this.showMessageBox(FULLSCREEN_ERROR_TITLE, NO_FULLSCREEN_MESSAGE)
                return
            }

            optionsDialog.fullScreen = checked
        }
        optionsDialog.onForcedFullScreenClick = () => {
            this.showMessageBox(FULLSCREEN_LOCKED_TITLE, MOBILE_NATIVE_NO_WINDOWED_MESSAGE)
        }
        optionsDialog.onForcedHardwareAccelerationClick = () => {
            this.showMessageBox(HARDWARE_ACCELERATION_LOCKED_TITLE, HARDWARE_ACCELERATION_LOCKED_MESSAGE)
        }
        optionsDialog.onGithub = () => {
            sys.openURL(PROJECT_GITHUB_URL)
        }
    }

    private _commitOptionsDialogSettings(optionsDialog: OptionsDialog) {
        if (this._isNativeMobileFullScreenForced()) {
            if (!this._settings.fullScreen) {
                this._settings = GameSettingsStore.update({ fullScreen: true })
            }
            return
        }

        if (optionsDialog.fullScreen && !this._canRequestFullScreen()) {
            if (this._settings.fullScreen) {
                this._settings = GameSettingsStore.update({ fullScreen: false })
            }
            return
        }

        const fullScreen = !!optionsDialog.fullScreen
        if (this._settings.fullScreen === fullScreen) return

        this._settings = GameSettingsStore.update({ fullScreen })
        void this._applyFullScreenPreference(fullScreen)
    }

    private async _applyFullScreenPreference(fullScreen: boolean) {
        if (this._isNativeMobileFullScreenForced()) {
            if (!this._settings.fullScreen) {
                this._settings = GameSettingsStore.update({ fullScreen: true })
            }
            return
        }
        if (!this._canRequestFullScreen()) return

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
        if (this._isNativeMobileFullScreenForced()) {
            if (!this._settings.fullScreen) {
                this._settings = GameSettingsStore.update({ fullScreen: true })
            }
            return
        }
        const fullScreen = screen.fullScreen()
        if (this._settings.fullScreen === fullScreen) return

        this._settings = GameSettingsStore.update({ fullScreen })
    }

    private _isNativeMobileFullScreenForced() {
        return sys.isNative && sys.isMobile
    }

    private _canRequestFullScreen() {
        return screen.supportsFullScreen
    }

    private _quitGame() {
        game.end()
    }

    private _showStoreFromDebugCommand(gameScreen?: AdventureGameScreen | null, resumeGameOnClose = false) {
        if (this._currentScreen?.isValid) {
            return !!this.showStoreDialog({
                ...this._storeDialogOptionsForCurrentScreen(),
                backButtonLabel: 'GO BACK',
                useOverlayMusic: !!gameScreen,
                onClose: () => {
                    MusicSystem.stopOverlayTune()
                    if (resumeGameOnClose) gameScreen?.resumeGame()
                },
            })
        }

        return !!this.showStoreScreen({
            backButtonLabel: 'GO BACK',
        })
    }

    private _storeDialogOptionsForCurrentScreen(): StoreDialogOptions {
        if (this._currentScreen?.name === 'ZenGardenScreen') {
            return {
                initialPage: 2,
                backButtonLabel: 'GO BACK',
            }
        }
        return {}
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

    private _setCurrentProfile(profile: PlayerProfile | null) {
        this._profile = profile
        this._adventureLevel = this._getProfileAdventureLevel()
        this._syncSelectorProfile()
    }

    private _loadAdventureSnapshot(level: LevelDefinition) {
        if (!this._profile) return null
        return AdventureProgressStore.loadSnapshot(this._profile, level)
    }

    private _saveAdventureGame(gameScreen?: AdventureGameScreen | null) {
        if (!this._profile || !gameScreen?.node?.isValid) return

        const snapshot = gameScreen.createSaveSnapshot()
        if (!snapshot) return

        AdventureProgressStore.saveSnapshot(this._profile, gameScreen.levelDefinition, snapshot)
    }

    private _deleteAdventureSave() {
        if (!this._profile) return
        AdventureProgressStore.deleteSave(this._profile)
    }

    private _syncSelectorProfile() {
        const selectorScreen = this._selectorScreen
        if (!selectorScreen?.node?.isValid) return

        const playableAdventureLevel = this._getProfileAdventureLevel()
        this._adventureLevel = playableAdventureLevel
        selectorScreen.hasProfile = this._profile != null
        selectorScreen.profileName = this._profile?.name ?? ''
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
    }

    private _sameProfileName(a: string, b: string) {
        return a.toLowerCase() === b.toLowerCase()
    }

    private async _requireProfileBeforePlaying() {
        if (!this._profile) {
            void this.showNewUserDialog()
            return
        }
        void this.showUserDialog()
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

    private async _showSelectorLockedDialog(messageKey: string) {
        const strings = await LawnStringLoader.load()
        this.showMessageBox(
            this._lawnString(strings, 'MODE_LOCKED', 'Locked!'),
            this._lawnString(strings, messageKey, 'Play more Adventure to unlock this mode.'),
        )
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
        const index = ADVENTURE_LEVELS.findIndex((level) => level.id === this._adventureLevel.id)
        return ADVENTURE_LEVELS[index + 1] ?? this._adventureLevel
    }

    private _findAdventureLevel(levelId: LevelDefinition['id']) {
        return ADVENTURE_LEVELS.find((level) => level.id === levelId) ??
            DEBUG_LEVELS.find((level) => level.id === levelId) ??
            null
    }

    private _isDebugLevel(level: LevelDefinition) {
        return DEBUG_LEVELS.some((debugLevel) => debugLevel.id === level.id)
    }

    private _shouldStartDebugAdventure() {
        const locationLike = globalThis as typeof globalThis & {
            location?: { search?: string }
        }
        return locationLike.location?.search?.includes('game=adventure-1-1') === true
    }
}
