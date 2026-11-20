import {
    jsonRoundTrip,
    parseClientPacket,
    copyServerPacket,
    validateServerPacket,
    type ClientPacket,
    type ServerPacket,
} from '../protocol'

export class LocalGameChannel {
    private readonly serverPackets: ClientPacket[] = []
    private readonly clientPackets: ServerPacket[] = []

    sendToServer(packet: ClientPacket): void {
        this.serverPackets.push(parseClientPacket(jsonRoundTrip(packet)))
    }

    drainServerPackets(): ClientPacket[] {
        return this.serverPackets.splice(0)
    }

    /**
     * Frames are sent every tick. The server builds each snapshot and event from new objects, so a frame is
     * handed over after validation instead of copied; other packets may reference server state and are copied.
     */
    sendToClient(packet: ServerPacket): void {
        this.clientPackets.push(packet.type === 'frame' ? validateServerPacket(packet) : copyServerPacket(packet))
    }

    drainClientPackets(): ServerPacket[] {
        return this.clientPackets.splice(0)
    }
}
