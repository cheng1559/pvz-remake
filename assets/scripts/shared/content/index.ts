export const CONTENT_CATEGORIES = [
    'sprites',
    'reanim',
    'particles',
    'fonts',
    'sounds',
    'music',
    'prefabs',
] as const

export type ContentCategory = typeof CONTENT_CATEGORIES[number]
