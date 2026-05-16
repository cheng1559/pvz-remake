import type { PlantType, ProjectileEntity, SeedType } from '../GameTypes'

export const SEED_TOOLTIP_NAMES: Record<SeedType, string> = {
    peashooter: 'Peashooter',
    sunflower: 'Sunflower',
    cherrybomb: 'Cherry Bomb',
    wallnut: 'Wall-nut',
    potatomine: 'Potato Mine',
    snowpea: 'Snow Pea',
    chomper: 'Chomper',
    repeater: 'Repeater',
}

export const SEED_TOOLTIP_WAITING = 'recharging...'
export const SEED_TOOLTIP_NOT_ENOUGH_SUN = 'not enough sun'

export const PLANT_VISUAL_ADJUSTMENTS: Partial<Record<PlantType, { offsetX?: number, offsetY?: number, scale?: number }>> = {
    potatomine: { offsetX: 12, offsetY: 12, scale: 0.8 },
}

export const PLANT_PREVIEW_CACHE_IDS: Record<PlantType, number> = {
    peashooter: 0,
    sunflower: 1,
    cherrybomb: 2,
    wallnut: 3,
    potatomine: 4,
    snowpea: 5,
    chomper: 6,
    repeater: 7,
}

export const PLANT_SHADOW_ADJUSTMENTS: Partial<Record<PlantType, { offsetX: number, offsetY: number, scale?: number }>> = {
    chomper: { offsetX: -21, offsetY: 57 },
}

export const PROJECTILE_SHADOW_WIDTH = 21
export const PROJECTILE_SHADOW_HEIGHT = 9
export const PROJECTILE_SHADOW_COLUMNS = 2
export const PROJECTILE_SHADOW_DAY_CEL = 0

export const PROJECTILE_SPRITES: Record<ProjectileEntity['type'], string> = {
    pea: 'projectilepea',
    snowpea: 'projectilesnowpea',
}

export const PROJECTILE_SHADOW_ADJUSTMENTS: Record<ProjectileEntity['type'], { offsetX: number, scale?: number }> = {
    pea: { offsetX: 3 },
    snowpea: { offsetX: -1, scale: 1.3 },
}
