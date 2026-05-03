export type SpriteSampling = 'nearest' | 'linear'
export type TransparentColor = readonly [number, number, number]
export type AlphaComposeColor = readonly [number, number, number]

const LINEAR_PREFIXES = [
    'challenge_',
    'minigame_trophy',
    'selectorscreen_cloud',
    'selectorscreen_flower',
    'selectorscreen_leaf',
    'selectorscreen_leaves',
    'survival_thumbnails',
    'trophy',
]

const ALPHA_IMAGES: Record<string, string> = {}

const TRANSPARENT_COLORS: Record<string, TransparentColor> = {
}

const ALPHA_COMPOSE_COLORS: Record<string, AlphaComposeColor> = {
    zombienotehelp: [0, 0, 0],
}

export class SpriteResourceManifest {
    static getSampling(name: string): SpriteSampling {
        return LINEAR_PREFIXES.some((prefix) => name.startsWith(prefix)) ? 'linear' : 'nearest'
    }

    static getAlphaImage(name: string): string | undefined {
        return ALPHA_IMAGES[name]
    }

    static getTransparentColor(name: string): TransparentColor | undefined {
        return TRANSPARENT_COLORS[name]
    }

    static getAlphaComposeColor(name: string): AlphaComposeColor | undefined {
        return ALPHA_COMPOSE_COLORS[name]
    }
}
