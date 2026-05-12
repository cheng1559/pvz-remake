import { _decorator, Color, Node, Rect, Size, Sprite, SpriteFrame, Vec2, Vec3 } from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { UIButton } from '@/ui/Button'
import { MenuScreenBase } from '@/ui/MenuScreenBase'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import {
    ChallengeScreenAssets,
    type ChallengeScreenFonts,
    type ChallengeScreenSprites,
} from './ChallengeScreenAssets'

const { ccclass, property } = _decorator

export const ChallengePage = {
    MiniGames: 'miniGames',
    Puzzle: 'puzzle',
    Survival: 'survival',
} as const

export type ChallengePage = (typeof ChallengePage)[keyof typeof ChallengePage]

const CHALLENGE_BUTTON_WIDTH = 104
const CHALLENGE_BUTTON_HEIGHT = 115
const CHALLENGE_THUMBNAIL_WIDTH = 80
const CHALLENGE_THUMBNAIL_HEIGHT = 65
const CHALLENGE_LABEL_WIDTH = 94
const TITLE_COLOR = new Color(220, 220, 220)
const BUTTON_TEXT_COLOR = new Color(42, 42, 90)
const BUTTON_TEXT_HOVER_COLOR = new Color(250, 40, 40)

const PAGE_TITLE: Record<ChallengePage, string> = {
    [ChallengePage.MiniGames]: 'Mini-Games',
    [ChallengePage.Puzzle]: 'Puzzle',
    [ChallengePage.Survival]: 'Survival',
}

interface ChallengeDefinition {
    page: ChallengePage
    row: number
    col: number
    iconIndex: number
    name: string
}

const CHALLENGE_DEFINITIONS: ChallengeDefinition[] = [
    { page: ChallengePage.Survival, row: 0, col: 0, iconIndex: 0, name: 'Survival:\nDay' },
    { page: ChallengePage.Survival, row: 0, col: 1, iconIndex: 1, name: 'Survival:\nNight' },
    { page: ChallengePage.Survival, row: 0, col: 2, iconIndex: 2, name: 'Survival:\nPool' },
    { page: ChallengePage.Survival, row: 0, col: 3, iconIndex: 3, name: 'Survival:\nFog' },
    { page: ChallengePage.Survival, row: 0, col: 4, iconIndex: 4, name: 'Survival:\nRoof' },
    { page: ChallengePage.Survival, row: 1, col: 0, iconIndex: 5, name: 'Survival:\nDay (Hard)' },
    { page: ChallengePage.Survival, row: 1, col: 1, iconIndex: 6, name: 'Survival:\nNight (Hard)' },
    { page: ChallengePage.Survival, row: 1, col: 2, iconIndex: 7, name: 'Survival:\nPool (Hard)' },
    { page: ChallengePage.Survival, row: 1, col: 3, iconIndex: 8, name: 'Survival:\nFog (Hard)' },
    { page: ChallengePage.Survival, row: 1, col: 4, iconIndex: 9, name: 'Survival:\nRoof (Hard)' },
    { page: ChallengePage.Survival, row: 2, col: 2, iconIndex: 10, name: 'Survival:\nEndless' },

    { page: ChallengePage.MiniGames, row: 0, col: 0, iconIndex: 0, name: 'Zombotany' },
    { page: ChallengePage.MiniGames, row: 0, col: 1, iconIndex: 6, name: 'Wall-nut Bowling' },
    { page: ChallengePage.MiniGames, row: 0, col: 2, iconIndex: 2, name: 'Slot Machine' },
    { page: ChallengePage.MiniGames, row: 0, col: 3, iconIndex: 3, name: "It's Raining Seeds" },
    { page: ChallengePage.MiniGames, row: 0, col: 4, iconIndex: 1, name: 'Beghouled' },
    { page: ChallengePage.MiniGames, row: 1, col: 0, iconIndex: 8, name: 'Invisighoul' },
    { page: ChallengePage.MiniGames, row: 1, col: 1, iconIndex: 5, name: 'Seeing Stars' },
    { page: ChallengePage.MiniGames, row: 1, col: 2, iconIndex: 7, name: 'Zombiquarium' },
    { page: ChallengePage.MiniGames, row: 1, col: 3, iconIndex: 20, name: 'Beghouled Twist' },
    {
        page: ChallengePage.MiniGames,
        row: 1,
        col: 4,
        iconIndex: 12,
        name: 'Big Trouble Little Zombie',
    },
    { page: ChallengePage.MiniGames, row: 2, col: 0, iconIndex: 15, name: 'Portal Combat' },
    {
        page: ChallengePage.MiniGames,
        row: 2,
        col: 1,
        iconIndex: 4,
        name: "Column Like You See 'Em",
    },
    { page: ChallengePage.MiniGames, row: 2, col: 2, iconIndex: 17, name: 'Bobsled Bonanza' },
    {
        page: ChallengePage.MiniGames,
        row: 2,
        col: 3,
        iconIndex: 18,
        name: 'Zombie Nimble Zombie Quick',
    },
    { page: ChallengePage.MiniGames, row: 2, col: 4, iconIndex: 16, name: 'Whack a Zombie' },
    { page: ChallengePage.MiniGames, row: 3, col: 0, iconIndex: 21, name: 'Last Stand' },
    { page: ChallengePage.MiniGames, row: 3, col: 1, iconIndex: 0, name: 'Zombotany 2' },
    { page: ChallengePage.MiniGames, row: 3, col: 2, iconIndex: 6, name: 'Wall-nut Bowling 2' },
    { page: ChallengePage.MiniGames, row: 3, col: 3, iconIndex: 14, name: 'Pogo Party' },
    { page: ChallengePage.MiniGames, row: 3, col: 4, iconIndex: 19, name: "Dr. Zomboss's Revenge" },

    { page: ChallengePage.Puzzle, row: 0, col: 0, iconIndex: 10, name: 'Vasebreaker' },
    { page: ChallengePage.Puzzle, row: 0, col: 1, iconIndex: 10, name: 'To the Left' },
    { page: ChallengePage.Puzzle, row: 0, col: 2, iconIndex: 10, name: 'Third Vase' },
    { page: ChallengePage.Puzzle, row: 0, col: 3, iconIndex: 10, name: 'Chain Reaction' },
    { page: ChallengePage.Puzzle, row: 0, col: 4, iconIndex: 10, name: 'M is for\nMetal' },
    { page: ChallengePage.Puzzle, row: 1, col: 0, iconIndex: 10, name: 'Scary Potter' },
    { page: ChallengePage.Puzzle, row: 1, col: 1, iconIndex: 10, name: 'Hokey Pokey' },
    { page: ChallengePage.Puzzle, row: 1, col: 2, iconIndex: 10, name: 'Another Chain\nReaction' },
    { page: ChallengePage.Puzzle, row: 1, col: 3, iconIndex: 10, name: 'Ace of Vase' },
    { page: ChallengePage.Puzzle, row: 1, col: 4, iconIndex: 10, name: 'Vasebreaker Endless' },
    { page: ChallengePage.Puzzle, row: 2, col: 0, iconIndex: 11, name: 'I, Zombie' },
    { page: ChallengePage.Puzzle, row: 2, col: 1, iconIndex: 11, name: 'I, Zombie\nToo' },
    { page: ChallengePage.Puzzle, row: 2, col: 2, iconIndex: 11, name: 'Can You\nDig It?' },
    { page: ChallengePage.Puzzle, row: 2, col: 3, iconIndex: 11, name: 'Totally Nuts' },
    { page: ChallengePage.Puzzle, row: 2, col: 4, iconIndex: 11, name: 'Dead\nZeppelin' },
    { page: ChallengePage.Puzzle, row: 3, col: 0, iconIndex: 11, name: 'Me Smash!' },
    { page: ChallengePage.Puzzle, row: 3, col: 1, iconIndex: 11, name: 'ZomBoogie' },
    { page: ChallengePage.Puzzle, row: 3, col: 2, iconIndex: 11, name: 'Three Hit Wonder' },
    {
        page: ChallengePage.Puzzle,
        row: 3,
        col: 3,
        iconIndex: 11,
        name: 'All your brainz r belong to us',
    },
    { page: ChallengePage.Puzzle, row: 3, col: 4, iconIndex: 11, name: 'I, Zombie Endless' },
]

@ccclass('ChallengeScreen')
export class ChallengeScreen extends MenuScreenBase {
    @property
    page: ChallengePage = ChallengePage.MiniGames

    public onChallengeSelected: ((challengeName: string) => void) | null = null

    private _thumbnailFrames: Map<string, SpriteFrame> = new Map()

    async render() {
        const [sprites, fonts] = await Promise.all([
            ChallengeScreenAssets.loadSprites(),
            ChallengeScreenAssets.loadFonts(),
        ])
        if (!sprites) return

        this._resetRoot('ChallengeScreenRoot')
        this._createBackground(sprites.background)
        this._createTitle(fonts.title)
        this._createTrophyCounter(sprites, fonts.small)
        this._createChallengeButtons(sprites, fonts.button)
        this._createBackButton(sprites, fonts)
    }

    private _createTitle(font: BitmapFontAssets | null) {
        const title = PAGE_TITLE[this.page]
        this._createText({
            name: 'Title',
            text: title,
            baselineX: 400,
            baselineY: 58,
            font,
            color: TITLE_COLOR,
            align: 'center',
        })
    }

    private _createTrophyCounter(sprites: ChallengeScreenSprites, font: BitmapFontAssets | null) {
        createSpriteNode({
            name: 'Trophy',
            spriteFrame: sprites.trophy,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(718),
            y: this._cppY(26),
            anchorX: 0,
            anchorY: 1,
            width: sprites.trophy.originalSize.width * 0.5,
            height: sprites.trophy.originalSize.height * 0.5,
        })
        this._createText({
            name: 'TrophyCounter',
            text: '20/20',
            baselineX: 739,
            baselineY: 73,
            font,
            color: new Color(255, 240, 0),
            align: 'center',
        })
    }

    private _createBackButton(sprites: ChallengeScreenSprites, fonts: ChallengeScreenFonts) {
        const buttonNode = createUINode('BackToMenuButton', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 111,
            height: 26,
        })
        buttonNode.setPosition(this._cppX(18), this._cppY(568), 0)

        const sprite = buttonNode.addComponent(Sprite)
        sprite.trim = false
        sprite.sizeMode = Sprite.SizeMode.RAW
        sprite.spriteFrame = sprites.backButton

        const labelNode = createUINode('Label', {
            parent: buttonNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const label = labelNode.addComponent(FontRenderer)
        if (fonts.button) label.setFontAssets(fonts.button)
        label.fontColor = BUTTON_TEXT_COLOR
        label.string = 'Back to Menu'
        label.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(fonts.button?.config ?? null)
        const width =
            FontMetricsUtil.measureTextWidth(fonts.button?.config ?? null, label.string) ||
            label.contentWidth
        const baseline = Math.trunc((26 - Math.trunc(metrics.ascent / 6) + metrics.ascent - 1) / 2)
        labelNode.setPosition((111 - width) / 2, -(baseline - metrics.ascent + 1), 0)

        const button = buttonNode.addComponent(UIButton)
        button.normalSprite = sprites.backButton
        button.hoverSprite = sprites.backButtonHighlight
        button.pressedSprite = sprites.backButtonHighlight
        button.pressOffset = new Vec3(0, 0, 0)
        button.onPress = () => {
            void SoundLoader.play(SoundEffect.ButtonClick)
        }
        button.onStateChange = (state) => {
            const pressed = state === 'pressed'
            labelNode.setPosition(
                (111 - width) / 2 + (pressed ? 1 : 0),
                -(baseline - metrics.ascent + 1 + (pressed ? 1 : 0)),
                0,
            )
        }
        button.onClick = () => {
            this.onBackToMenu?.()
        }
    }

    private _createChallengeButtons(
        sprites: ChallengeScreenSprites,
        font: BitmapFontAssets | null,
    ) {
        const pageDefinitions = CHALLENGE_DEFINITIONS.filter(
            (definition) => definition.page === this.page,
        )
        for (const definition of pageDefinitions) {
            this._createChallengeButton(definition, sprites, font)
        }
    }

    private _createChallengeButton(
        definition: ChallengeDefinition,
        sprites: ChallengeScreenSprites,
        font: BitmapFontAssets | null,
    ) {
        const x = 38 + definition.col * 155
        const startY = definition.page === ChallengePage.Survival ? 125 : 93
        const rowGap = definition.page === ChallengePage.Survival ? 145 : 119
        const y = startY + definition.row * rowGap

        const buttonNode = createUINode(`ChallengeButton_${definition.name}`, {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: CHALLENGE_BUTTON_WIDTH,
            height: CHALLENGE_BUTTON_HEIGHT,
        })
        const origin = new Vec3(this._cppX(x), this._cppY(y), 0)
        buttonNode.setPosition(origin)

        const windowNode = createSpriteNode({
            name: 'Window',
            spriteFrame: sprites.challengeWindow,
            parent: buttonNode,
            layer: this.node.layer,
            x: -6,
            y: 2,
            anchorX: 0,
            anchorY: 1,
        })
        const windowSprite = windowNode.getComponent(Sprite)

        const thumbnailAtlas =
            definition.page === ChallengePage.Survival
                ? sprites.survivalThumbnails
                : sprites.challengeThumbnails
        const thumbnailNode = createSpriteNode({
            name: 'Thumbnail',
            spriteFrame: this._getThumbnailFrame(thumbnailAtlas, definition.iconIndex),
            parent: buttonNode,
            layer: this.node.layer,
            x: 13,
            y: -4,
            anchorX: 0,
            anchorY: 1,
            width: CHALLENGE_THUMBNAIL_WIDTH,
            height: CHALLENGE_THUMBNAIL_HEIGHT,
        })
        const thumbnailSprite = thumbnailNode.getComponent(Sprite)
        if (thumbnailSprite) thumbnailSprite.sizeMode = Sprite.SizeMode.CUSTOM

        const labelNode = createUINode('Label', {
            parent: buttonNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: CHALLENGE_LABEL_WIDTH,
            height: 33,
        })
        const label = labelNode.addComponent(FontRenderer)
        if (font) label.setFontAssets(font)
        label.fontColor = BUTTON_TEXT_COLOR
        label.maxWidth = CHALLENGE_LABEL_WIDTH
        label.lineSpacing = 14
        label.textAlign = 2
        label.string = definition.name
        label.forceRebuild()
        const labelMetrics = FontMetricsUtil.getMetrics(font?.config ?? null)
        const singleLineOffsetY = label.contentHeight <= labelMetrics.height ? 1 : 0
        const labelTop = 73 + Math.max(0, 33 - label.contentHeight) / 2 + singleLineOffsetY
        labelNode.setPosition((CHALLENGE_BUTTON_WIDTH - CHALLENGE_LABEL_WIDTH) / 2, -labelTop, 0)

        const button = buttonNode.addComponent(UIButton)
        button.setVisualSprite(windowSprite)
        thumbnailNode.setSiblingIndex(0)
        windowNode.setSiblingIndex(1)
        labelNode.setSiblingIndex(2)
        button.normalSprite = sprites.challengeWindow
        button.hoverSprite = sprites.challengeWindowHighlight
        button.pressedSprite = sprites.challengeWindowHighlight
        button.keepPressOffsetOnPressOut = true
        button.releaseToNormalOnPressOut = true
        button.onPress = () => {
            void SoundLoader.play(SoundEffect.ButtonClick)
        }
        button.onStateChange = (state) => {
            label.fontColor =
                state === 'hover' || state === 'pressed'
                    ? BUTTON_TEXT_HOVER_COLOR
                    : BUTTON_TEXT_COLOR
        }
        button.onClick = () => {
            this.onChallengeSelected?.(definition.name)
        }
    }

    private _getThumbnailFrame(atlas: SpriteFrame, iconIndex: number) {
        const key = `${atlas.originalSize.width}:${iconIndex}`
        const cached = this._thumbnailFrames.get(key)
        if (cached) return cached

        const atlasRect = atlas.rect
        const frame = new SpriteFrame()
        frame.reset({
            texture: atlas.texture,
            rect: new Rect(
                atlasRect.x + iconIndex * CHALLENGE_THUMBNAIL_WIDTH,
                atlasRect.y,
                CHALLENGE_THUMBNAIL_WIDTH,
                CHALLENGE_THUMBNAIL_HEIGHT,
            ),
            originalSize: new Size(CHALLENGE_THUMBNAIL_WIDTH, CHALLENGE_THUMBNAIL_HEIGHT),
            offset: new Vec2(0, 0),
            isRotate: false,
        })
        this._thumbnailFrames.set(key, frame)
        return frame
    }

    onDestroy() {
        for (const frame of this._thumbnailFrames.values()) {
            frame.destroy()
        }
        this._thumbnailFrames.clear()
    }
}
