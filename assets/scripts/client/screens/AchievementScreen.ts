import { _decorator, Color, Component, input, Input, KeyCode, Sprite, type EventKeyboard } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import { getAtlasFrame } from '@/client/hud/SeedPacketRenderer'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import type { UI } from '@/client/ui/UI'
import type { UIScroll } from '@/client/ui/UIScroll'
import { SpriteLoader } from '@/core/SpriteLoader'
import { showMenuPageControls } from './MenuPageControls'

const { ccclass } = _decorator
const SPRITES = [
    'selectorscreen_achievements_bg', 'acheesements_hole_tile', 'acheesements_china',
    'acheesements_bookworm', 'acheesements_bejeweled', 'acheesements_chuzzle',
    'acheesements_peggle', 'acheesements_pipe', 'acheesements_zuma', 'acheesements_icons',
    'acheesements_more_rock', 'acheesements_more_button', 'acheesements_more_button_highlight',
    'acheesements_top_button', 'acheesements_top_button_highlight',
]

@ccclass('PvZAchievementScreen')
export class AchievementScreen extends Component {
    private scroll!: UIScroll

    async initialize(ui: UI, onBack: () => void): Promise<void> {
        const [data, frames] = await Promise.all([
            menuApi.getAchievements(),
            Promise.all(SPRITES.map(async name => {
                const frame = await SpriteLoader.load(name)
                if (!frame) throw new Error(`Missing achievement image: ${name}`)
                return [name, frame] as const
            })),
        ])
        if (!this.node.isValid) throw new Error('Achievement screen was destroyed while loading')
        const sprites = Object.fromEntries(frames)
        this.scroll = ui.scroll(this.node, {
            width: 800, height: 600, contentHeight: 600 + 15342,
            scrollbar: false, wheelStep: 80,
        })
        const content = this.scroll.content
        ui.image(content, sprites.selectorscreen_achievements_bg)
        for (let i = 1; i <= 70; i++) ui.image(content, sprites[i === 70 ? 'acheesements_china' : 'acheesements_hole_tile'], {
            y: sprites.acheesements_hole_tile.originalSize.height * i - (i === 70 ? 30 : 0),
        })
        for (const [name, y] of [
            ['bookworm', 1125], ['bejeweled', 2250], ['chuzzle', 4500],
            ['peggle', 6750], ['pipe', 9000], ['zuma', 11250],
        ] as const) ui.image(content, sprites[`acheesements_${name}`], { y })

        for (const [index, item] of data.items.entries()) {
            const x = 190 + index % 2 * 290, y = 178 + Math.floor(index / 2) * 57
            const icon = ui.image(content, getAtlasFrame(sprites.acheesements_icons, item.icon, 70, 70, 7), {
                x: x - 70, y, width: 56, height: 56,
            })
            icon.node.name = `Achievement-${item.id}`
            icon.color = new Color(255, 255, 255, item.earned ? 255 : 32)
            ui.label(content, {
                text: ui.text(item.titleKey), font: 'body', color: new Color(21, 175, 0),
                x, y: y + 16, baseline: true,
            })
            const description = ui.label(content, {
                text: ui.text(item.descriptionKey), font: 'achievement', color: Color.WHITE,
                x, y: y + 31, width: 215, baseline: true,
            })
            description.renderer.lineSpacing = 12
            description.renderer.forceRebuild()
        }

        await showMenuPageControls(content, ui, 'achievements', onBack)
        ui.image(content, sprites.acheesements_more_rock, { x: 700, y: 450 })
        let showingTop = false
        const more = ui.button(content, {
            images: { normal: sprites.acheesements_more_button, hover: sprites.acheesements_more_button_highlight },
            x: 700, y: 450, releaseToNormalOnPressOut: true, pressSound: null,
            onClick: () => {
                showingTop = !showingTop
                more.onStateChange?.(more.isHovering ? 'hover' : 'normal')
                this.scroll.scrollTo(this.scroll.offset + (showingTop ? 230 : -230), 0.25)
            },
        })
        more.changeCursor = false
        more.onPress = () => { if (!showingTop) void SoundLoader.play(SoundEffect.GraveButton) }
        const update = more.onStateChange!
        const image = more.node.getChildByName('Visual')!.getChildByName('Image')!.getComponent(Sprite)!
        more.onStateChange = state => {
            update(state)
            const name = showingTop ? 'top' : 'more'
            image.spriteFrame = sprites[`acheesements_${name}_button${state === 'hover' || state === 'pressed' ? '_highlight' : ''}`]
        }
    }

    onEnable(): void { input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this) }
    onDisable(): void { input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this) }

    private onKeyDown(event: EventKeyboard): void {
        const modal = UIHoverManager.activeModalRoot
        if (!this.scroll || UIHoverManager.isInputBlocked || modal && !this.node.isChildOf(modal)) return
        if (event.keyCode !== KeyCode.ARROW_UP && event.keyCode !== KeyCode.ARROW_DOWN) return
        this.scroll.offset += event.keyCode === KeyCode.ARROW_UP ? -15 : 15
        event.propagationStopped = true
    }
}
