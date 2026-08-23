import {
    jsonRoundTrip,
    parseClientPacket,
    parseServerPacket,
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

    sendToClient(packet: ServerPacket): void {
        this.clientPackets.push(parseServerPacket(jsonRoundTrip(packet)))
    }

    drainClientPackets(): ServerPacket[] {
        return this.clientPackets.splice(0)
    }
}
