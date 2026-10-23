import { Node, tween, type Color } from 'cc'
import { uiNode } from '@/client/view/uiNode'
import { startGameTween } from '@/core/GameTween'
import { SeedPacketView } from '@/client/hud/SeedPacketView'
import { UIButton } from '@/client/ui/UIButton'
import type { UITooltip } from '@/client/ui/UITooltip'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import type { ServerEvent, WorldSnapshot } from '@/shared/protocol'
import type { LevelHudOptions } from './LevelHudPresenter'
import { levelPlantVisual } from './LevelPlantVisuals'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

interface Packet {
    seedId: string
    view: SeedPacketView
    tooltip: UITooltip
    button?: UIButton
    previousCooldown?: number
}

export class LevelSeedBank {
    readonly packets: Packet[]

    constructor(private readonly options: LevelHudOptions) {
        this.packets = options.level.seedPackets.map((seedId, index) => {
            const seed = options.content.definitions.seeds[seedId]
            const visual = levelPlantVisual(seed.plant)
            const view = new SeedPacketView({
                name: `SeedPacket-${seedId}`, parent: options.seedPacketSlot, layer: options.rootLayer,
                x: index * 59, y: 0, seedType: visual.seedType, cost: seed.sunCost,
                loadSprite: options.loadPacketSprite,
                costFont: options.packetCostFont,
            })
            // Left packets draw last so their plants can overlap the packets to their right.
            view.node.setSiblingIndex(0)
            const tooltip = options.ui.tooltip(view.node, {
                text: options.ui.text(String(visual.seedType).toUpperCase()), gap: 0,
            })
            return { seedId, view, tooltip }
        })
    }

    bind(select: (seedId: string) => void): UIButton[] {
        return this.packets.map(packet => {
            const button = packet.button ??= packet.view.node.addComponent(UIButton)
            button.rightClickTriggers = false
            button.releaseToNormalOnPressOut = true
            button.onPress = () => select(packet.seedId)
            button.onHoverChange = hovering => hovering ? packet.tooltip.show() : packet.tooltip.hide()
            button.interactable = false
            return button
        })
    }

    // Preserve the first packet's  save field; the rest restore from their authoritative cooldowns.
    get previousCooldown(): number | null { return this.packets[0]?.previousCooldown ?? null }

    restore(snapshot: WorldSnapshot, firstCooldown: number | null): void {
        for (const [index, packet] of this.packets.entries()) {
            packet.previousCooldown = index === 0 ? firstCooldown ?? undefined
                : snapshot.seedPackets.find(value => value.seedId === packet.seedId)?.cooldownRemaining
        }
    }

    sync(snapshot: WorldSnapshot, events: ServerEvent[], introComplete: boolean, tutorialColor: Color | null, effects = true): void {
        for (const entry of this.packets) {
            const packet = snapshot.seedPackets.find(value => value.seedId === entry.seedId)
            if (!packet) {
                if (entry.button) entry.button.interactable = false
                entry.tooltip.hide()
                continue
            }
            const canAfford = (snapshot.extensions['pvz:debug'] as { sunCost?: boolean } | undefined)?.sunCost === false
                || snapshot.availableSun >= this.options.content.definitions.seeds[entry.seedId].sunCost
            entry.tooltip.warning = !packet.ready ? this.options.ui.text('WAITING_FOR_SEED')
                : !canAfford ? this.options.ui.text('NOT_ENOUGH_SUN') : ''
            if (entry.button) {
                entry.button.changeCursor = packet.ready && canAfford && snapshot.cursor.mode !== 'seed'
                entry.button.interactable = introComplete && snapshot.phase === 'gameplay' && snapshot.result === 'playing' && !snapshot.paused
            }
            entry.view.sync({
                gameStarted: introComplete, active: packet.ready, selected: packet.selected,
                cooldownRemaining: packet.cooldownRemaining, cooldownTotal: packet.cooldownTotal, canAfford,
                tutorialColor: packet.ready && canAfford && (!this.options.presentation.guideSeed || this.options.presentation.guideSeed === entry.seedId) ? tutorialColor : null,
                mobile: GameDebugSettings.isMobileMode(),
            })
            const cooldownFinished = entry.previousCooldown !== undefined && entry.previousCooldown > 0 && packet.cooldownRemaining === 0 && canAfford
            const flashRequested = events.some(event => event.type === 'seedPacketFlashRequested' && event.data.seedId === entry.seedId)
            if (effects && (cooldownFinished || flashRequested)) this.flash(entry.view.node)
            entry.previousCooldown = packet.cooldownRemaining
        }
    }

    private flash(parent: Node): void {
        const node = uiNode({ name: 'ParticleSystem_seedpacketflash', parent, position: { x: 0, y: 0, z: 16 } }).node
        const player = node.addComponent(ParticlePlayer)
        void player.load('pvz:seedpacketflash', this.options.content.registry, this.options.content.loader).then(() => {
            if (!node.isValid) return
            player.play()
            startGameTween(node, tween(node).delay(0.26).call(() => { if (node.isValid) node.destroy() }))
        }).catch(error => {
            if (node.isValid) node.destroy()
            console.error('[Level] Failed to play seed packet flash', error)
        })
    }
}
