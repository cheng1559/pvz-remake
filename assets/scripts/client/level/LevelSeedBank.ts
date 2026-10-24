import { Node, tween, type Color } from 'cc'
import { uiNode } from '@/client/view/uiNode'
import { startGameTween } from '@/core/GameTween'
import { SeedPacketView } from '@/client/hud/SeedPacketView'
import { UIButton } from '@/client/ui/UIButton'
import type { UITooltip } from '@/client/ui/UITooltip'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import type { SeedPacketSnapshot, ServerEvent, WorldSnapshot } from '@/shared/protocol'
import type { LevelHudOptions } from './LevelHudPresenter'
import { plantDefinition } from '@/client/plants/definitions'
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
            const visual = plantDefinition(options.content.presentation, seed.plant).visual
            const view = new SeedPacketView({
                definitions: options.content.presentation, name: `SeedPacket-${seedId}`, parent: options.seedPacketSlot, layer: options.rootLayer,
                x: index * 59, y: 0, seedType: visual.seedType, cost: seed.sunCost,
                loadSprite: options.loadPacketSprite,
                costFont: options.packetCostFont,
            })
            // Left packets draw last so their plants can overlap the packets to their right.
            view.node.setSiblingIndex(0)
            const tooltip = options.ui.tooltip(view.node, {
                text: options.ui.text(visual.nameKey ?? String(visual.seedType).toUpperCase()), gap: 0,
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
        for (const [index, entry] of this.packets.entries()) {
            const packet = snapshot.seedPackets[index]
            if (!packet) {
                if (entry.button) entry.button.interactable = false
                entry.tooltip.hide()
                continue
            }
            if (entry.seedId !== packet.seedId) {
                const seed = this.options.content.definitions.seeds[packet.seedId]
                const visual = plantDefinition(this.options.content.presentation, seed.plant).visual
                entry.seedId = packet.seedId
                entry.view.replace(visual.seedType, seed.sunCost)
                entry.tooltip.hide()
                entry.tooltip.text = this.options.ui.text(visual.nameKey ?? String(visual.seedType).toUpperCase())
                entry.previousCooldown = undefined
            }
            const state = this.packetState(snapshot, packet)
            entry.tooltip.warning = state.warning
            if (entry.button) {
                entry.button.changeCursor = state.ready && state.canAfford && snapshot.cursor.mode !== 'seed'
                entry.button.interactable = introComplete && snapshot.phase === 'gameplay' && snapshot.result === 'playing' && !snapshot.paused
            }
            entry.view.sync({
                gameStarted: introComplete, active: state.ready, selected: packet.selected,
                cooldownRemaining: packet.cooldownRemaining, cooldownTotal: packet.cooldownTotal, canAfford: state.canAfford,
                tutorialColor: state.ready && state.canAfford && (!this.options.presentation.guideSeed || this.options.presentation.guideSeed === entry.seedId) ? tutorialColor : null,
                mobile: GameDebugSettings.isMobileMode(),
            })
            const cooldownFinished = entry.previousCooldown !== undefined && entry.previousCooldown > 0 && packet.cooldownRemaining === 0 && state.canAfford
            const flashRequested = events.some(event => event.type === 'seedPacketFlashRequested' && event.data.seedId === entry.seedId)
            if (effects && state.ready && (cooldownFinished || flashRequested)) this.flash(entry.view.node)
            entry.previousCooldown = packet.cooldownRemaining
        }
    }

    private packetState(snapshot: WorldSnapshot, packet: SeedPacketSnapshot) {
        const canAfford = (snapshot.extensions['pvz:debug'] as { sunCost?: boolean } | undefined)?.sunCost === false
            || snapshot.availableSun >= this.options.content.definitions.seeds[packet.seedId].sunCost
        return {
            ready: packet.ready,
            canAfford,
            warning: !packet.ready ? this.options.ui.text('WAITING_FOR_SEED') : !canAfford ? this.options.ui.text('NOT_ENOUGH_SUN') : '',
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
