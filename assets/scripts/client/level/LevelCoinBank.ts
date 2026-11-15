import { modResources } from '@/client/content/ModResources'
import { Color, type Node } from 'cc'
import type { UI } from '@/client/ui/UI'
import type { Content } from './LevelStage'
import type { UILabel } from '@/client/ui/UILabel'
import { formatMoney } from '@/client/ui/formatMoney'
import { uiNode } from '@/client/view/uiNode'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import type { ServerEvent, WorldSnapshot } from '@/shared/protocol/index'

/** Board::ShowCoinBank's default duration; the bank fades out over its last 15 ticks. */
const COIN_BANK_TICKS = 1000

/**
 * Board::DrawUICoinBank: the purse, shown for a while as money comes in, when a game with coins is paused
 * (Board::Pause) or for Crazy Dave's seed-slot offer; beside Dave while he is out.
 */
export class LevelCoinBank {
    private ticks = 0
    private tick = 0
    /** LawnApp::mCrazyDaveState is not CRAZY_DAVE_OFF. */
    private daveOut = false
    private lastSnapshot?: WorldSnapshot

    /** Its node in the HUD, drawn under the coins that fly to it, with its count. */
    static async create(content: Content, ui: UI, hud: Node, coinLayer: Node): Promise<{ node: Node, text: UILabel }> {
        // Board::DrawUICoinBank at (57, 599 - height); money flies to (39, 558) on the board.
        const coinBankFrame = await modResources.sprite('pvz:coinbank')
        const coinBankY = 599 - coinBankFrame.originalSize.height
        const coinBank = uiNode({ name: 'CoinBank', parent: hud, anchor: { x: 0, y: 1 }, active: false }).node
        // Board::AddUIRenderItems draws the bank at RENDER_LAYER_COIN_BANK; coins sit one above it, so money flies over the bank.
        coinBank.setSiblingIndex(coinLayer.getSiblingIndex())
        ui.image(coinBank, coinBankFrame, { x: 57, y: coinBankY })
        const coinText = ui.label(coinBank, { text: '', font: 'money', color: new Color(180, 255, 90), x: 57 + 116, y: coinBankY + 24, baseline: true, align: 'right' })
        return { node: coinBank, text: coinText }
    }

    constructor(private readonly items: GameplayDefinitions['items'], private readonly bank: { readonly node: Node, readonly text: UILabel }) {}

    /** The ticks it still shows, for a save. */
    get remainingTicks(): number { return this.ticks }

    restore(ticks: number): void {
        this.ticks = ticks
        if (this.lastSnapshot) this.tick = this.lastSnapshot.gameplayTick
    }

    /** Board::ShowCoinBank: shows the purse for a while (Crazy Dave's seed-slot offer uses 100 ticks). */
    show(ticks = COIN_BANK_TICKS): void {
        this.ticks = ticks
        if (this.lastSnapshot) this.sync(this.lastSnapshot, [])
    }

    /** Board::Pause: a paused game with coins shows the coin bank. */
    showWhilePaused(): void {
        if (this.lastSnapshot && this.lastSnapshot.money > 0) this.show()
    }

    /**
     * Board::Update counts the coin bank down in the intro too, except while the seed-slot purchase dialog is open;
     * the gameplay tick only counts it during play.
     */
    advance(ticks: number): void {
        if (this.ticks <= 0) return
        this.ticks = Math.max(0, this.ticks - ticks)
        if (this.lastSnapshot) this.sync(this.lastSnapshot, [])
    }

    /** Board::DrawUICoinBank draws the bank at x = 450 on screen while Crazy Dave is out, and at 57 otherwise. */
    setBesideDave(beside: boolean): void {
        if (this.daveOut === beside) return
        this.daveOut = beside
        const x = beside ? 450 - 57 : 0
        if (this.bank.node.position.x !== x) this.bank.node.setPosition(x, this.bank.node.position.y)
        if (this.lastSnapshot) this.sync(this.lastSnapshot, [])
    }

    sync(snapshot: WorldSnapshot, events: readonly ServerEvent[]): void {
        this.lastSnapshot = snapshot
        // The count only runs with the game, so a pause holds the bank on screen.
        this.ticks = Math.max(0, this.ticks - Math.max(0, snapshot.gameplayTick - this.tick))
        this.tick = snapshot.gameplayTick
        // `moneyChanged`: the server changed the money other than by a pickup (/money, or a Mod), shown like one.
        if (events.some(event => event.type === 'itemCollected' && this.items[String(event.data.typeId)]?.kind === 'money'
            || event.type === 'moneyChanged')) this.ticks = COIN_BANK_TICKS
        // DrawUICoinBank draws only in SCENE_PLAYING (not the intro, nor once the zombies got in), unless Crazy Dave is out.
        const playing = snapshot.phase === 'gameplay' && snapshot.result !== 'lost'
        this.bank.node.active = this.ticks > 0 && (playing || this.daveOut)
        if (!this.bank.node.active) return
        uiNode({ node: this.bank.node, opacity: Math.min(255, Math.round(255 * this.ticks / 15)) })
        const text = formatMoney(snapshot.money)
        if (this.bank.text.text !== text) this.bank.text.text = text
    }
}
