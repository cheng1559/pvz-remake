export type SpriteSampling = 'nearest' | 'linear'

const LINEAR_PREFIXES = [
    'selectorscreen_cloud',
    'selectorscreen_flower',
    'selectorscreen_leaf',
    'selectorscreen_leaves',
]

export class SpriteResourceManifest {
    static getSampling(name: string): SpriteSampling {
        return LINEAR_PREFIXES.some((prefix) => name.startsWith(prefix)) ? 'linear' : 'nearest'
    }
}

