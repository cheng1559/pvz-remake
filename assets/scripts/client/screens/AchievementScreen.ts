import { modResources } from '@/client/content/ModResources'
import { _decorator, Color, Component, input, Input, KeyCode, Sprite, type EventKeyboard } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import { preloadTasks } from '@/client/content/preloadTasks'
import { getAtlasFrame } from '@/client/render/atlasFrame'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { SoundEffect } from '@/client/sound/SoundSystem'
import type { UI } from '@/client/ui/UI'
import type { UIButton } from '@/client/ui/UIButton'
import type { UIScroll } from '@/client/ui/UIScroll'
import { showMenuPageControls } from './MenuPageControls'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'

const { ccclass } = _decorator
/** AchievementsWidget's scroll speeds: an arrow press's (KeyDown, mDefaultScrollValue) and the More rock's (MouseUp). */
const KEY_SPEED = 30
const MORE_SPEED = 22
const SPRITES = [
    'selectorscreen_achievements_bg', 'acheesements_hole_tile', 'acheesements_china',
    'acheesements_bookworm', 'acheesements_bejeweled', 'acheesements_chuzzle',
    'acheesements_peggle', 'acheesements_pipe', 'acheesements_zuma',
    'acheesements_more_rock', 'acheesements_more_button', 'acheesements_more_button_highlight',
    'acheesements_top_button', 'acheesements_top_button_highlight',
]

@ccclass('PvZAchievementScreen')
export class AchievementScreen extends Component {
    private scroll!: UIScroll
    private more!: UIButton
    private showingTop = false
    private readonly icons = new Map<string, Sprite>()
    /**
     * AchievementsWidget::Update's speed: it drops by 1 every 10ms and the list moves that far each time, from 30 for
     * an arrow press (29 + 28 + ... + 1, 435px) and from 22 for the More rock (231px).
     */
    private scrollSpeed = 0
    /** 1 down the list, -1 up. */
    private scrollDirection = 0
    private scrollTime = 0

    async initialize(ui: UI, onBack: () => void): Promise<void> {
        const [data, frames] = await Promise.all([
            menuApi.getAchievements(),
            Promise.all(SPRITES.map(async name => {
                const frame = await modResources.sprite(name)
                return [name, frame] as const
            })),
        ])
        const iconSprites = [...new Set(data.items.map(item => item.icon.sprite))]
        const iconFrames = new Map(await Promise.all(iconSprites.map(async id => {
            const frame = await modResources.sprite(id)
            return [id, frame] as const
        })))
        if (!this.node.isValid) throw new Error('Achievement screen was destroyed while loading')
        const sprites = Object.fromEntries(frames)
        // GOTY AchievementsWidget: height = china + background + 15700, and it scrolls until 50px of it remain hidden.
        const backgroundHeight = sprites.selectorscreen_achievements_bg.originalSize.height
        const chinaY = backgroundHeight + 15650
        this.scroll = ui.scroll(this.node, {
            width: 800, height: 600, contentHeight: chinaY + sprites.acheesements_china.originalSize.height,
            scrollbar: false, wheelStep: 80,
        })
        const content = this.scroll.content
        // Mods replace this whole layer (top, holes, China) without touching decorations or controls.
        const background = uiNode({ name: 'Background', parent: content, anchor: { x: 0, y: 1 } }).node
        ui.image(background, sprites.selectorscreen_achievements_bg).node.name = 'Top'
        await preloadTasks(Array.from({ length: 70 }, (_, index) => async () => {
            if (!this.node.isValid) throw new Error('Achievement screen was destroyed while loading')
            ui.image(background, sprites.acheesements_hole_tile, { y: backgroundHeight + 225 * index }).node.name = 'Hole'
        }))
        if (!this.node.isValid) throw new Error('Achievement screen was destroyed while loading')
        // China is drawn after the decorations in the original, but they never overlap.
        ui.image(background, sprites.acheesements_china, { y: chinaY }).node.name = 'China'
        for (const [name, y] of [
            ['bookworm', 1125], ['bejeweled', 2250], ['chuzzle', 4500],
            ['peggle', 6750], ['pipe', 9000], ['zuma', 11250],
        ] as const) ui.image(content, sprites[`acheesements_${name}`], { y })

        await preloadTasks(data.items.map((item, index) => async () => {
            if (!this.node.isValid) throw new Error('Achievement screen was destroyed while loading')
            const x = 190 + index % 2 * 290, y = 178 + Math.floor(index / 2) * 57
            const icon = ui.image(content, getAtlasFrame(iconFrames.get(item.icon.sprite)!, item.icon.index, 70, 70, 7), {
                x: x - 70, y, width: 56, height: 56,
            })
            icon.node.name = `Achievement-${item.id}`
            icon.color = new Color(255, 255, 255, item.earned ? 255 : 32)
            this.icons.set(item.id, icon)
            ui.label(content, {
                text: ui.text(item.titleKey), font: 'body', color: new Color(21, 175, 0),
                x, y: y + 16, baseline: true,
            })
            ui.label(content, {
                text: ui.text(item.descriptionKey), font: 'achievement', color: Color.WHITE,
                x, y: y + 31, width: 212, baseline: true, lineSpacing: 12,
            })
        }))
        if (!this.node.isValid) throw new Error('Achievement screen was destroyed while loading')

        await showMenuPageControls(content, ui, 'achievements', onBack)
        const rock = sprites.acheesements_more_rock
        ui.image(content, rock, { x: 700, y: 450 })
        const moreImage = sprites.acheesements_more_button
        // The rock is drawn at (700, 450); its hit rect is (710, 470, width - 25, height - 50).
        const more = this.more = ui.button(content, {
            images: { normal: moreImage, hover: sprites.acheesements_more_button_highlight },
            x: 710, y: 470, width: rock.originalSize.width - 25, height: rock.originalSize.height - 50,
            imageBox: { x: -10, y: -20, width: moreImage.originalSize.width, height: moreImage.originalSize.height },
            releaseToNormalOnPressOut: true, pressSound: null,
            onClick: () => this.pressMore(),
        })
        more.changeCursor = false
        more.pressSound = SoundEffect.GraveButton
        const update = more.onStateChange!
        const image = more.node.getChildByName('Visual')!.getChildByName('Image')!.getComponent(Sprite)!
        more.onStateChange = state => {
            update(state)
            const name = this.showingTop ? 'top' : 'more'
            image.spriteFrame = sprites[`acheesements_${name}_button${state === 'hover' || state === 'pressed' ? '_highlight' : ''}`]
        }
    }

    async refresh(): Promise<void> {
        const data = await menuApi.getAchievements()
        if (!this.node.isValid) throw new Error('Achievement screen was destroyed while loading')
        for (const item of data.items) {
            const icon = this.icons.get(item.id)
            if (icon) icon.color = new Color(255, 255, 255, item.earned ? 255 : 32)
        }
        this.scroll.offset = 0
        this.scrollSpeed = 0
        this.showingTop = false
        this.more.pressSound = SoundEffect.GraveButton
        this.more.onStateChange?.('normal')
    }

    onEnable(): void {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this)
        input.on(Input.EventType.KEY_PRESSING, this.onKeyDown, this)
    }

    onDisable(): void {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
        input.off(Input.EventType.KEY_PRESSING, this.onKeyDown, this)
        this.scrollSpeed = 0
    }

    update(dt: number): void {
        if (this.scrollSpeed <= 0) return
        this.scrollTime += gameClock.delta(dt)
        while (this.scrollTime >= 0.01 && this.scrollSpeed > 0) {
            this.scrollTime -= 0.01
            this.scrollSpeed--
            this.scroll.offset += this.scrollDirection * this.scrollSpeed
        }
    }

    /** Starts the list scrolling from this speed, 1 down or -1 up; a scroll on its way takes them instead of adding to them. */
    private scrollFrom(speed: number, direction: number): void {
        if (this.scrollSpeed <= 0) this.scrollTime = 0
        this.scrollSpeed = speed
        this.scrollDirection = direction
    }

    /** AchievementsWidget::MouseUp on the More rock: down to the rest of the list, or in its Top state back up. */
    private pressMore(): void {
        const more = this.more
        this.showingTop = !this.showingTop
        // Only scrolling down to the rest of the list plays the rock sound.
        more.pressSound = this.showingTop ? null : SoundEffect.GraveButton
        more.onStateChange?.(more.isHovering ? 'hover' : 'normal')
        this.scrollFrom(MORE_SPEED, this.showingTop ? 1 : -1)
    }

    private onKeyDown(event: EventKeyboard): void {
        const modal = UIHoverManager.activeModalRoot
        if (!this.scroll || UIHoverManager.isInputBlocked || modal && !this.node.isChildOf(modal)) return
        if (event.keyCode !== KeyCode.ARROW_UP && event.keyCode !== KeyCode.ARROW_DOWN) return
        // Repeats reset the speed rather than adding to it, so holding a key scrolls at most 29px per tick.
        this.scrollFrom(KEY_SPEED, event.keyCode === KeyCode.ARROW_UP ? -1 : 1)
        event.propagationStopped = true
    }
}
