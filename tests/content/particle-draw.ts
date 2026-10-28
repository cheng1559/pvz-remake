import type { KernelParticles } from '@/shared/kernel/particles'

/** A particle as drawn: position, horizontal scale and alpha (0-255), read back from the kernel's vertices. */
export interface DrawnParticle { x: number, y: number, a: number, alpha: number }

const STRIDE = 9
// Every sprite cell is a unit rectangle from (0, 0), so a quad's first corner is the particle position.
// The opacity option is the inherited opacity divided by 255, as the batch passes it.
const geometry = new Float64Array(Array.from({ length: 64 }, () => [0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1]).flat())

export function drawParticles(system: KernelParticles, tint: readonly [number, number, number, number] = [255, 255, 255, 255], scale = 1): DrawnParticle[] {
    const count = Math.max(0, system.counts[0])
    const positions = new Float32Array(count * 4 * STRIDE), vertices = new Float32Array(count * 4 * STRIDE)
    const written = system.write(0, geometry, new Float64Array([...tint, scale, 0, 0, 1 / 255, STRIDE, count]), positions, vertices)
    if (written !== count) throw new Error(`particle kernel wrote ${written} of ${count} quads`)
    return Array.from({ length: count }, (_, quad) => {
        const corner = quad * 4 * STRIDE
        return {
            x: positions[corner], y: positions[corner + 1],
            a: positions[corner + STRIDE] - positions[corner],
            alpha: Math.round(vertices[corner + 8] * 255),
        }
    })
}
