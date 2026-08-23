interface PlantUpgrade {
    seedId: string
    targetPlantId: string
    resultSeedId: string
}

export interface GameplayApi {
    registerPlantUpgrade(upgrade: PlantUpgrade): void
}

export function register(api: GameplayApi) {
    api.registerPlantUpgrade({
        seedId: 'pvz:peashooter',
        targetPlantId: 'pvz:peashooter',
        resultSeedId: 'pvz:repeater',
    })
}
