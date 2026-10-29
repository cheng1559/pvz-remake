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
    conveyorId?: number
    seedId?: string
    view: SeedPacketView
    tooltip: UITooltip
    hotkey?: UILabel
    button?: UIButton
}

export interface LevelSeedPacket extends SeedPacketSnapshot {
    command: GameCommand
    x?: number
}

export class LevelSeedBank {
    readonly packets: Packet[]
    private buttons?: UIButton[]

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
                surface: options.level.conveyor ? options.tooltipSurface : undefined,
            })
            return { seedId, view, tooltip }
        })
    }

    bind(select: (index: number) => void): UIButton[] {
        this.buttons = this.packets.map((packet) => {
            const button = (packet.button ??= packet.view.node.addComponent(UIButton))
            button.rightClickTriggers = false
            button.touchSlide = false
            button.releaseToNormalOnPressOut = true
            button.onPress = () => select(this.packets.indexOf(packet))
            button.onHoverChange = (hovering) =>
                hovering ? packet.tooltip.show() : packet.tooltip.hide()
            button.interactable = false
            return button
        })
        return this.buttons
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
        return packet && { ...packet, command: { type: 'selectSeed', seedId: packet.seedId, slot: index } }
    }

    attachConveyor(parent: Node): void {
        for (const packet of this.packets) {
            packet.view.node.setParent(parent)
            packet.view.node.setSiblingIndex(0)
        }
    }

    sync(
        snapshot: WorldSnapshot,
        events: ServerEvent[],
        introComplete: boolean,
        tutorialColor: Color | null,
        effects = true,
    ): void {
        if (this.options.level.conveyor) this.syncConveyorOrder(snapshot)
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
                const text = String((index + 1) % 10)
                if (entry.hotkey.text !== text) entry.hotkey.text = text
            } else if (entry.hotkey) entry.hotkey.node.active = false
            // The server decides when a packet is ready (FlashIfReady); a debug-cleared recharge does not flash.
            // Duplicate seeds recharge separately, so the event names the slot.
            const flashRequested = events.some(
                (event) => event.type === 'seedPacketFlashRequested' && event.data.slot === index,
            )
            if (effects && available && flashRequested) this.flash(entry.view.node)
        }
    }

    private syncConveyorOrder(snapshot: WorldSnapshot): void {
        // A consumed packet frees its view; surviving packets keep their loaded artwork and buttons.
        const ids = new Set(snapshot.conveyorPackets.map(packet => packet.id))
        const byId = new Map(this.packets.map(entry => [entry.conveyorId, entry]))
        const free = this.packets.filter(entry => entry.conveyorId === undefined || !ids.has(entry.conveyorId))
        const ordered = snapshot.conveyorPackets.map(packet => {
            const entry = byId.get(packet.id) ?? free.shift()!
            entry.conveyorId = packet.id
            return entry
        })
        for (const entry of free) entry.conveyorId = undefined
        ordered.push(...free)
        if (ordered.every((entry, index) => entry === this.packets[index])) return
        this.packets.splice(0, this.packets.length, ...ordered)
        this.buttons?.splice(0, this.buttons.length, ...ordered.map(entry => entry.button!))
        for (const entry of ordered) entry.view.node.setSiblingIndex(0)
    }

    private flash(parent: Node): void {
        const effect = this.options.content.presentation.seedPackets.flash
        ParticlePlayer.spawn({ parent, id: effect.id, x: 0, y: 0, z: 16, seed: 0 })
    }
}
