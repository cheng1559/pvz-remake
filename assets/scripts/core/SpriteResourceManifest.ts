export type SpriteSampling = 'nearest' | 'linear'

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

export class SpriteResourceManifest {
    static getSampling(name: string): SpriteSampling {
        return LINEAR_PREFIXES.some((prefix) => name.startsWith(prefix)) ? 'linear' : 'nearest'
    }
}
