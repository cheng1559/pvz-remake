import { Color, Node } from 'cc'
import { uiNode } from '@/client/view/uiNode'
import { SeedPacketView } from '@/client/hud/SeedPacketView'
import { UIButton } from '@/client/ui/UIButton'
import type { UITooltip } from '@/client/ui/UITooltip'
import type { UILabel } from '@/client/ui/UILabel'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import type { GameCommand, SeedPacketSnapshot, ServerEvent, WorldSnapshot } from '@/shared/protocol'
import type { SeedDefinition } from '@/shared/content/gameplay'
import type { SeedPacketSeedType } from '@/shared/content/presentation'
import type { LevelHudOptions } from './LevelHudPresenter'
import { plantDefinition } from '@/client/plants/definitions'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { seedPacketX } from './LevelGeometry'

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
    /** Every packet's picture, over every packet's background (SeedPacketViewArgs.iconLayer), and their hotkeys over that. */
    private readonly iconLayer: Node
    private readonly labelLayer: Node
    private buttons?: UIButton[]
    private slots: number

    constructor(private readonly options: LevelHudOptions) {
        const seeds = options.level.conveyor
            ? Array<string | undefined>(options.level.conveyor.capacity).fill(undefined)
            : options.seedChooser
              // Like SeedBank::mSeedPackets[SEEDBANK_MAX] (seedBank.maxSlots), a chosen bank has every packet up front;
              // a seed-slot upgrade only reveals more of them, and packets without a server slot stay hidden.
              ? Array.from({ length: options.content.definitions.seedBank.maxSlots }, (_, index) => options.seedChooser!.availableSeeds[index])
              : options.initialSeeds
        this.iconLayer = uiNode({ name: 'SeedPacketIcons', parent: options.seedPacketSlot, layer: options.rootLayer }).node
        this.labelLayer = uiNode({ name: 'SeedPacketLabels', parent: options.seedPacketSlot, layer: options.rootLayer }).node
        this.packets = seeds.map((seedId, index) => this.createPacket(seedId, index))
        this.slots = options.seedChooser?.slots ?? seeds.length
        this.layout()
    }

    /** A seed-slot upgrade bought in the intro (SeedBank::UpdateWidth): the packets are packed by Board::GetSeedPacketPositionX. */
    setSlots(slots: number): void {
        if (this.options.level.conveyor || slots <= this.slots) return
        this.slots = Math.min(slots, this.packets.length)
        this.layout()
    }

    private layout(): void {
        if (this.options.level.conveyor) return
        // The packet slot sits at the first packet's position (85).
        for (const [index, packet] of this.packets.entries()) packet.view.node.setPosition(seedPacketX(index, this.slots) - seedPacketX(0, 1), 0)
    }

    /**
     * What a seed's packet draws and its tooltip's name key. A zombie seed's packet draws its zombie (SEED_ZOMBIE_*, seed
     * type -1), named as the almanac names it.
     */
    private packetLook(seed: SeedDefinition): { seedType: SeedPacketSeedType, zombie?: string, grave?: boolean, name: string } {
        const presentation = this.options.content.presentation
        if (seed.zombie !== undefined) return { seedType: -1, zombie: seed.zombie, name: presentation.zombies[seed.zombie]?.nameKey ?? seed.zombie }
        if (seed.grave) return { seedType: -1, grave: true, name: 'GRAVE_SEED' }
        const visual = plantDefinition(presentation, seed.plant).visual
        return { seedType: visual.seedType, name: visual.nameKey ?? String(visual.seedType).toUpperCase() }
    }

    private createPacket(seedId: string | undefined, index: number): Packet {
        const options = this.options
        const seed = seedId === undefined ? undefined : options.content.definitions.seeds[seedId]
        const look = seed && this.packetLook(seed)
        const view = new SeedPacketView({
            definitions: options.content.presentation,
            name: `SeedPacket-${index}`,
            parent: options.seedPacketSlot,
            layer: options.rootLayer,
            x: index * 59,
            y: 0,
            seedType: look?.seedType,
            zombie: look?.zombie,
            grave: look?.grave,
            iconLayer: this.iconLayer,
            labelLayer: this.labelLayer,
            cost: seed?.sunCost,
            drawCost: !options.level.conveyor,
            loadSprite: options.loadPacketSprite,
            costFont: options.packetCostFont,
        })
        // Left packets draw last so their plants can overlap the packets to their right.
        view.node.setSiblingIndex(0)
        if (seedId === undefined || options.seedChooser) view.node.active = false
        const tooltip = options.ui.tooltip(view.node, {
            text: look ? options.ui.text(look.name) : '',
            gap: 0,
            surface: options.level.conveyor ? options.tooltipSurface : undefined,
        })
        return { seedId, view, tooltip }
    }

    bind(select: (index: number) => void): UIButton[] {
        this.buttons = this.packets.map((packet) => {
            const button = (packet.button ??= packet.view.node.addComponent(UIButton))
            button.rightClickTriggers = false
            button.touchSlide = false
            button.clickOnPress = true
            button.onClick = () => select(this.packets.indexOf(packet))
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
        // The pictures and hotkeys stay over the packets on the belt.
        for (const layer of [this.iconLayer, this.labelLayer]) {
            layer.setParent(parent, true)
            layer.setSiblingIndex(parent.children.length - 1)
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
                const look = this.packetLook(seed)
                entry.seedId = packet.seedId
                entry.hotkey = undefined
                entry.tooltip.hide()
                entry.view.setSeed(look.seedType, seed.sunCost, look.zombie, look.grave)
                entry.tooltip.text = this.options.ui.text(look.name)
            }
            // A packet of the other side from its seed's own draws what it puts down facing the other way.
            entry.view.setMirrored(packet.team !== undefined)
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
                entry.hotkey ??= this.options.ui.label(entry.view.labels, {
                    text: String((index + 1) % 10),
                    font: 'hotkey',
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
