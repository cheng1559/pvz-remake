import { modResources } from '@/client/content/ModResources'
import { _decorator, Color, Component, Node, type Sprite, SpriteFrame } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import type { StoreView, StoreItemView } from '@/shared/menu'
import { FontMetricsUtil } from '@/client/font'
import { SeedPacketRenderer } from '@/client/hud/SeedPacketRenderer'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import type { UI } from '@/client/ui/UI'
import { UIButton } from '@/client/ui/UIButton'
import type { UILabel } from '@/client/ui/UILabel'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { MenuAction } from './MenuPages'
import { formatMoney } from '@/client/ui/formatMoney'
import { CrazyDaveView } from '@/client/characters/CrazyDaveView'
import { loadClientContent } from '@/client/content/loadClientContent'

const { ccclass } = _decorator
const SPRITES = [
    'store_car', 'store_carclosed', 'store_hatchbackopen', 'store_sign', 'store_pricetag',
    'store_nextbutton', 'store_nextbuttonhighlight', 'store_nextbuttondisabled',
    'store_prevbutton', 'store_prevbuttonhighlight', 'store_prevbuttondisabled',
    'store_mainmenubutton', 'store_mainmenubuttonhighlight', 'store_mainmenubuttondown',
    'particles/seedpacketflash', 'coinbank',
]

@ccclass('PvZStoreScreen')
export class StoreScreen extends Component {
    private ui!: UI
    private sprites!: Record<string, SpriteFrame>
    private data!: StoreView
    private page = 0
    private age = 0
    private hatchTimer = 0
    private waiting = false
    private car!: Sprite
    private hatch!: Node
    private sign!: Node
    private items!: Node
    private arrows: UIButton[] = []
    private back!: UIButton
    private money!: UILabel
    private pageLabel!: UILabel
    private dave?: CrazyDaveView
    private bubbleTimer = 0
    private ambientTimer = 0
    private previousAmbient?: number
    private hoveredItem: StoreItemView | null = null
    private navigate: (action: MenuAction) => void = () => {}

    async initialize(ui: UI, navigate: (action: MenuAction) => void, backText = ui.text('STORE_MAIN_MENU_BUTTON')): Promise<void> {
        this.ui = ui
        this.navigate = navigate
        this.data = await menuApi.getStore()
        this.ambientTimer = this.data.speech.ambient.initialDelay
        const itemSprites = this.data.pages.flatMap(page => page.items.flatMap(item => item.sprite ? [item.sprite] : []))
        const [content, frames] = await Promise.all([
            loadClientContent(),
            Promise.all([...new Set([...SPRITES, ...itemSprites])].map(async name => {
                const frame = await modResources.asset(name, SpriteFrame)
                if (!frame) throw new Error(`Missing store image: ${name}`)
                return [name, frame] as const
            })),
        ])
        if (!this.node.isValid) throw new Error('Store was destroyed while loading')
        this.sprites = Object.fromEntries(frames)
        this.car = ui.image(this.node, this.sprites.store_car, { x: 196, y: 138 })
        this.hatch = ui.image(this.node, this.sprites.store_hatchbackopen, { x: 299 }).node
        this.sign = ui.image(this.node, this.sprites.store_sign, { x: 285, y: -150 }).node
        // Original StoreScreen draws Dave at (-42, +68), including the bubble at (105, -58).
        this.dave = await CrazyDaveView.create(this.node, { ...content, presentation: ui.assets.presentation }, ui, {
            position: { x: -42, y: -68 }, bubble: { sprite: 'pvz:store_speechbubble', x: 105, y: -58 }, clickToContinue: false,
        })
        this.dave.enter()
        ui.image(this.node, this.sprites.coinbank, { x: 650, y: 559 })
        this.money = ui.label(this.node, { text: '', font: 'money', color: new Color(180, 255, 90), x: 763, y: 583, baseline: true, align: 'right' })
        this.pageLabel = ui.label(this.node, { text: '', font: 'small', color: new Color(80, 80, 80), x: 470, y: 500, baseline: true, align: 'center' })
        this.arrows = ['prev', 'next'].map((name, index) => ui.button(this.node, {
            images: { normal: this.sprites[`store_${name}button`], hover: this.sprites[`store_${name}buttonhighlight`], disabled: this.sprites[`store_${name}buttondisabled`] },
            x: index ? 596 : 252, y: 402, pressOffset: [1, 1], releaseToNormalOnPressOut: true,
            pressSound: null, clickSound: SoundEffect.HatchbackClose, onClick: () => this.turnPage(index ? 1 : -1),
        }))
        this.back = ui.button(this.node, {
            images: { normal: this.sprites.store_mainmenubutton, hover: this.sprites.store_mainmenubuttonhighlight, pressed: this.sprites.store_mainmenubuttondown },
            x: 366, y: 512, pressOffset: [1, 1], releaseToNormalOnPressOut: true, onClick: () => navigate('back'),
        })
        const metrics = FontMetricsUtil.getMetrics(ui.assets.fonts.pageTitleSmall.config)
        const size = this.sprites.store_mainmenubutton.originalSize
        const label = ui.label(this.back.node, {
            text: backText, font: 'pageTitleSmall', color: new Color(98, 153, 235),
            x: size.width / 2 - 6, y: 2 + (size.height - metrics.ascent / 6 + metrics.ascent - 1) / 2, baseline: true, align: 'center',
        })
        const update = this.back.onStateChange!, origin = label.node.position.clone()
        this.back.onStateChange = state => {
            update(state)
            label.renderer.fontColor = state === 'hover' || state === 'pressed' ? new Color(167, 192, 235) : new Color(98, 153, 235)
            label.node.setPosition(origin.x + (state === 'pressed' ? 2 : 0), origin.y - (state === 'pressed' ? 1 : 0))
        }
        this.renderItems()
    }

    private renderItems(): void {
        this.page = Math.min(this.page, this.data.pages.length - 1)
        if (this.items) { this.items.active = false; this.items.destroy() }
        this.items = uiNode({ name: 'StoreItemViews', parent: this.node, anchor: { x: 0, y: 1 } }).node
        this.money.text = formatMoney(this.data.coins)
        this.pageLabel.text = this.ui.text('STORE_PAGE').replace('{PAGE}', String(this.page + 1)).replace('{NUM_PAGES}', String(this.data.pages.length))
        this.pageLabel.node.active = this.data.pages.length > 1 && this.hatchTimer <= 0
        const drawOrder = [...this.data.pages[this.page].items.entries()]
            .sort(([a], [b]) => Math.floor(a / 4) - Math.floor(b / 4) || b - a)
        for (const [index, item] of drawOrder) this.renderItem(item, index)
        this.refreshEnabled()
    }

    private renderItem(item: StoreItemView, index: number): void {
        const state = item.state
        if (state === 'hidden') return
        const x = (index < 4 ? 422 : 372) + index % 4 * 74, y = index < 4 ? 206 : 310
        const button = this.ui.button(this.items, {
            images: { normal: this.sprites['particles/seedpacketflash'] }, x, y, width: 50, height: 87,
            imageBox: { width: 50, height: 70 }, pressOffset: [0, 0], enabled: state === 'available',
            pressSound: null, clickSound: null, releaseToNormalOnPressOut: true, refreshHoverOnEnable: false,
        })
        button.node.name = `StoreItemView-${item.id}`
        const visual = button.node.getChildByName('Visual')!
        // The button factory supplies the shared hit/capture behavior; item graphics sit below its highlight.
        if (item.seed !== undefined) {
            SeedPacketRenderer.drawSeedPacket({ definitions: this.ui.assets.presentation, parent: button.node, x: 0, y: 0, seedType: item.seed, drawCost: false, upgrade: true }).setSiblingIndex(0)
        } else if (item.sprite) {
            const icon = this.ui.image(button.node, this.sprites[item.sprite], { x: item.offset?.[0] ?? 0, y: item.offset?.[1] ?? 0 })
            icon.node.setSiblingIndex(0)
        }
        if (item.seedSlots !== undefined) this.centerText(button.node, this.ui.text('STORE_UPGRADE_SLOTS').replace('{SLOTS}', String(item.seedSlots)), 'storeItem', 0, 6, 55, 70)
        if (item.quantity) this.ui.label(button.node, { text: `x${item.quantity}`, font: 'storeItem', x: 56, y: 62, align: 'right', baseline: true })
        this.ui.image(button.node, this.sprites.store_pricetag, { x: -3, y: 70 })
        this.ui.label(button.node, { text: formatMoney(item.cost), font: 'small', color: Color.BLACK, x: 23, y: 85, baseline: true, align: 'center' })
        if (state === 'comingSoon' || state === 'soldOut') this.centerText(button.node, this.ui.text(state === 'comingSoon' ? 'COMING_SOON' : 'SOLD_OUT'), 'storeItem', 0, 0, 50, 70, new Color(255, 0, 0))
        const highlight = item.highlight.type === 'additive' && item.sprite
            ? this.ui.additiveImage(button.node, this.sprites[item.sprite], { x: item.offset?.[0] ?? 0, y: item.offset?.[1] ?? 0 }, item.highlight.opacity).node : null
        const update = button.onStateChange!
        button.onStateChange = next => {
            update(next)
            uiNode({ node: button.node, opacity: 255 })
            const hovered = next === 'hover' || next === 'pressed'
            visual.active = hovered && item.highlight.type === 'seedPacket'
            if (highlight) highlight.active = hovered
            if (hovered && !this.waiting) { this.hoveredItem = item; this.showDescription(item) }
            else if (this.hoveredItem === item) this.hoveredItem = null
        }
        button.onStateChange(state === 'available' ? 'normal' : 'disabled')
        // Desktop store purchases begin on press; touch mode waits for release, as in the reference UI.
        button.onPress = () => { if (!GameDebugSettings.isMobileMode()) void this.buy(item) }
        button.onClick = () => { if (GameDebugSettings.isMobileMode()) void this.buy(item) }
    }

    private centerText(parent: Node, text: string, font: 'storeItem', x: number, y: number, width: number, height: number, color = Color.WHITE): void {
        const label = this.ui.label(parent, { text, font, x, y, width, align: 'center', color })
        label.node.setPosition(x, -(y + Math.floor((height - label.renderer.contentHeight) / 2)))
    }

    private showDescription(item: StoreItemView): void {
        const message = item.message
        this.dave!.say(this.ui.text(`CRAZY_DAVE_${message}`, '').replace(/\{MONEY\}/g, formatMoney(this.data.coins))
            .replace(/\{UPGRADE_COST\}/g, formatMoney(item.cost)).replace(/\{PLAYER_NAME\}/g, this.data.playerName))
        this.bubbleTimer = this.data.speech.descriptionDuration
    }

    private showSpeech(message: number, duration: number): void {
        this.dave!.say(this.ui.text(`CRAZY_DAVE_${message}`).replace(/\{PLAYER_NAME\}/g, this.data.playerName)
            .replace(/\{MONEY\}/g, formatMoney(this.data.coins)))
        this.bubbleTimer = duration
    }

    private async buy(item: StoreItemView): Promise<void> {
        if (this.waiting || this.hatchTimer > 0 || this.age < this.data.speech.readyDelay) return
        this.waiting = true
        this.hoveredItem = null
        this.dave?.stopTalking()
        this.bubbleTimer = 0
        this.refreshEnabled()
        try {
            const offer = await menuApi.getStore()
            if (!this.node.isValid) return
            const latest = offer.pages.flatMap(page => page.items).find(entry => entry.id === item.id)
            this.data = offer
            this.renderItems()
            if (!latest || latest.state !== 'available') return
            if (!latest.affordable) {
                await this.ui.dialog(this.node, { title: this.ui.text('NOT_ENOUGH_MONEY'), message: this.ui.text('CANNOT_AFFORD_ITEM') }).result
                return
            }
            const confirmed = await this.ui.dialog(this.node, {
                title: this.ui.text('BUY_ITEM_HEADER'), message: this.ui.text('BUY_ITEM'),
                confirmText: this.ui.text('DIALOG_BUTTON_YES'), cancelText: this.ui.text('DIALOG_BUTTON_NO'),
            }).result
            if (!confirmed || !this.node.isValid) return
            const result = await menuApi.purchase(offer.userId, latest.id, latest.cost)
            if (!this.node.isValid) return
            if (result.store) { this.data = result.store; this.renderItems() }
            if (result.ok === false) {
                if (result.code === 'insufficientFunds') await this.ui.dialog(this.node, {
                    title: this.ui.text('NOT_ENOUGH_MONEY'), message: this.ui.text('CANNOT_AFFORD_ITEM'),
                }).result
                return
            }
            if (result.effect === 'seedSlots') await this.ui.dialog(this.node, {
                title: this.ui.text('MORE_SLOTS'), message: this.ui.text('NOW_YOU_CAN_CHOOSE_X_SEEDS').replace(/%d|\{SEEDS\}/g, String(result.seedSlots)),
            }).result
            if (result.effect === 'tree') {
                const visit = await this.ui.dialog(this.node, { title: this.ui.text('VISIT_TREE_HEADER'), message: this.ui.text('VISIT_TREE_BODY'), confirmText: this.ui.text('DIALOG_BUTTON_YES'), cancelText: this.ui.text('DIALOG_BUTTON_NO') }).result
                if (visit && this.node.isValid) this.navigate('tree')
            }
        } catch (error) {
            if (this.node.isValid) await this.ui.dialog(this.node, { title: 'Error', message: String(error) }).result
        } finally {
            if (this.node.isValid) { this.waiting = false; this.refreshEnabled() }
        }
    }

    private turnPage(delta: number): void {
        if (this.waiting || this.hatchTimer > 0 || this.data.pages.length <= 1) return
        this.page = (this.page + this.data.pages.length + delta) % this.data.pages.length
        this.hatchTimer = 0.5
        this.items.active = this.hatch.active = this.pageLabel.node.active = false
        this.hoveredItem = null
        this.bubbleTimer = 0
        this.dave?.stopTalking()
        this.car.spriteFrame = this.sprites.store_carclosed
        this.refreshEnabled()
    }

    private refreshEnabled(): void {
        const enabled = this.hatchTimer <= 0 && !this.waiting
        for (const arrow of this.arrows) { arrow.enabled = enabled; arrow.interactable = this.data.pages.length > 1 }
        this.back.enabled = enabled
        for (const button of this.items.getComponentsInChildren(UIButton)) button.enabled = enabled && this.age >= this.data.speech.readyDelay
        UIHoverManager.refreshHoverStates()
    }

    protected onDisable(): void { this.dave?.stopTalking() }

    private acceptsInput(): boolean {
        const modal = UIHoverManager.activeModalRoot
        return !UIHoverManager.isInputBlocked && (!modal || modal === this.node || this.node.isChildOf(modal))
    }

    private updateSpeech(dt: number): void {
        if (this.waiting || !this.acceptsInput()) return
        const { speech } = this.data
        if (this.bubbleTimer > 0) {
            if (!this.hoveredItem) {
                const remaining = this.bubbleTimer - dt
                if (remaining > 0) this.bubbleTimer = remaining
                else if (!this.dave?.isSpeaking) { this.bubbleTimer = 0; this.dave?.stopTalking() }
            }
            return
        }
        if (this.age < speech.readyDelay || !this.dave?.ready) return
        this.ambientTimer -= dt
        if (this.ambientTimer > 0) return
        const choices = speech.ambient.messages.filter(entry => entry.message !== this.previousAmbient && entry.weight > 0)
        let pick = Math.random() * choices.reduce((sum, entry) => sum + entry.weight, 0)
        const chosen = choices.find(entry => (pick -= entry.weight) < 0)
        if (chosen) {
            this.previousAmbient = chosen.message
            this.showSpeech(chosen.message, speech.ambient.duration)
        }
        const [min, max] = speech.ambient.interval
        this.ambientTimer = min + Math.random() * (max - min)
    }

    protected update(dt: number): void {
        if (!this.car) return
        dt = gameClock.delta(dt)
        this.dave?.update(dt)
        if (this.waiting) return
        const wasReady = this.age >= this.data.speech.readyDelay
        this.age += dt
        let t = Math.max(0, Math.min(1, (this.age - 0.5) / 0.6))
        t = t * t * (3 - 2 * t); t = t * t * (3 - 2 * t)
        this.sign.setPosition(285, 150 * (1 - t))
        if (!wasReady && this.age >= this.data.speech.readyDelay) this.refreshEnabled()
        if (this.hatchTimer <= 0) { this.updateSpeech(dt); return }
        this.hatchTimer -= dt
        const shake = this.hatchTimer > 0.35 ? 1 + Math.floor(Math.random() * 3) : 0
        this.car.node.setPosition(196, -138 - shake)
        this.arrows.forEach((button, index) => button.node.setPosition(index ? 596 : 252, -402 - shake))
        this.back.node.setPosition(366, -512 - shake)
        if (this.hatchTimer > 0) return
        this.car.spriteFrame = this.sprites.store_car
        this.hatch.active = true
        this.renderItems()
        void SoundSystem.play(SoundEffect.HatchbackOpen)
    }
}
