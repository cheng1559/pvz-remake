import { GameSession } from './GameSession'
import { ADVENTURE_1_1, ZOMBIE_DEFINITIONS } from './GameDefinitions'
import { SoundEffect } from '@/core/SoundLoader'
import { createProjectile } from './projectiles/ProjectileFactory'

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
            sunflowerSession.drainEvents()
            sunflowerSession.collectItemAt(item.x + 30, item.y + 30)
            const sunCollectEvents = sunflowerSession.drainEvents()
            if (!sunCollectEvents.some((event) =>
                event.type === 'foleyRequested' &&
                event.sound === SoundEffect.Points &&
                event.pitchRange === 10)) {
                details.push('Collecting sun should request the original pitch-varied sun foley.')
            }
            for (let i = 0; i < 160; i++) sunflowerSession.update()
            if (sunflowerSession.sun !== sunBeforeCollect + 25) {
                details.push('Collected sun items should add 25 sun after flying to the sun bank.')
            }
        }
    }

    const skySunSession = new GameSession()
    const skySunCenter = skySunSession.geometry.gridToPixel(0, 2)
    skySunSession.dispatch({ type: 'selectSeed', seedType: 'peashooter' })
    skySunSession.dispatch({ type: 'placePlant', x: skySunCenter.x + 40, y: skySunCenter.y + 50 })
    for (let i = 0; i < 1250; i++) skySunSession.update()
    const liveSkySuns = skySunSession.items.filter((item) => !item.dead && item.type === 'sun' && item.motion === 'from-sky')
    if (liveSkySuns.length < 2) {
        details.push('Adventure 1-1 should keep spawning sky sun after the first Peashooter even if earlier sun was not collected.')
    }

    const debugFirstPlantSession = new GameSession()
    const debugFirstNonPeaCenter = debugFirstPlantSession.geometry.gridToPixel(0, 2)
    const debugFirstPeaCenter = debugFirstPlantSession.geometry.gridToPixel(1, 2)
    debugFirstPlantSession.debugAddPlant('sunflower', 2, 0)
    debugFirstPlantSession.dispatch({ type: 'selectSeed', seedType: 'peashooter' })
    debugFirstPlantSession.dispatch({
        type: 'placePlant',
        x: debugFirstPeaCenter.x + 40,
        y: debugFirstPeaCenter.y + 50,
    })
    if (debugFirstPlantSession.levelOneTutorialPhase !== 'first-plant-done') {
        details.push('Adventure 1-1 tutorial should advance when the first Peashooter is planted after a debug-placed non-Peashooter.')
    }
    if (!debugFirstPlantSession.hasPlantAt(debugFirstNonPeaCenter.x + 40, debugFirstNonPeaCenter.y + 50)) {
        details.push('Debug-placed non-Peashooter should remain on the board during the tutorial recovery case.')
    }

    const completedTutorialSession = new GameSession()
    const completedTutorialCenter = completedTutorialSession.geometry.gridToPixel(0, 2)
    completedTutorialSession.dispatch({ type: 'selectSeed', seedType: 'peashooter' })
    completedTutorialSession.dispatch({ type: 'placePlant', x: completedTutorialCenter.x + 40, y: completedTutorialCenter.y + 50 })
    completedTutorialSession.sun = 100
    completedTutorialSession.seedPackets[0].cooldownRemaining = 0
    completedTutorialSession.seedPackets[0].active = true
    completedTutorialSession.update()
    completedTutorialSession.dispatch({ type: 'selectSeed', seedType: 'peashooter' })
    completedTutorialSession.dispatch({ type: 'placePlant', x: completedTutorialCenter.x + 120, y: completedTutorialCenter.y + 50 })
    completedTutorialSession.drainEvents()
    for (let i = 0; i < 420; i++) completedTutorialSession.update()
    const postTutorialEvents = completedTutorialSession.drainEvents()
    if (postTutorialEvents.some((event) =>
        event.type === 'advice' &&
        event.message === 'Click on the falling sun to collect it!')) {
        details.push('Adventure 1-1 should stop showing falling sun tutorial advice after the second Peashooter is planted.')
    }

    const notEnoughSunSession = new GameSession()
    notEnoughSunSession.drainEvents()
    notEnoughSunSession.debugSetSun(0)
    notEnoughSunSession.dispatch({ type: 'selectSeed', seedType: 'peashooter' })
    const firstNotEnoughEvents = notEnoughSunSession.drainEvents()
    notEnoughSunSession.dispatch({ type: 'selectSeed', seedType: 'peashooter' })
    const repeatedNotEnoughEvents = notEnoughSunSession.drainEvents()
    const isCantAffordAdvice = (event: ReturnType<GameSession['drainEvents']>[number]) =>
        event.type === 'advice' &&
        event.message === 'You need more sun to do that!' &&
        event.style === 'tutorial-level1'
    if (!firstNotEnoughEvents.some((event) => event.type === 'sunFlash') ||
        !firstNotEnoughEvents.some(isCantAffordAdvice)) {
        details.push('Adventure 1-1 should show the tall tutorial not-enough-sun advice and flash the sun counter the first time.')
    }
    if (!repeatedNotEnoughEvents.some((event) => event.type === 'sunFlash') ||
        repeatedNotEnoughEvents.some(isCantAffordAdvice)) {
        details.push('Repeated not-enough-sun seed clicks should keep flashing the sun counter without repeating the 1-1 advice.')
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

    const coneHitSession = new GameSession()
    const coneHitZombie = coneHitSession.addZombie('traffic-cone', 2, 260)
    if (!coneHitZombie) {
        details.push('Cone projectile impact setup should create a conehead zombie.')
    } else {
        coneHitZombie.velocityX = 0
        coneHitSession.projectiles.push(createProjectile({
            id: 3001,
            type: 'pea',
            x: coneHitZombie.x,
            y: coneHitSession.geometry.gridToPixel(0, 2).y + 10,
            row: 2,
            shadowY: coneHitSession.geometry.gridToPixel(0, 2).y + 77,
        }))
        coneHitSession.drainEvents()
        coneHitSession.update()
        const coneHitEvents = coneHitSession.drainEvents()
        if (!coneHitEvents.some((event) => event.type === 'foleyRequested' && event.sound === SoundEffect.PlasticHit) ||
            !coneHitEvents.some((event) => event.type === 'foleyRequested' && event.sound === SoundEffect.Splat)) {
            details.push('A projectile hitting traffic-cone armor should request plastic hit plus splat foley like the original.')
        }
    }

    const bucketHitSession = new GameSession()
    const bucketHitZombie = bucketHitSession.addZombie('bucket', 2, 260)
    if (!bucketHitZombie) {
        details.push('Bucket projectile impact setup should create a buckethead zombie.')
    } else {
        bucketHitZombie.velocityX = 0
        bucketHitSession.projectiles.push(createProjectile({
            id: 3002,
            type: 'pea',
            x: bucketHitZombie.x,
            y: bucketHitSession.geometry.gridToPixel(0, 2).y + 10,
            row: 2,
            shadowY: bucketHitSession.geometry.gridToPixel(0, 2).y + 77,
        }))
        bucketHitSession.drainEvents()
        bucketHitSession.update()
        const bucketHitEvents = bucketHitSession.drainEvents()
        if (!bucketHitEvents.some((event) => event.type === 'foleyRequested' && event.sound === SoundEffect.ShieldHit) ||
            bucketHitEvents.some((event) => event.type === 'foleyRequested' && event.sound === SoundEffect.Splat)) {
            details.push('A projectile hitting bucket armor should request shield hit foley without the body splat.')
        }
    }

    if (normalZombie) {
        const armResult = normalZombie.takeDamage(91)
        if (!armResult.droppedArm || armResult.droppedHead || normalZombie.hasArm || !normalZombie.hasHead) {
            details.push('Body damage below two thirds should drop only the zombie arm.')
        }
    }
    if (flagZombie) {
        const headResult = flagZombie.takeDamage(200)
        if (!headResult.droppedHead || flagZombie.hasHead || flagZombie.hasObject) {
            details.push('Flag zombie should drop its flag object when losing its head.')
        }
    }

    const mowerSession = new GameSession()
    const mower = mowerSession.lawnMowers[0]
    if (!mower || mower.row !== 2 || mower.x !== -21 || mower.y !== 303 || mower.state !== 'ready') {
        details.push('Adventure 1-1 should initialize one ready lawn mower in the original active row position.')
    }
    const mowerZombie = mowerSession.addZombie('normal', 2, -20)
    mowerSession.drainEvents()
    mowerSession.update()
    const mowerEvents = mowerSession.drainEvents()
    if (!mowerZombie || mowerZombie.state !== 'mowered' || mowerZombie.dead) {
        details.push('A ready lawn mower should put a headed zombie into the mowered animation state before removal.')
    }
    if (mowerSession.result !== 'playing') {
        details.push('The lawn mower should prevent an overlapping zombie from immediately causing a house loss.')
    }
    if (mowerSession.lawnMowers[0]?.state !== 'triggered') {
        details.push('Mowing the first zombie should trigger the lawn mower.')
    }
    if (!mowerEvents.some((event) => event.type === 'foleyRequested' && event.sound === SoundEffect.Lawnmower) ||
        !mowerEvents.some((event) => event.type === 'foleyRequested' && event.sound === SoundEffect.Splat)) {
        details.push('Triggering a lawn mower should request the original lawnmower foley and splat on impact.')
    }
    for (let i = 0; i < 49; i++) mowerSession.update()
    if (mowerSession.zombies.length !== 1) {
        details.push('A mowered zombie should stay until the original lawnmowered animation window completes.')
    }
    mowerSession.update()
    if (mowerSession.zombies.length !== 0) {
        details.push('A mowered zombie should be removed after its lawnmowered zombie animation window.')
    }

    const freeMowerSession = new GameSession()
    const freeMower = freeMowerSession.lawnMowers[0]
    if (!freeMower) {
        details.push('Adventure 1-1 should create a lawn mower before testing its original movement speed.')
    } else {
        freeMowerSession.debugSetLawnMower(2, 'trigger')
        const freeMowerStartX = freeMower.x
        freeMowerSession.update()
        if (Math.abs(freeMower.x - freeMowerStartX - 3.33) > 0.001) {
            details.push('A triggered lawn mower should move at the original 3.33 pixels per tick when not chomping.')
        }
    }

    const triggeredMowerSession = new GameSession()
    const triggeredMower = triggeredMowerSession.lawnMowers[0]
    triggeredMowerSession.addZombie('normal', 2, -20)
    triggeredMowerSession.update()
    const mowerXAfterTrigger = triggeredMower.x
    triggeredMowerSession.update()
    if (triggeredMower.x <= mowerXAfterTrigger) {
        details.push('A triggered lawn mower should continue moving right after activation.')
    }

    const houseLossSession = new GameSession()
    const houseLossZombie = houseLossSession.addZombie('normal', 2, -101)
    houseLossSession.drainEvents()
    houseLossSession.update()
    const houseLossEvents = houseLossSession.drainEvents()
    if (!houseLossZombie || houseLossSession.result !== 'lost') {
        details.push('A headed zombie should trigger house loss only after its original board-edge X passes -100.')
    } else {
        if (houseLossZombie.y !== 290) {
            details.push('The winning zombie should be moved to the original day-background house-entry Y of 290.')
        }
        if (!houseLossEvents.some((event) => event.type === 'levelLost' && event.zombieId === houseLossZombie.id)) {
            details.push('House loss should report the zombie that crossed the original board edge.')
        }
        if (houseLossSession.lawnMowers[0]?.state !== 'ready') {
            details.push('The lawn mower should not run after a zombie has already triggered the original house-loss edge.')
        }
    }

    const headlessEdgeSession = new GameSession()
    const headlessEdgeZombie = headlessEdgeSession.addZombie('normal', 2, -31)
    if (!headlessEdgeZombie) {
        details.push('Headless board-edge setup should create a zombie in the active row.')
    } else {
        headlessEdgeZombie.hasHead = false
        headlessEdgeSession.drainEvents()
        headlessEdgeSession.update()
        if (headlessEdgeSession.result !== 'playing') {
            details.push('A headless zombie crossing the original edge buffer should die instead of causing house loss.')
        }
        if (headlessEdgeZombie.state !== 'dying') {
            details.push('A headless zombie should take the original 1800 edge damage at BOARD_EDGE + 70.')
        }
        if (headlessEdgeSession.lawnMowers[0]?.state !== 'ready') {
            details.push('The lawn mower should ignore zombies already dying from the original headless edge rule.')
        }
    }

    const waveSession = new GameSession()
    waveSession.drainEvents()
    for (let i = 0; i < 1795; i++) waveSession.update()
    const firstWaveWarningEvents = waveSession.drainEvents()
    if (!firstWaveWarningEvents.some((event) => event.type === 'soundRequested' && event.sound === SoundEffect.Awooga)) {
        details.push('Adventure 1-1 should play the original awooga sound when the first zombie wave is about to enter.')
    }
    for (let i = 0; i < 4; i++) waveSession.update()
    if (waveSession.zombies.length !== 0 || waveSession.currentWave !== 0) {
        details.push('Adventure 1-1 should not spawn the first zombie before the original first-wave countdown.')
    }
    waveSession.update()
    if (waveSession.zombies.length !== 1 || waveSession.currentWave !== 1 || waveSession.zombies[0].type !== 'normal') {
        details.push('Adventure 1-1 first wave should spawn one normal zombie after the original first-wave countdown.')
    }
    for (let i = 0; i < 20; i++) waveSession.update()
    if (waveSession.progressMeterWidth <= 0) {
        details.push('Adventure 1-1 should start advancing the lower-right progress meter after the first wave begins.')
    }

    const combatSession = new GameSession()
    const combatCenter = combatSession.geometry.gridToPixel(0, 2)
    combatSession.dispatch({ type: 'selectSeed', seedType: 'peashooter' })
    combatSession.dispatch({ type: 'placePlant', x: combatCenter.x + 40, y: combatCenter.y + 50 })
    const combatPlant = combatSession.plants[0]
    const combatZombie = combatSession.addZombie('normal', 2, combatPlant.x + 180)
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
        if (combatSession.projectiles.length !== 0 || combatZombie.health !== 270) {
            details.push('Peashooter should not apply projectile damage before the shooting counter reaches its fire frame.')
        }
        for (let i = 0; i < 32; i++) combatSession.update()
        if (!combatSession.projectiles.some((projectile) => projectile.type === 'pea' && projectile.row === combatPlant.row)) {
            details.push('Peashooter should create a pea projectile on the original shooting fire frame.')
        }
        for (let i = 0; i < 40; i++) combatSession.update()
        if (combatZombie.health !== 250) {
            details.push('A pea projectile should move across the row and apply 20 damage when it overlaps the first zombie.')
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

    const edgeProjectile = createProjectile({
        id: 1,
        type: 'pea',
        x: 798,
        y: 280,
        row: 2,
        shadowY: 347,
    })
    let edgeProjectileHit = false
    edgeProjectile.update({
        events: [],
        findCollisionTarget: () => ({}),
        damageTarget: () => {
            edgeProjectileHit = true
        },
    })
    if (!edgeProjectileHit || !edgeProjectile.dead) {
        details.push('A pea should still resolve its collision on the tick where it crosses the right board edge.')
    }

    const edgeZombieSession = new GameSession()
    const edgeZombie = edgeZombieSession.addZombie('normal', 2, 780)
    edgeZombieSession.projectiles.push(createProjectile({
        id: 2,
        type: 'pea',
        x: 798,
        y: edgeZombieSession.geometry.gridToPixel(0, 2).y + 10,
        row: 2,
        shadowY: edgeZombieSession.geometry.gridToPixel(0, 2).y + 77,
    }))
    if (!edgeZombie) {
        details.push('Edge projectile setup should create a partially entered zombie.')
    } else {
        edgeZombie.velocityX = 0
        edgeZombieSession.update()
        if (edgeZombie.health !== 250 || edgeZombieSession.projectiles.length !== 0) {
            details.push('A pea crossing the right edge should hit a zombie whose origin has entered even if its body rect is still offscreen.')
        }
    }

    const originalRandom = Math.random
    try {
        Math.random = () => 0
        const noMoneySession = new GameSession()
        noMoneySession.addZombie('normal', 2, -20)
        noMoneySession.update()
        if (noMoneySession.items.some((item) => item.type === 'silver-coin' || item.type === 'gold-coin' || item.type === 'diamond')) {
            details.push('Adventure 1-1 should not drop regular money loot from zombies.')
        }
    } finally {
        Math.random = originalRandom
    }

    const awardDropSession = new GameSession()
    awardDropSession.currentWave = awardDropSession.numWaves
    const dyingAwardZombie = awardDropSession.addZombie('normal', 2, 500)
    const finalAwardZombie = awardDropSession.addZombie('normal', 2, 260)
    if (!dyingAwardZombie || !finalAwardZombie) {
        details.push('Award drop setup should create the final two zombies in the active row.')
    } else {
        dyingAwardZombie.takeDamage(9999, { zombieCount: 2, canUseSuperLongDeath: false })
        finalAwardZombie.velocityX = 0
        finalAwardZombie.health = 100
        awardDropSession.projectiles.push(createProjectile({
            id: 9999,
            type: 'pea',
            x: finalAwardZombie.x,
            y: 280,
            row: 2,
            shadowY: 347,
        }))
        awardDropSession.drainEvents()
        awardDropSession.update()
        if (!awardDropSession.items.some((item) => item.type === 'final-seed-packet' && !item.dead)) {
            details.push('The final zombie should drop the level award seed packet.')
        }
        if (awardDropSession.sunSpawningEnabled) {
            details.push('Sky sun spawning should stop once the level award seed packet drops.')
        }
        if (awardDropSession.zombies.length !== 0) {
            details.push('Dropping the level award should remove every zombie from the board like the original RemoveAllZombies path.')
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
    const burnedCenter = cherrySession.debugAddZombie('normal', 2, cherryCenter.x + 160)
    const burnedAdjacentRow = cherrySession.debugAddZombie('normal', 3, cherryCenter.x + 160)
    const safeFarRow = cherrySession.debugAddZombie('normal', 4, cherryCenter.x + 160)
    cherrySession.drainEvents()
    cherrySession.update()
    const cherryEvents = cherrySession.drainEvents()
    if (cherrySession.plants.length !== 0) {
        details.push('Cherry Bomb should remove itself when the fuse reaches zero.')
    }
    if (!burnedCenter || burnedCenter.state !== 'charred') {
        details.push('Cherry Bomb should burn zombies inside the original 115px radius.')
    }
    if (!burnedAdjacentRow || burnedAdjacentRow.state !== 'charred') {
        details.push('Cherry Bomb should affect zombies up to one row away.')
    }
    if (!safeFarRow || safeFarRow.state === 'charred') {
        details.push('Cherry Bomb should not affect zombies more than one row away.')
    }
    if (!cherryEvents.some((event) => event.type === 'foleyRequested' && event.sound === SoundEffect.CherryBomb) ||
        !cherryEvents.some((event) =>
            event.type === 'foleyRequested' &&
            event.sound === SoundEffect.Juicy &&
            event.pitchRange === 2)) {
        details.push('Cherry Bomb detonation should play the cherrybomb and juicy sounds.')
    }

    return {
        passed: details.length === 0,
        details,
    }
}
