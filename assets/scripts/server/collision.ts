

// ponytail: 1-1 screen edge; move this into BoardDefinition when another board needs it.
export const DAY_BOARD_RIGHT = 800

export function circleRectOverlap(x: number, y: number, radius: number, rect: { x: number, y: number, width: number, height: number }): boolean {
    const dx = x - Math.max(rect.x, Math.min(x, rect.x + rect.width))
    const dy = y - Math.max(rect.y, Math.min(y, rect.y + rect.height))
    return dx * dx + dy * dy <= radius * radius
}

export function rectOverlap(
    left: { x: number, width: number },
    right: { x: number, width: number },
): number {
    return Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)
}
