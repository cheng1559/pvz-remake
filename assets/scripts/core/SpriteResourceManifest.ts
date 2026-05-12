export type SpriteSampling = 'nearest' | 'linear'
export type TransparentColor = readonly [number, number, number]
export type AlphaComposeColor = readonly [number, number, number]

const LINEAR_PREFIXES = [
    'acheesements_icons',
    'challenge_',
    'minigame_trophy',
    'anim_sprout',
    'blover_',
    'cabbagepult_',
    'cactus_',
    'cattail_',
    'cherrybomb_',
    'chomper_',
    'coffeebean_',
    'cornpult_',
    'doomshroom_',
    'fumeshroom_',
    'garlic_',
    'gatlingpea_',
    'gloomshroom_',
    'goldmagnet_',
    'gravebuster_',
    'hypnoshroom_',
    'iceshroom_',
    'imitater_',
    'imitaterseed',
    'jalapeno_',
    'lawnmower_cached',
    'lilypad_',
    'magnetshroom_',
    'marigold_',
    'melonpult_',
    'packet_plants',
    'packet_plants_cached',
    'plant_previews_cached',
    'peashooter_',
    'plantern_',
    'plantshadow',
    'potatomine_',
    'puffshroom_',
    'pumpkin_',
    'scaredyshroom_',
    'seashroom_',
    'selectorscreen_cloud',
    'selectorscreen_flower',
    'selectorscreen_leaf',
    'selectorscreen_leaves',
    'seedpacket_larger',
    'seeds',
    'snowpea_',
    'spikerock_',
    'splitpea_',
    'squash_',
    'starfruit_',
    'sun1',
    'sun2',
    'sun3',
    'sunflower_',
    'sunshroom_',
    'survival_thumbnails',
    'tallnut_',
    'tanglekelp_',
    'threepeater_',
    'torchwood_',
    'twinsunflower_',
    'trophy',
    'umbrellaleaf_',
    'wallnut_',
    'wintermelon_',
    'zombie_',
    'zombie_previews_cached',
    'zombie_paper_',
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
