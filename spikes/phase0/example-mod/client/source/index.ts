export interface ClientApi {
    registerContent(content: { id: string; kind: string; path?: string }): void
    enhanceAnimation(targetId: string, patch: unknown): void
}

export function register(api: ClientApi) {
    api.registerContent({ id: 'phase0:client', kind: 'client-bundle' })
    api.enhanceAnimation('pvz:peashooter', { shootHead: { rateScale: 45 / 35 } })
}
