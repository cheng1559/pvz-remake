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
    private frames = 0

    /**
     * `frameChecks`: of the frames sent to the client, one in this many is checked whole (validateServerPacket), the
     * first among them; 1 checks every frame. The server is the game's own code and its Mods', in the same process:
     * a frame is checked for what a Mod may have written wrong, which one a second catches as soon as it would matter,
     * where checking every field of a thousand zombies every tick took 6% of a frame without a JIT.
     */
    constructor(private readonly frameChecks = 1) {}

    sendToServer(packet: ClientPacket): void {
        this.serverPackets.push(parseClientPacket(jsonRoundTrip(packet)))
    }

    drainServerPackets(): ClientPacket[] {
        return this.serverPackets.splice(0)
    }

    /**
     * Frames are sent every tick. The server builds each snapshot and event from new objects, so a frame is
     * handed over as it is, checked or not (frameChecks), instead of copied; other packets may reference server state
     * and are copied.
     */
    sendToClient(packet: ServerPacket): void {
        if (packet.type !== 'frame') {
            this.clientPackets.push(copyServerPacket(packet))
            return
        }
        if (this.frames++ % this.frameChecks === 0) validateServerPacket(packet)
        this.clientPackets.push(packet)
    }

    drainClientPackets(): ServerPacket[] {
        return this.clientPackets.splice(0)
    }
}
