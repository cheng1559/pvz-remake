import type { Node } from 'cc'

/**
 * An entity's attachment list (Zombie/Plant::mAttachmentID): effects that belong to it wherever their nodes are drawn.
 * They update with their owner, so the zombie that walks into the house keeps its attachments playing.
 * Players attached to a body track (ReanimPlayer.attachToTrack) also take the body's colors; entity attachments do not.
 */
export class EntityAttachments {
    private readonly nodes = new Map<Node, string | undefined>()

    /** Registers an attachment, optionally with a type so that kind alone can be removed. */
    add(node: Node, type?: string): void {
        this.nodes.set(node, type)
    }

    /** Whether a node is an attachment or part of one. */
    has(node: Node): boolean {
        for (const attachment of this.nodes.keys()) {
            if (!attachment.isValid) this.nodes.delete(attachment)
            else if (node === attachment || node.isChildOf(attachment)) return true
        }
        return false
    }

    /** AttachmentDie, or AttachmentReanimTypeDie when a type is given. */
    remove(type?: string): void {
        for (const [node, kind] of this.nodes) {
            if (type !== undefined && kind !== type) continue
            this.nodes.delete(node)
            if (node.isValid) node.destroy()
        }
    }
}
