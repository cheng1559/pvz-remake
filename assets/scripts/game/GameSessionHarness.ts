import { GameSession } from './GameSession'
import { ADVENTURE_1_1, ZOMBIE_DEFINITIONS } from './GameDefinitions'
import { SoundEffect } from '@/core/SoundLoader'

export interface GameHarnessResult {
    passed: boolean
    details: string[]
}

export function runAdventure11Harness(): GameHarnessResult {
    const details: string[] = []
    const session = new GameSession()

    const center = session.geometry.gridToPixel(0, 2)
    const grid = session.geometry.pixelToGrid(center.x + 40, center.y + 50)
    if (!grid || grid.col !== 0 || grid.row !== 2) {
        details.push('Grid conversion failed for the first active row.')
    }

    session.dispatch({ type: 'selectSeed', seedType: 'peashooter' })
    if (session.seedPackets[0].active) {
        details.push('Picking up a seed packet should deactivate it while the cursor is holding that seed.')
    }
    session.dispatch({ type: 'placePlant', x: center.x + 40, y: center.y + 50 })
    if (session.plants.length !== 1 || session.sun !== ADVENTURE_1_1.startingSun - 100) {
        details.push('Plant placement did not consume one Peashooter packet cost.')
    }
    const peashooter = session.plants[0]
    if (!peashooter || peashooter.type !== 'peashooter' || peashooter.subclass !== 'shooter') {
        details.push('Peashooter planting should create a shooter PeashooterPlant instance.')
    }
    if (session.selectedSeed || session.seedPackets[0].active || session.seedPackets[0].cooldownRemaining <= 0) {
        details.push('Successful planting should clear the cursor and leave the packet refreshing.')
    }

    const secondSession = new GameSession()
    secondSession.dispatch({ type: 'selectSeed', seedType: 'peashooter' })
    secondSession.dispatch({ type: 'placePlant', x: 0, y: 0 })
    if (secondSession.selectedSeed || !secondSession.seedPackets[0].active || secondSession.sun !== ADVENTURE_1_1.startingSun) {
        details.push('Clicking off the lawn with a held plant should drop it back into the seed bank without spending sun.')
    }

    for (let i = 0; i < 220; i++) session.update()
    if (session.plants.length !== 1) {
        details.push('The planted Peashooter should remain on the board while combat is disabled.')
    }
    session.dispatch({ type: 'selectTool', toolType: 'shovel' })
    if (session.selectedTool !== 'shovel') {
        details.push('Selecting the shovel should put the shovel tool in the cursor.')
    }
    session.dispatch({ type: 'useToolAt', x: center.x + 40, y: center.y + 50 })
    if (session.selectedTool || session.plants.length !== 0) {
        details.push('Using the shovel on a plant should remove the plant and clear the cursor.')
    }

    const sunflowerSession = new GameSession()
    const sunflowerCenter = sunflowerSession.geometry.gridToPixel(1, 2)
    sunflowerSession.dispatch({ type: 'selectSeed', seedType: 'sunflower' })
    sunflowerSession.dispatch({ type: 'placePlant', x: sunflowerCenter.x + 40, y: sunflowerCenter.y + 50 })
    const sunflower = sunflowerSession.plants[0]
    if (!sunflower || sunflower.type !== 'sunflower' || sunflower.subclass !== 'normal') {
        details.push('Sunflower planting should create a normal SunflowerPlant instance.')
    } else {
        sunflower.launchCounter = 1
        sunflowerSession.update()
        if (!sunflowerSession.items.some((item) => item.type === 'sun' && item.motion === 'from-plant')) {
            details.push('Sunflower should create a plant-motion sun item when its production counter reaches zero.')
        } else {
            const item = sunflowerSession.items[0]
            const sunBeforeCollect = sunflowerSession.sun
            sunflowerSession.collectItemAt(item.x + 30, item.y + 30)
            for (let i = 0; i < 160; i++) sunflowerSession.update()
            if (sunflowerSession.sun !== sunBeforeCollect + 25) {
                details.push('Collected sun items should add 25 sun after flying to the sun bank.')
            }
        }
    }

    const skySunSession = new GameSession()
    for (let i = 0; i < 700; i++) skySunSession.update()
    if (!skySunSession.items.some((item) => item.type === 'sun' && item.motion === 'from-sky')) {
        details.push('Day levels should spawn falling sky sun through the item system.')
    }

    const zombieSession = new GameSession()
    const normalZombie = zombieSession.addZombie('normal', 2, 500)
    const coneZombie = zombieSession.addZombie('traffic-cone', 2, 520)
    const bucketZombie = zombieSession.addZombie('bucket', 2, 540)
    const flagZombie = zombieSession.addZombie('flag', 2, 560)
    const duckyZombie = zombieSession.addZombie('ducky-tube', 2, 580)
    if (!normalZombie || normalZombie.health !== 270 || normalZombie.helmType !== 'none') {
        details.push('Normal zombie should initialize with the original 270 body health and no helm.')
    }
    if (!coneZombie || coneZombie.helmType !== 'traffic-cone' || coneZombie.helmHealth !== 370) {
        details.push('Conehead zombie should initialize with the original traffic cone helm health.')
    }
    if (!bucketZombie || bucketZombie.helmType !== 'bucket' || bucketZombie.helmHealth !== 1100) {
        details.push('Buckethead zombie should initialize with the original bucket helm health.')
    }
    if (!flagZombie || !flagZombie.hasObject || flagZombie.velocityX !== ZOMBIE_DEFINITIONS.flag.velocityXMin) {
        details.push('Flag zombie should keep the flag object and use the original fixed flag speed.')
    }
    if (!duckyZombie || !duckyZombie.hasObject || !duckyZombie.inPool) {
        details.push('Ducky Tube zombie should keep the float object and start in pool movement state.')
    }

    const waveSession = new GameSession()
    for (let i = 0; i < 1799; i++) waveSession.update()
    if (waveSession.zombies.length !== 0 || waveSession.currentWave !== 0) {
        details.push('Adventure 1-1 should not spawn the first zombie before the original first-wave countdown.')
    }
    waveSession.update()
    if (waveSession.zombies.length !== 1 || waveSession.currentWave !== 1 || waveSession.zombies[0].type !== 'normal') {
        details.push('Adventure 1-1 first wave should spawn one normal zombie after the original first-wave countdown.')
    }

    const combatSession = new GameSession()
    const combatCenter = combatSession.geometry.gridToPixel(0, 2)
    combatSession.dispatch({ type: 'selectSeed', seedType: 'peashooter' })
    combatSession.dispatch({ type: 'placePlant', x: combatCenter.x + 40, y: combatCenter.y + 50 })
    const combatPlant = combatSession.plants[0]
    const combatZombie = combatSession.addZombie('normal', 2, combatPlant.x + 70)
    if (!combatZombie) {
        details.push('Combat zombie should spawn in the active row.')
    } else {
        combatZombie.velocityX = 0
        combatPlant.launchCounter = 1
        combatSession.drainEvents()
        combatSession.update()
        const combatEvents = combatSession.drainEvents()
        if (!combatEvents.some((event) => event.type === 'animationRequested' && event.entityId === combatPlant.id && event.animation === 'shoot')) {
            details.push('Peashooter should see a zombie target in its row and request the shooting animation.')
        }
        if (combatZombie.health !== 250) {
            details.push('Peashooter projectile fire should apply 20 damage to the first zombie in its row.')
        }
    }

    const offscreenCombatSession = new GameSession()
    const offscreenCombatCenter = offscreenCombatSession.geometry.gridToPixel(0, 2)
    offscreenCombatSession.dispatch({ type: 'selectSeed', seedType: 'peashooter' })
    offscreenCombatSession.dispatch({ type: 'placePlant', x: offscreenCombatCenter.x + 40, y: offscreenCombatCenter.y + 50 })
    const offscreenCombatPlant = offscreenCombatSession.plants[0]
    const offscreenCombatZombie = offscreenCombatSession.addZombie('normal', 2, 780)
    if (!offscreenCombatPlant || !offscreenCombatZombie) {
        details.push('Offscreen combat setup should create a Peashooter and zombie in the active row.')
    } else {
        offscreenCombatZombie.velocityX = 0
        offscreenCombatPlant.launchCounter = 1
        offscreenCombatSession.drainEvents()
        offscreenCombatSession.update()
        const offscreenCombatEvents = offscreenCombatSession.drainEvents()
        if (offscreenCombatEvents.some((event) => event.type === 'animationRequested' && event.entityId === offscreenCombatPlant.id && event.animation === 'shoot')) {
            details.push('Peashooter should not shoot zombies whose body has not entered the visible board yet.')
        }
        if (offscreenCombatZombie.health !== 270) {
            details.push('Offscreen zombies should not take immediate projectile damage before becoming visible.')
        }
    }

    const cherrySession = new GameSession()
    const cherryCenter = cherrySession.geometry.gridToPixel(2, 2)
    cherrySession.dispatch({ type: 'selectSeed', seedType: 'cherrybomb' })
    cherrySession.dispatch({ type: 'placePlant', x: cherryCenter.x + 40, y: cherryCenter.y + 50 })
    const cherry = cherrySession.plants[0]
    if (!cherry || cherry.type !== 'cherrybomb' || cherry.state !== 'doing-special' || cherry.specialCounter !== 100) {
        details.push('Cherry Bomb should enter its 100-tick doing-special fuse after planting.')
    }
    cherrySession.drainEvents()
    for (let i = 0; i < 99; i++) cherrySession.update()
    if (cherrySession.plants.length !== 1) {
        details.push('Cherry Bomb should stay on the board until the 100th fuse tick.')
    }
    cherrySession.drainEvents()
    cherrySession.update()
    const cherryEvents = cherrySession.drainEvents()
    if (cherrySession.plants.length !== 0) {
        details.push('Cherry Bomb should remove itself when the fuse reaches zero.')
    }
    if (!cherryEvents.some((event) => event.type === 'soundRequested' && event.sound === SoundEffect.CherryBomb) ||
        !cherryEvents.some((event) => event.type === 'soundRequested' && event.sound === SoundEffect.Juicy)) {
        details.push('Cherry Bomb detonation should play the cherrybomb and juicy sounds.')
    }

    return {
        passed: details.length === 0,
        details,
    }
}
