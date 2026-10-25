import { Color, Node } from 'cc'
import { uiNode } from '@/client/view/uiNode'
import { SeedPacketView } from '@/client/hud/SeedPacketView'
import { UIButton } from '@/client/ui/UIButton'
import type { UITooltip } from '@/client/ui/UITooltip'
import type { UILabel } from '@/client/ui/UILabel'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import type { GameCommand, SeedPacketSnapshot, ServerEvent, WorldSnapshot } from '@/shared/protocol'
import type { LevelHudOptions } from './LevelHudPresenter'
import { plantDefinition } from '@/client/plants/definitions'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

interface Packet {
    seedId?: string
    view: SeedPacketView
    tooltip: UITooltip
    hotkey?: UILabel
    button?: UIButton
    previousCooldown?: number
}

export interface LevelSeedPacket extends SeedPacketSnapshot {
    command: GameCommand
    x?: number
}

export class LevelSeedBank {
    readonly packets: Packet[]

    constructor(private readonly options: LevelHudOptions) {
        const seeds = options.level.conveyor
            ? Array<string | undefined>(options.level.conveyor.capacity).fill(undefined)
            : options.seedChooser
              ? options.seedChooser.availableSeeds.slice(0, options.seedChooser.slots)
              : options.level.seedPackets
        this.packets = seeds.map((seedId, index) => {
            const seed =
                seedId === undefined ? undefined : options.content.definitions.seeds[seedId]
            const visual =
                seedId === undefined
                    ? undefined
                    : plantDefinition(options.content.presentation, seed!.plant).visual
            const view = new SeedPacketView({
                definitions: options.content.presentation,
                name: `SeedPacket-${index}`,
                parent: options.seedPacketSlot,
                layer: options.rootLayer,
                x: index * 59,
                y: 0,
                seedType: visual?.seedType,
                cost: seed?.sunCost,
                drawCost: !options.level.conveyor,
                loadSprite: options.loadPacketSprite,
                costFont: options.packetCostFont,
            })
            // Left packets draw last so their plants can overlap the packets to their right.
            view.node.setSiblingIndex(0)
            if (seedId === undefined || options.seedChooser) view.node.active = false
            const tooltip = options.ui.tooltip(view.node, {
                text: visual
                    ? options.ui.text(visual.nameKey ?? String(visual.seedType).toUpperCase())
                    : '',
                gap: 0,
                surface: options.level.conveyor ? options.adviceParent : undefined,
            })
            return { seedId, view, tooltip }
        })
    }

    bind(select: (index: number) => void): UIButton[] {
        return this.packets.map((packet, index) => {
            const button = (packet.button ??= packet.view.node.addComponent(UIButton))
            button.rightClickTriggers = false
            button.releaseToNormalOnPressOut = true
            button.onPress = () => select(index)
            button.onHoverChange = (hovering) =>
                hovering ? packet.tooltip.show() : packet.tooltip.hide()
            button.interactable = false
            return button
        })
    }

    packetAt(snapshot: WorldSnapshot, index: number): LevelSeedPacket | undefined {
        if (this.options.level.conveyor) {
            const packet = snapshot.conveyorPackets[index]
            return (
                packet && {
                    ...packet,
                    ready: !packet.selected,
                    cooldownRemaining: 0,
                    cooldownTotal: 0,
                    command: { type: 'selectConveyorPacket', packetId: packet.id },
                }
            )
        }
        const packet = snapshot.seedPackets[index]
        return packet && { ...packet, command: { type: 'selectSeed', seedId: packet.seedId } }
    }

    attachConveyor(parent: Node): void {
        for (const packet of this.packets) {
            packet.view.node.setParent(parent)
            packet.view.node.setSiblingIndex(0)
        }
    }

    // Preserve the first packet's  save field; the rest restore from their authoritative cooldowns.
    get previousCooldown(): number | null {
        return this.packets[0]?.previousCooldown ?? null
    }

    restore(snapshot: WorldSnapshot, firstCooldown: number | null): void {
        for (const [index, packet] of this.packets.entries()) {
            packet.previousCooldown =
                index === 0
                    ? (firstCooldown ?? undefined)
                    : snapshot.seedPackets.find((value) => value.seedId === packet.seedId)
                          ?.cooldownRemaining
        }
    }

    sync(
        snapshot: WorldSnapshot,
        events: ServerEvent[],
        introComplete: boolean,
        tutorialColor: Color | null,
        effects = true,
    ): void {
        for (const [index, entry] of this.packets.entries()) {
            const packet = this.packetAt(snapshot, index)
            entry.view.node.active = !!packet && !snapshot.seedChooser?.choosing
            if (!packet) {
                if (entry.button) entry.button.interactable = false
                entry.tooltip.hide()
                continue
            }
            if (entry.seedId !== packet.seedId) {
                const seed = this.options.content.definitions.seeds[packet.seedId]
                const visual = plantDefinition(this.options.content.presentation, seed.plant).visual
                entry.seedId = packet.seedId
                entry.view.setSeed(visual.seedType, seed.sunCost)
                entry.hotkey = undefined
                entry.tooltip.hide()
                entry.tooltip.text = this.options.ui.text(
                    visual.nameKey ?? String(visual.seedType).toUpperCase(),
                )
                entry.previousCooldown = undefined
            }
            if (packet.x !== undefined) {
                const layout = this.options.content.presentation.conveyor
                entry.view.node.setPosition(layout.packetX + packet.x, -layout.packetY)
            }
            const available = packet.ready && !packet.availability.reason
            const canAfford = packet.availability.reason !== 'not-enough-sun'
            entry.tooltip.warning = packet.availability.warningKey
                ? this.options.ui.text(packet.availability.warningKey)
                : ''
            if (entry.button) {
                entry.button.changeCursor = available && snapshot.cursor.mode === 'none'
                entry.button.interactable =
                    introComplete &&
                    snapshot.phase === 'gameplay' &&
                    snapshot.result === 'playing' &&
                    !snapshot.paused
            }
            entry.view.sync({
                gameStarted: introComplete,
                active: packet.ready && packet.availability.reason !== 'seed-not-available',
                selected: packet.selected,
                cooldownRemaining: packet.cooldownRemaining,
                cooldownTotal: packet.cooldownTotal,
                canAfford,
                tutorialColor:
                    available &&
                    (!this.options.presentation.guideSeed ||
                        this.options.presentation.guideSeed === entry.seedId)
                        ? tutorialColor
                        : null,
                mobile: GameDebugSettings.isMobileMode(),
                conveyor: !!this.options.level.conveyor,
            })
            if (GameDebugSettings.hotkeysEnabled && index < 10) {
                entry.hotkey ??= this.options.ui.label(entry.view.node, {
                    text: String((index + 1) % 10),
                    font: 'storeItem',
                    fontSize: 16,
                    color: new Color(213, 159, 43),
                    x: 1,
                    y: -10,
                })
                entry.hotkey.node.active = true
            } else if (entry.hotkey) entry.hotkey.node.active = false
            const cooldownFinished =
                entry.previousCooldown !== undefined &&
                entry.previousCooldown > 0 &&
                packet.cooldownRemaining === 0 &&
                available
            const flashRequested = events.some(
                (event) =>
                    event.type === 'seedPacketFlashRequested' && event.data.seedId === entry.seedId,
            )
            if (effects && available && (cooldownFinished || flashRequested))
                this.flash(entry.view.node)
            entry.previousCooldown = packet.cooldownRemaining
        }
    }

    private flash(parent: Node): void {
        const effect = this.options.content.presentation.seedPackets.flash
        const node = uiNode({
            name: 'ParticleSystem',
            parent,
            position: { x: 0, y: 0, z: 16 },
        }).node
        const player = node.addComponent(ParticlePlayer)
        void player
            .load(effect.id, this.options.content.registry, this.options.content.loader)
            .then(() => {
                if (!node.isValid) return
                player.play(0, effect.duration)
            })
            .catch((error) => {
                if (node.isValid) node.destroy()
                console.error('[Level] Failed to play seed packet flash', error)
            })
    }
}
