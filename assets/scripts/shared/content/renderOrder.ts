/**
 * The board's draw order, as the original builds it (Board::MakeRenderOrder): row * 10000 + layer + offset, drawn from
 * low to high, so a front row covers the rows behind it and, within a row, each layer covers the ones below. The layer
 * values are RenderLayer's, so an order written here reads like the original code it comes from. Layers from `top` up
 * are not per row (the original passes row 0).
 */
export const RENDER_LAYERS = {
    uiBottom: 100000,
    ground: 200000,
    lawn: 300000,
    graveStone: 301000,
    plant: 302000,
    zombie: 303000,
    boss: 304000,
    projectile: 305000,
    lawnMower: 306000,
    particle: 307000,
    top: 400000,
    fog: 500000,
    coinBank: 600000,
    uiTop: 700000,
    aboveUi: 800000,
    screenFade: 900000,
} as const

export type RenderLayer = keyof typeof RENDER_LAYERS

const ROW_OFFSET = 10000

export function isRenderLayer(value: unknown): value is RenderLayer {
    return typeof value === 'string' && Object.hasOwn(RENDER_LAYERS, value)
}

/** Board::MakeRenderOrder; a layer from `top` up ignores the row. */
export function renderOrder(layer: RenderLayer, row = 0, offset = 0): number {
    return (RENDER_LAYERS[layer] < RENDER_LAYERS.top ? row * ROW_OFFSET : 0) + RENDER_LAYERS[layer] + offset
}

/** Plant::CalcRenderOrder's offset for a plant at board x (PLANT_ORDER_NORMAL): a plant further left draws later. */
export function plantRenderOffset(x: number): number {
    return 5 - Math.trunc(x) + 800
}

/** Zombie::ZombieInitialize's offset for every zombie so far (`aRenderOffset = 4`). */
export const ZOMBIE_RENDER_OFFSET = 4

/** Shadows lie on the ground under every row's plants and zombies (RENDER_ITEM_ZOMBIE_SHADOW, _PROJECTILE_SHADOW). */
export const SHADOW_RENDER_OFFSET = 3
