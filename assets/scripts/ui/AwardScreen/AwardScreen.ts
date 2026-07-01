import { _decorator, Color, EventMouse, EventTouch, Graphics, Node } from 'cc'
import { FontRenderer } from '@/core/FontRenderer'
import { LawnStringLoader } from '@/core/LawnStringLoader'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { SEED_DEFINITIONS, scaleGameDeltaTime } from '@/game/GameDefinitions'
import type { LevelAwardKind, SeedType } from '@/game/GameTypes'
import { UIButton } from '@/ui/Button'
import { MenuScreenBase, SCREEN_HEIGHT, SCREEN_WIDTH } from '@/ui/MenuScreenBase'
import { createSeedChooserButton, createSeedChooserSmallButton } from '@/ui/SeedChooserButton'
import { SeedPacketRenderer } from '@/ui/SeedPacketRenderer'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import { AwardScreenAssets, type AwardScreenFonts, type AwardScreenSprites } from './AwardScreenAssets'

const { ccclass } = _decorator

const FADE_TICKS_PER_SECOND = 100
const FADE_IN_TICKS = 180
const PACKET_X = 350
const PACKET_Y = 129
const PACKET_SCALE = 2
const SHOVEL_Y = 137
const TITLE_BASELINE_X = 400
const TITLE_BASELINE_Y = 58
const PLANT_NAME_BASELINE_X = 400
const PLANT_NAME_BASELINE_Y = 326
const DESCRIPTION_X = 285
const DESCRIPTION_Y = 360
const DESCRIPTION_WIDTH = 230
const DESCRIPTION_HEIGHT = 90
const NEXT_BUTTON_X = 324
const NEXT_BUTTON_Y = 500
const MAIN_MENU_BUTTON_X = 677
const MAIN_MENU_BUTTON_Y = 16
const MAIN_MENU_BUTTON_WIDTH = 111
const MAIN_MENU_BUTTON_HEIGHT = 26
const TITLE_COLOR = new Color(213, 159, 43, 255)
const NOTE_TITLE_COLOR = new Color(255, 200, 0, 255)
const DESCRIPTION_COLOR = new Color(40, 50, 90, 255)
const BUTTON_TEXT_COLOR = new Color(213, 159, 43, 255)
const MAIN_MENU_BUTTON_TEXT_COLOR = new Color(42, 42, 90, 255)

const SEED_STRING_KEYS: Record<SeedType, string> = {
    peashooter: 'PEASHOOTER',
    sunflower: 'SUNFLOWER',
    cherrybomb: 'CHERRY_BOMB',
    wallnut: 'WALL_NUT',
    explodenut: 'EXPLODE_O_NUT',
    potatomine: 'POTATO_MINE',
    snowpea: 'SNOW_PEA',
    chomper: 'CHOMPER',
    repeater: 'REPEATER',
    puffshroom: 'PUFF_SHROOM',
}

@ccclass('AwardScreen')
export class AwardScreen extends MenuScreenBase {
    public awardKind: LevelAwardKind = 'seed'
    public seedType: SeedType | null = 'sunflower'
    public adventureLevel = 1
    public onNextLevelRequest: (() => void) | null = null

    private _fadeInCounter = FADE_IN_TICKS
    private _fadeNode: Node | null = null
    private _fadeGraphics: Graphics | null = null

    protected update(dt: number) {
        if (this._fadeInCounter <= 0) return

        this._fadeInCounter = Math.max(0, this._fadeInCounter - scaleGameDeltaTime(dt) * FADE_TICKS_PER_SECOND)
        this._syncFade()
    }

    async render(): Promise<void> {
        const [sprites, fonts, lawnStrings] = await Promise.all([
            AwardScreenAssets.loadSprites(),
            AwardScreenAssets.loadFonts(),
            LawnStringLoader.load(),
        ])
        if (!sprites) return

        this._resetRoot('AwardScreenRoot')
        this._fadeInCounter = FADE_IN_TICKS
        this._createInputBlocker()
        if (this.awardKind === 'note') {
            this._drawNoteAward(sprites, fonts, lawnStrings)
        } else if (this.awardKind === 'shovel') {
            this._createBackground(sprites.background)
            this._drawShovelAward(sprites, fonts, lawnStrings)
        } else {
            this._createBackground(sprites.background)
            this._drawSeedAward(sprites, fonts, lawnStrings)
        }
        this._drawNextButton(sprites, fonts, lawnStrings)
        if (this.adventureLevel > 3) {
            this._drawMainMenuButton(sprites, fonts, lawnStrings)
        }
        this._createFade()
        this._syncFade()
        UIButton.refreshHoverStates()
    }

    private _drawTitle(fonts: AwardScreenFonts, lawnStrings: Record<string, string>) {
        this._createText({
            name: 'Title',
            text: lawnStrings.NEW_PLANT ?? 'YOU GOT A NEW PLANT!',
            baselineX: TITLE_BASELINE_X,
            baselineY: TITLE_BASELINE_Y,
            font: fonts.title,
            color: TITLE_COLOR,
            align: 'center',
        })
    }

    private _drawSeedAward(
        sprites: AwardScreenSprites,
        fonts: AwardScreenFonts,
        lawnStrings: Record<string, string>,
    ) {
        this._drawTitle(fonts, lawnStrings)
        this._drawSeedPacket(sprites, fonts)
        this._drawDescription(fonts, lawnStrings)
    }

    private _drawShovelAward(
        sprites: AwardScreenSprites,
        fonts: AwardScreenFonts,
        lawnStrings: Record<string, string>,
    ) {
        this._createText({
            name: 'Title',
            text: lawnStrings.GOT_SHOVEL ?? 'YOU GOT THE SHOVEL!',
            baselineX: TITLE_BASELINE_X,
            baselineY: TITLE_BASELINE_Y,
            font: fonts.title,
            color: TITLE_COLOR,
            align: 'center',
        })
        this._createText({
            name: 'AwardName',
            text: lawnStrings.SHOVEL ?? 'SHOVEL',
            baselineX: PLANT_NAME_BASELINE_X,
            baselineY: PLANT_NAME_BASELINE_Y,
            font: fonts.awardName,
            color: Color.WHITE,
            align: 'center',
        })

        createSpriteNode({
            name: 'AwardShovel',
            spriteFrame: sprites.shovelHiRes,
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            x: this._cppX(400 - sprites.shovelHiRes.originalSize.width / 2),
            y: this._cppY(SHOVEL_Y),
        })
        this._drawAwardDescription(
            fonts,
            lawnStrings.SHOVEL_DESCRIPTION ?? 'Use this to dig up plants.',
        )
    }

    private _drawNoteAward(
        sprites: AwardScreenSprites,
        fonts: AwardScreenFonts,
        lawnStrings: Record<string, string>,
    ) {
        createSpriteNode({
            name: 'Background',
            spriteFrame: sprites.noteBackground,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(-700),
            y: this._cppY(-300),
            anchorX: 0,
            anchorY: 1,
            width: 2800,
            height: 1200,
        })
        createSpriteNode({
            name: 'ZombieNote',
            spriteFrame: sprites.zombieNote,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(80),
            y: this._cppY(80),
            anchorX: 0,
            anchorY: 1,
        })
        createSpriteNode({
            name: 'ZombieNote1',
            spriteFrame: sprites.zombieNote1,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(131),
            y: this._cppY(132),
            anchorX: 0,
            anchorY: 1,
        })
        this._createText({
            name: 'FoundNote',
            text: lawnStrings.FOUND_NOTE ?? 'You found a note:',
            baselineX: TITLE_BASELINE_X,
            baselineY: 70,
            font: fonts.title,
            color: NOTE_TITLE_COLOR,
            align: 'center',
        })
        void SoundLoader.play(SoundEffect.Paper)
    }

    private _drawSeedPacket(sprites: AwardScreenSprites, fonts: AwardScreenFonts) {
        const seedType = this.seedType ?? 'sunflower'
        SeedPacketRenderer.drawSeedPacket({
            name: 'AwardSeedPacket',
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(PACKET_X),
            y: this._cppY(PACKET_Y),
            scale: PACKET_SCALE,
            seedType,
            cost: SEED_DEFINITIONS[seedType].cost,
            seeds: null,
            seedPacketLarger: sprites.seedPacketLarger,
            plantPreviews: sprites.plantPreviewsCached,
            costFont: fonts.packetCost,
        })
    }

    private _drawDescription(fonts: AwardScreenFonts, lawnStrings: Record<string, string>) {
        const seedType = this.seedType ?? 'sunflower'
        const stringKey = SEED_STRING_KEYS[seedType]
        this._createText({
            name: 'PlantName',
            text: lawnStrings[stringKey] ?? stringKey,
            baselineX: PLANT_NAME_BASELINE_X,
            baselineY: PLANT_NAME_BASELINE_Y,
            font: fonts.awardName,
            color: Color.WHITE,
            align: 'center',
        })

        this._drawAwardDescription(fonts, lawnStrings[`${stringKey}_TOOLTIP`] ?? `${stringKey}_TOOLTIP`)
    }

    private _drawAwardDescription(fonts: AwardScreenFonts, text: string) {
        const node = createUINode('Description', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: DESCRIPTION_WIDTH,
        })
        const renderer = node.addComponent(FontRenderer)
        if (fonts.description) renderer.setFontAssets(fonts.description)
        renderer.fontColor = DESCRIPTION_COLOR
        renderer.string = text
        renderer.maxWidth = DESCRIPTION_WIDTH
        renderer.textAlign = 2
        renderer.forceRebuild()

        const textY = DESCRIPTION_Y + Math.max(0, (DESCRIPTION_HEIGHT - renderer.contentHeight) / 2)
        node.setPosition(this._cppX(DESCRIPTION_X), this._cppY(textY), 0)
    }

    private _drawNextButton(
        sprites: AwardScreenSprites,
        fonts: AwardScreenFonts,
        lawnStrings: Record<string, string>,
    ) {
        const { button, label, glow } = createSeedChooserButton({
            name: 'NextLevelButton',
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(NEXT_BUTTON_X),
            y: this._cppY(NEXT_BUTTON_Y),
            label: lawnStrings.NEXT_LEVEL_BUTTON ?? 'NEXT LEVEL!',
            normal: sprites.seedChooserButton,
            glow: sprites.seedChooserButtonGlow,
            font: fonts.button,
            color: BUTTON_TEXT_COLOR,
            onClick: () => this.onNextLevelRequest?.(),
        })
        button.rightClickTriggers = false
        this._applyAdditiveSpriteMaterial(glow)
        button.onStateChange = (state) => {
            const highlighted = state === 'hover' || state === 'pressed'
            glow.active = highlighted
            label.node.setPosition(label.baseX, label.baseY, 1)
        }
    }

    private _drawMainMenuButton(
        sprites: AwardScreenSprites,
        fonts: AwardScreenFonts,
        lawnStrings: Record<string, string>,
    ) {
        const { button } = createSeedChooserSmallButton({
            name: 'MainMenuButton',
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(MAIN_MENU_BUTTON_X),
            y: this._cppY(MAIN_MENU_BUTTON_Y),
            width: MAIN_MENU_BUTTON_WIDTH,
            height: MAIN_MENU_BUTTON_HEIGHT,
            label: lawnStrings.AWARD_MAIN_MENU_BUTTON ?? 'MAIN MENU',
            normal: sprites.seedChooserButton2,
            glow: sprites.seedChooserButton2Glow,
            font: fonts.mainMenuButton,
            color: MAIN_MENU_BUTTON_TEXT_COLOR,
            onClick: () => this.onBackToMenu?.(),
        })
        button.rightClickTriggers = false
    }

    private _createInputBlocker() {
        const blocker = createUINode('InputBlocker', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT,
            x: -SCREEN_WIDTH / 2,
            y: SCREEN_HEIGHT / 2,
            z: -10,
        })
        const swallow = (event: EventMouse | EventTouch) => {
            event.propagationStopped = true
        }
        blocker.on(Node.EventType.MOUSE_DOWN, swallow)
        blocker.on(Node.EventType.MOUSE_UP, swallow)
        blocker.on(Node.EventType.MOUSE_MOVE, swallow)
        blocker.on(Node.EventType.TOUCH_START, swallow)
        blocker.on(Node.EventType.TOUCH_MOVE, swallow)
        blocker.on(Node.EventType.TOUCH_END, swallow)
        blocker.on(Node.EventType.TOUCH_CANCEL, swallow)
    }

    private _createFade() {
        this._fadeNode = createUINode('Fade', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT,
            x: -SCREEN_WIDTH / 2,
            y: SCREEN_HEIGHT / 2,
            z: 100,
        })
        this._fadeGraphics = this._fadeNode.addComponent(Graphics)
    }

    private _syncFade() {
        if (!this._fadeNode?.isValid || !this._fadeGraphics) return

        const alpha = Math.round(255 * Math.max(0, Math.min(1, this._fadeInCounter / FADE_IN_TICKS)))
        this._fadeNode.active = alpha > 0
        this._fadeGraphics.clear()
        if (alpha <= 0) return

        this._fadeGraphics.fillColor = this.awardKind === 'note'
            ? new Color(0, 0, 0, alpha)
            : new Color(255, 255, 255, alpha)
        this._fadeGraphics.fillRect(0, -SCREEN_HEIGHT, SCREEN_WIDTH, SCREEN_HEIGHT)
    }
}
