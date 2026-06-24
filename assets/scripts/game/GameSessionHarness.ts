import { GameSession } from './GameSession'
import { ADVENTURE_1_1, ADVENTURE_1_2, ADVENTURE_1_3, ADVENTURE_1_4, ADVENTURE_1_5, ZOMBIE_DEFINITIONS } from './GameDefinitions'
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

    const levelThreeCooldownSession = new GameSession(ADVENTURE_1_3)
    const levelThreeCherry = levelThreeCooldownSession.seedPackets.find((packet) => packet.seedType === 'cherrybomb')
    if (!levelThreeCherry ||
        levelThreeCherry.cooldownRemaining !== 3500 ||
        levelThreeCherry.cooldownTotal !== 3500 ||
        levelThreeCherry.active) {
        details.push('Adventure 1-3 Cherry Bomb should start a full 3500-tick initial cooldown.')
    }
    levelThreeCooldownSession.completeReadySetPlantIntro()
    if (levelThreeCherry?.active) {
        details.push('Ready-set-plant completion should not activate packets that are still in their initial cooldown.')
    }

    const levelFourCooldownSession = new GameSession(ADVENTURE_1_4)
    const levelFourWallnut = levelFourCooldownSession.seedPackets.find((packet) => packet.seedType === 'wallnut')
    if (!levelFourWallnut ||
        levelFourWallnut.cooldownRemaining !== 2000 ||
        levelFourWallnut.cooldownTotal !== 2000 ||
        levelFourWallnut.active) {
        details.push('Adventure 1-4 Wall-nut should start a full 2000-tick initial cooldown.')
    }
    const wallNutDamageSession = new GameSession(ADVENTURE_1_4)
    const wallNut = wallNutDamageSession.debugAddPlant('wallnut', 2, 2)
    wallNut.takeChewDamage(Math.ceil(wallNut.maxHealth / 3) + 1)
    if (wallNut.state !== 'wallnut-cracked1') {
        details.push('Wall-nut should switch to the first cracked state after dropping below two-thirds health.')
    }
    wallNut.takeChewDamage(Math.ceil(wallNut.maxHealth / 3))
    if (wallNut.state !== 'wallnut-cracked2') {
        details.push('Wall-nut should switch to the second cracked state after dropping below one-third health.')
    }

    const laterSunflowerSession = new GameSession(ADVENTURE_1_3)
    laterSunflowerSession.completeReadySetPlantIntro()
    laterSunflowerSession.drainEvents()
    for (let i = 0; i < 5; i++) laterSunflowerSession.debugSpawnNextWave()
    laterSunflowerSession.update()
    const laterSunflowerStartEvents = laterSunflowerSession.drainEvents()
    if (!laterSunflowerStartEvents.some((event) =>
        event.type === 'advice' &&
        event.message === 'Try to plant at least 3 sunflowers!' &&
        event.style === 'tutorial-later-stay')) {
        details.push('Adventure 1-3 should show the later sunflower reminder after wave 5 if fewer than 3 sunflowers are planted.')
    }
    if (!laterSunflowerSession.shouldShowTutorialSeedGuide('sunflower')) {
        details.push('The later sunflower reminder should flash the Sunflower seed packet while it is ready.')
    }
    laterSunflowerSession.debugAddPlant('sunflower', 2, 0)
    laterSunflowerSession.debugAddPlant('sunflower', 2, 1)
    laterSunflowerSession.drainEvents()
    laterSunflowerSession.debugAddPlant('sunflower', 2, 2)
    const laterSunflowerDoneEvents = laterSunflowerSession.drainEvents()
    if (!laterSunflowerDoneEvents.some((event) =>
        event.type === 'advice' &&
        event.message === 'Planting sunflowers will improve your chances \nof surviving the zombie attack!' &&
        event.style === 'tutorial-later')) {
        details.push('Completing the later sunflower tutorial before the 500-tick reminder should show the completion advice.')
    }
    if (laterSunflowerSession.shouldShowTutorialSeedGuide('sunflower')) {
        details.push('Completing the later sunflower tutorial should stop flashing the Sunflower seed packet.')
    }
    const expiredLaterSunflowerSession = new GameSession(ADVENTURE_1_3)
    expiredLaterSunflowerSession.completeReadySetPlantIntro()
    expiredLaterSunflowerSession.drainEvents()
    for (let i = 0; i < 5; i++) expiredLaterSunflowerSession.debugSpawnNextWave()
    expiredLaterSunflowerSession.update()
    expiredLaterSunflowerSession.drainEvents()
    for (let i = 0; i < 500; i++) expiredLaterSunflowerSession.update()
    expiredLaterSunflowerSession.drainEvents()
    expiredLaterSunflowerSession.debugAddPlant('sunflower', 2, 0)
    expiredLaterSunflowerSession.debugAddPlant('sunflower', 2, 1)
    expiredLaterSunflowerSession.drainEvents()
    expiredLaterSunflowerSession.debugAddPlant('sunflower', 2, 2)
    if (expiredLaterSunflowerSession.drainEvents().some((event) => event.type === 'advice')) {
        details.push('Completing the later sunflower tutorial after the 500-tick reminder should not repeat the completion advice.')
    }
    const replayLaterSunflowerSession = new GameSession(ADVENTURE_1_3, { firstTimeAdventure: false })
    replayLaterSunflowerSession.completeReadySetPlantIntro()
    replayLaterSunflowerSession.drainEvents()
    for (let i = 0; i < 5; i++) replayLaterSunflowerSession.debugSpawnNextWave()
    replayLaterSunflowerSession.update()
    if (replayLaterSunflowerSession.drainEvents().some((event) =>
        event.type === 'advice' &&
        event.message === 'Try to plant at least 3 sunflowers!')) {
        details.push('Replay adventure sessions should not show the first-time later sunflower tutorial.')
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
    if (
        !flagZombie ||
        !flagZombie.hasObject ||
        flagZombie.velocityX !== ZOMBIE_DEFINITIONS.flag.velocityXMin ||
        flagZombie.currentAnimation !== 'anim_walk2'
    ) {
        details.push('Flag zombie should keep the flag object and use the original fixed speed and steady walk animation.')
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

    const plantChewFlashSession = new GameSession()
    const chewedPlant = plantChewFlashSession.debugAddPlant('peashooter', 2, 0)
    const chewingZombie = plantChewFlashSession.addZombie('normal', 2, chewedPlant.x + 10)
    if (!chewingZombie) {
        details.push('Plant chew flash setup should create a zombie in the active row.')
    } else {
        chewingZombie.velocityX = 0
        plantChewFlashSession.drainEvents()
        for (let i = 0; i < 4; i++) plantChewFlashSession.update()
        if (chewedPlant.health !== chewedPlant.maxHealth - 4) {
            details.push('Zombie chewing should damage plants on the original 4-tick cadence.')
        }
        if (chewedPlant.recentlyEatenCounter !== 50) {
            details.push('Zombie chewing should refresh the original 50-tick recently-eaten plant timer on damage.')
        }
        if (chewedPlant.eatenFlashCounter !== 0) {
            details.push('Plant eaten flash should wait for the original chew animation hand event instead of every damage tick.')
        }
        for (let i = 0; i < 12; i++) plantChewFlashSession.update()
        if (chewedPlant.eatenFlashCounter !== 25) {
            details.push('A chewed plant should start the original 25-tick eaten flash highlight on a chew animation hand event.')
        }
    }

    const headlessPlantSession = new GameSession()
    const ignoredPlant = headlessPlantSession.debugAddPlant('peashooter', 2, 0)
    const headlessTouchingPlant = headlessPlantSession.addZombie('normal', 2, ignoredPlant.x + 10)
    if (!headlessTouchingPlant) {
        details.push('Headless plant collision setup should create a zombie in the active row.')
    } else {
        headlessTouchingPlant.velocityX = 0
        headlessTouchingPlant.hasHead = false
        headlessPlantSession.drainEvents()
        headlessPlantSession.update()
        if (headlessTouchingPlant.state === 'eating' || headlessTouchingPlant.currentAnimation === 'anim_eat') {
            details.push('A headless zombie touching a plant should keep walking instead of switching to the eating animation.')
        }
        if (ignoredPlant.health !== ignoredPlant.maxHealth || ignoredPlant.eatenFlashCounter !== 0) {
            details.push('A headless zombie touching a plant should not chew or flash the plant.')
        }
    }

    const eatingHeadDropSession = new GameSession()
    const eatingPlant = eatingHeadDropSession.debugAddPlant('peashooter', 2, 0)
    const eatingHeadDropZombie = eatingHeadDropSession.addZombie('normal', 2, eatingPlant.x + 10)
    if (!eatingHeadDropZombie) {
        details.push('Eating head-drop setup should create a zombie in the active row.')
    } else {
        eatingHeadDropZombie.velocityX = 0
        eatingHeadDropSession.drainEvents()
        eatingHeadDropSession.update()
        eatingHeadDropZombie.takeDamage(200)
        eatingHeadDropSession.update()
        if (eatingHeadDropZombie.hasHead) {
            details.push('Eating head-drop setup should remove the zombie head.')
        }
        if (eatingHeadDropZombie.state !== 'eating' || eatingHeadDropZombie.currentAnimation !== 'anim_eat') {
            details.push('A zombie that loses its head while eating should keep the eating animation until its current target is gone.')
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

    const level2WaveSession = new GameSession(ADVENTURE_1_2)
    for (let i = 0; i < ADVENTURE_1_2.zombieWaves.length; i++) level2WaveSession.debugSpawnNextWave()
    const level2FinalWave = level2WaveSession.zombies.filter((zombie) => zombie.fromWave === ADVENTURE_1_2.zombieWaves.length - 1)
    const level2FinalNormals = level2FinalWave.filter((zombie) => zombie.type === 'normal').length
    const level2FinalFlags = level2FinalWave.filter((zombie) => zombie.type === 'flag').length
    if (level2FinalNormals !== 4 || level2FinalFlags !== 1 || level2FinalWave.length !== 5) {
        details.push('Adventure 1-2 final flag wave should match the original 4 normal zombies plus 1 flag zombie.')
    }

    const originalRandom = Math.random
    try {
        const level2MoweredRowSession = new GameSession(ADVENTURE_1_2)
        level2MoweredRowSession.debugSetLawnMower(1, 'trigger')
        Math.random = () => 0.01
        level2MoweredRowSession.debugSpawnNextWave()
        if (level2MoweredRowSession.zombies[0]?.row === 1) {
            details.push('Adventure 1-2 should strongly de-prioritize a row in the first wave after its lawn mower triggered.')
        }

        const level3SpawnXSession = new GameSession(ADVENTURE_1_3)
        level3SpawnXSession.debugSpawnNextFlagWave()
        const finalWaveZombies = level3SpawnXSession.zombies.filter((zombie) => zombie.fromWave === ADVENTURE_1_3.zombieWaves.length - 1)
        if (finalWaveZombies.some((zombie) => zombie.x !== 780)) {
            details.push('Zombies in one wave should each use the original 780 + Rand(40) start X without an added per-index spacing.')
        }
        const finalWaveRows = new Set(finalWaveZombies.map((zombie) => zombie.row))
        if (finalWaveRows.size <= 1) {
            details.push('Row picking should use original smooth weighting so a multi-zombie wave does not collapse into one row.')
        }
    } finally {
        Math.random = originalRandom
    }

    const hugeWaveMusicSession = new GameSession(ADVENTURE_1_2)
    for (let i = 0; i < ADVENTURE_1_2.zombieWaves.length - 1; i++) hugeWaveMusicSession.debugSpawnNextWave()
    hugeWaveMusicSession.zombieCountDown = 6
    hugeWaveMusicSession.zombieCountDownStart = 6
    hugeWaveMusicSession.drainEvents()
    hugeWaveMusicSession.update()
    for (let i = 0; i < 349; i++) hugeWaveMusicSession.update()
    const hugeWaveMusicEvents = hugeWaveMusicSession.drainEvents()
    if (!hugeWaveMusicEvents.some((event) => event.type === 'musicBurstRequested')) {
        details.push('A huge wave warning should request the dynamic music burst at the original 400-tick countdown point.')
    }

    const flagWaveSkipSession = new GameSession(ADVENTURE_1_2)
    for (let i = 0; i < ADVENTURE_1_2.zombieWaves.length - 1; i++) flagWaveSkipSession.debugSpawnNextWave()
    ;(flagWaveSkipSession as unknown as { _zombieHealthToNextWave: number })._zombieHealthToNextWave = 99999
    flagWaveSkipSession.zombieCountDown = 601
    flagWaveSkipSession.zombieCountDownStart = 1002
    flagWaveSkipSession.update()
    if (flagWaveSkipSession.zombieCountDown === 200) {
        details.push('A pending flag wave should not be accelerated to 200 ticks just because the current wave health is below the next-wave threshold.')
    }

    const level3WaveSession = new GameSession(ADVENTURE_1_3)
    for (let i = 0; i < ADVENTURE_1_3.zombieWaves.length; i++) level3WaveSession.debugSpawnNextWave()
    const level3ThirdWave = level3WaveSession.zombies.filter((zombie) => zombie.fromWave === 2)
    if (level3ThirdWave.length !== 1 || level3ThirdWave[0]?.type !== 'normal') {
        details.push('Adventure 1-3 third wave should still be a normal zombie because conehead costs more than the original one-point wave budget.')
    }
    const level3IntroWave = level3WaveSession.zombies.filter((zombie) => zombie.fromWave === 4)
    if (level3IntroWave.length !== 1 || level3IntroWave[0]?.type !== 'traffic-cone') {
        details.push('Adventure 1-3 fifth wave should introduce the conehead zombie like the original midpoint intro rule.')
    }
    const level3FinalWave = level3WaveSession.zombies.filter((zombie) => zombie.fromWave === ADVENTURE_1_3.zombieWaves.length - 1)
    const level3FinalNormals = level3FinalWave.filter((zombie) => zombie.type === 'normal').length
    const level3FinalFlags = level3FinalWave.filter((zombie) => zombie.type === 'flag').length
    const level3FinalCones = level3FinalWave.filter((zombie) => zombie.type === 'traffic-cone').length
    if (level3FinalNormals !== 4 || level3FinalFlags !== 1 || level3FinalCones !== 1 || level3FinalWave.length !== 6) {
        details.push('Adventure 1-3 final flag wave should match the original 4 normals, 1 flag, and introduced conehead.')
    }

    const level4WaveSession = new GameSession(ADVENTURE_1_4)
    for (let i = 0; i < ADVENTURE_1_4.zombieWaves.length; i++) level4WaveSession.debugSpawnNextWave()
    const level4FinalWave = level4WaveSession.zombies.filter((zombie) => zombie.fromWave === ADVENTURE_1_4.zombieWaves.length - 1)
    const level4FinalNormals = level4FinalWave.filter((zombie) => zombie.type === 'normal').length
    const level4FinalFlags = level4FinalWave.filter((zombie) => zombie.type === 'flag').length
    const level4FinalCones = level4FinalWave.filter((zombie) => zombie.type === 'traffic-cone').length
    if (ADVENTURE_1_4.zombieWaves.length !== 10 || level4FinalNormals !== 4 || level4FinalFlags !== 1 || level4FinalCones !== 1 || level4FinalWave.length !== 6) {
        details.push('Adventure 1-4 should have 10 waves and end with the original 4 normals, 1 flag, and 1 conehead reward wave.')
    }

    const level5WaveSession = new GameSession(ADVENTURE_1_5)
    const level5FirstWaveCountdown = level5WaveSession.zombieCountDownStart
    const level5OriginalRandom = Math.random
    try {
        Math.random = () => 0
        for (let i = 0; i < ADVENTURE_1_5.zombieWaves.length; i++) level5WaveSession.debugSpawnNextWave()
    } finally {
        Math.random = level5OriginalRandom
    }
    const level5FinalWave = level5WaveSession.zombies.filter((zombie) => zombie.fromWave === ADVENTURE_1_5.zombieWaves.length - 1)
    const level5FinalNormals = level5FinalWave.filter((zombie) => zombie.type === 'normal').length
    const level5FinalFlags = level5FinalWave.filter((zombie) => zombie.type === 'flag').length
    const level5FinalCones = level5FinalWave.filter((zombie) => zombie.type === 'traffic-cone').length
    if (ADVENTURE_1_5.zombieWaves.length !== 8 ||
        level5WaveSession.zombies.filter((zombie) => zombie.fromWave === 0).length !== 4 ||
        level5WaveSession.zombies.filter((zombie) => zombie.fromWave === 3).length !== 8 ||
        level5WaveSession.zombies.filter((zombie) => zombie.fromWave === 6).length !== 12 ||
        level5FinalNormals !== 13 ||
        level5FinalFlags !== 1 ||
        level5FinalCones !== 1) {
        details.push('Adventure 1-5 should use the original 8-wave, four-times wall-nut bowling zombie point curve and final flag wave.')
    }
    if (level5FirstWaveCountdown !== 200) {
        details.push('Adventure 1-5 should apply the original wall-nut bowling 200-tick first-wave countdown.')
    }

    const wallnutOnlyBowlingLevel = {
        ...ADVENTURE_1_5,
        conveyor: {
            ...ADVENTURE_1_5.conveyor!,
            seedPool: [{ seedType: 'wallnut' as const, weight: 100 }],
        },
    }
    const bowlingSeedWeights = ADVENTURE_1_5.conveyor?.seedPool ?? []
    if (bowlingSeedWeights.find((entry) => entry.seedType === 'wallnut')?.weight !== 85 ||
        bowlingSeedWeights.find((entry) => entry.seedType === 'explodenut')?.weight !== 15) {
        details.push('Adventure 1-5 conveyor should use the original 85:15 wall-nut to Explode-o-nut weights.')
    }

    const bowlingSession = new GameSession(wallnutOnlyBowlingLevel)
    const bowlingPacket = bowlingSession.conveyorPackets[0]
    const bowlingCell = bowlingSession.geometry.gridToPixel(0, 2)
    if (!bowlingPacket) {
        details.push('Adventure 1-5 should start with a wall-nut on the conveyor.')
    } else {
        bowlingSession.dispatch({ type: 'selectConveyorPacket', packetId: bowlingPacket.id })
        bowlingSession.dispatch({
            type: 'placePlant',
            x: bowlingCell.x + 40,
            y: bowlingCell.y + 50,
        })
        const rollingWallnut = bowlingSession.plants.find((plant) => plant.isBowling)
        const bowlingZombie = bowlingSession.debugAddZombie('normal', 2, 150)
        if (!rollingWallnut || !bowlingZombie) {
            details.push('Placing a conveyor wall-nut should create a rolling wall-nut that can target zombies.')
        } else {
            bowlingZombie.velocityX = 0
            const startingX = rollingWallnut.x
            for (let i = 0; i < 60 && bowlingZombie.state !== 'dying'; i++) bowlingSession.update()
            if (rollingWallnut.x <= startingX) {
                details.push('A bowling wall-nut should roll from left to right using the original ground-track velocity.')
            }
            if (bowlingZombie.state !== 'dying') {
                details.push('A bowling wall-nut should deal lethal body damage to a normal zombie on contact.')
            }
            if (rollingWallnut.state !== 'bowling-up' && rollingWallnut.state !== 'bowling-down') {
                details.push('A bowling wall-nut should start ricocheting between rows after its first zombie hit.')
            }
        }
    }

    const bowlingHelmSession = new GameSession(wallnutOnlyBowlingLevel)
    const bowlingHelmPacket = bowlingHelmSession.conveyorPackets[0]
    if (bowlingHelmPacket) {
        bowlingHelmSession.dispatch({ type: 'selectConveyorPacket', packetId: bowlingHelmPacket.id })
        bowlingHelmSession.dispatch({
            type: 'placePlant',
            x: bowlingCell.x + 40,
            y: bowlingCell.y + 50,
        })
        const coneZombie = bowlingHelmSession.debugAddZombie('traffic-cone', 2, 150)
        if (coneZombie) {
            coneZombie.velocityX = 0
            for (let i = 0; i < 60 && coneZombie.helmHealth > 0; i++) bowlingHelmSession.update()
            if (coneZombie.helmHealth !== 0 || coneZombie.health !== coneZombie.maxHealth || coneZombie.state !== 'walking') {
                details.push('A bowling wall-nut should apply 900 damage to a cone helmet without spilling damage into the zombie body.')
            }
        }
    }

    const explodeONutSession = new GameSession({
        ...ADVENTURE_1_5,
        conveyor: {
            ...ADVENTURE_1_5.conveyor!,
            seedPool: [{ seedType: 'explodenut', weight: 100 }],
        },
    })
    const explodeONutPacket = explodeONutSession.conveyorPackets[0]
    if (!explodeONutPacket || explodeONutPacket.seedType !== 'explodenut') {
        details.push('Explode-o-nut should be available as a wall-nut bowling conveyor seed.')
    } else {
        explodeONutSession.dispatch({ type: 'selectConveyorPacket', packetId: explodeONutPacket.id })
        explodeONutSession.dispatch({
            type: 'placePlant',
            x: bowlingCell.x + 40,
            y: bowlingCell.y + 50,
        })
        const explodeONut = explodeONutSession.plants.find((plant) => plant.type === 'explodenut')
        const centerZombie = explodeONutSession.debugAddZombie('normal', 2, 150)
        const adjacentZombie = explodeONutSession.debugAddZombie('normal', 3, 150)
        const farZombie = explodeONutSession.debugAddZombie('normal', 4, 150)
        if (!explodeONut || !centerZombie || !adjacentZombie || !farZombie) {
            details.push('Explode-o-nut collision test entities should be created.')
        } else {
            centerZombie.velocityX = 0
            adjacentZombie.velocityX = 0
            farZombie.velocityX = 0
            explodeONutSession.drainEvents()
            for (let i = 0; i < 60 && !explodeONut.dead; i++) explodeONutSession.update()
            const explodeEvents = explodeONutSession.drainEvents()
            if (!explodeONut.dead) {
                details.push('Explode-o-nut should detonate and remove itself on its first zombie collision.')
            }
            if (centerZombie.state !== 'charred' || adjacentZombie.state !== 'charred') {
                details.push('Explode-o-nut should burn zombies within 90 pixels and one adjacent row.')
            }
            if (farZombie.state === 'charred') {
                details.push('Explode-o-nut should not burn zombies more than one row away.')
            }
            if (!explodeEvents.some((event) => event.type === 'explodeONutDetonated') ||
                !explodeEvents.some((event) =>
                    event.type === 'foleyRequested' &&
                    event.sound === SoundEffect.CherryBomb) ||
                !explodeEvents.some((event) =>
                    event.type === 'soundRequested' &&
                    event.sound === SoundEffect.BowlingImpact2)) {
                details.push('Explode-o-nut should emit its detonation, cherrybomb, and bowlingimpact2 events.')
            }
        }
    }

    const bowlingAdviceSession = new GameSession(wallnutOnlyBowlingLevel)
    const bowlingAdvicePacket = bowlingAdviceSession.conveyorPackets[0]
    const invalidBowlingCell = bowlingAdviceSession.geometry.gridToPixel(3, 2)
    if (bowlingAdvicePacket) {
        bowlingAdviceSession.drainEvents()
        bowlingAdviceSession.dispatch({ type: 'selectConveyorPacket', packetId: bowlingAdvicePacket.id })
        bowlingAdviceSession.dispatch({
            type: 'placePlant',
            x: invalidBowlingCell.x + 40,
            y: invalidBowlingCell.y + 50,
        })
        const firstBowlingAdvice = bowlingAdviceSession.drainEvents().filter((event) =>
            event.type === 'advice' &&
            event.message === 'Place your wall-nut to the left of the bowling line')
        bowlingAdviceSession.dispatch({
            type: 'placePlant',
            x: invalidBowlingCell.x + 40,
            y: invalidBowlingCell.y + 50,
        })
        const repeatedBowlingAdvice = bowlingAdviceSession.drainEvents().filter((event) =>
            event.type === 'advice' &&
            event.message === 'Place your wall-nut to the left of the bowling line')
        if (firstBowlingAdvice.length !== 1 || repeatedBowlingAdvice.length !== 0) {
            details.push('Adventure 1-5 should show the bowling-line advice only on the first invalid placement to the right of the line.')
        }
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

    const shooterRangeSession = new GameSession()
    const shooterRangeCenter = shooterRangeSession.geometry.gridToPixel(0, 2)
    shooterRangeSession.dispatch({ type: 'selectSeed', seedType: 'peashooter' })
    shooterRangeSession.dispatch({ type: 'placePlant', x: shooterRangeCenter.x + 40, y: shooterRangeCenter.y + 50 })
    const shooterRangePlant = shooterRangeSession.plants[0]
    const shooterRangeZombie = shooterRangeSession.addZombie('normal', 2, shooterRangePlant.x - 37)
    if (!shooterRangePlant || !shooterRangeZombie) {
        details.push('Shooter range setup should create a Peashooter and zombie in the active row.')
    } else {
        shooterRangeZombie.velocityX = 0
        shooterRangePlant.launchCounter = 1
        shooterRangeSession.drainEvents()
        shooterRangeSession.update()
        const beforeAttackLineEvents = shooterRangeSession.drainEvents()
        if (beforeAttackLineEvents.some((event) => event.type === 'animationRequested' && event.entityId === shooterRangePlant.id && event.animation === 'shoot')) {
            details.push('Peashooter should not shoot until the zombie body reaches the original plant attack rect at plant.x + 60.')
        }
        shooterRangeZombie.x = shooterRangePlant.x - 18
        shooterRangePlant.launchCounter = 1
        shooterRangeSession.update()
        const onAttackLineEvents = shooterRangeSession.drainEvents()
        if (!onAttackLineEvents.some((event) => event.type === 'animationRequested' && event.entityId === shooterRangePlant.id && event.animation === 'shoot')) {
            details.push('Peashooter should shoot once the zombie body reaches the original plant attack rect at plant.x + 60.')
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

    const originalLootRandom = Math.random
    try {
        Math.random = () => 0
        const noMoneySession = new GameSession()
        noMoneySession.addZombie('normal', 2, -20)
        noMoneySession.update()
        if (noMoneySession.items.some((item) => item.type === 'silver-coin' || item.type === 'gold-coin' || item.type === 'diamond')) {
            details.push('Adventure 1-1 should not drop regular money loot from zombies.')
        }
        const noEarlyAdventureMoneySession = new GameSession(ADVENTURE_1_2)
        noEarlyAdventureMoneySession.addZombie('normal', 2, -20)
        noEarlyAdventureMoneySession.update()
        if (noEarlyAdventureMoneySession.items.some((item) => item.type === 'silver-coin' || item.type === 'gold-coin' || item.type === 'diamond')) {
            details.push('First-time adventure should not drop regular money before level 2-1.')
        }
        const replayMoneySession = new GameSession(ADVENTURE_1_2, { firstTimeAdventure: false })
        replayMoneySession.addZombie('normal', 2, -20)
        replayMoneySession.update()
        if (!replayMoneySession.items.some((item) => item.type === 'silver-coin' || item.type === 'gold-coin' || item.type === 'diamond')) {
            details.push('Replay adventure should use the original regular money drop table.')
        }
    } finally {
        Math.random = originalLootRandom
    }

    const awardDropSession = new GameSession(ADVENTURE_1_4)
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
        const levelAwardItem = awardDropSession.items.find((item) => item.type === 'final-seed-packet' && !item.dead)
        if (!levelAwardItem) {
            details.push('The final zombie should drop the level award item.')
        } else if (levelAwardItem.awardKind !== 'shovel') {
            details.push('Adventure 1-4 should drop the shovel award instead of a seed packet.')
        }
        if (awardDropSession.sunSpawningEnabled) {
            details.push('Sky sun spawning should stop once the level award item drops.')
        }
        if (awardDropSession.zombies.length !== 0) {
            details.push('Dropping the level award should remove non-charred zombies from the board like the original RemoveAllZombies path.')
        }
    }
    const charredAwardSession = new GameSession(ADVENTURE_1_4)
    charredAwardSession.currentWave = charredAwardSession.numWaves
    const charredCherry = charredAwardSession.debugAddPlant('cherrybomb', 2, 2)
    const charredAwardZombie = charredAwardSession.debugAddZombie('normal', 2, charredCherry.x + 80)
    charredCherry.specialCounter = 1
    charredAwardSession.drainEvents()
    charredAwardSession.update()
    const charredAwardItem = charredAwardSession.items.find((item) => item.type === 'final-seed-packet' && !item.dead)
    if (!charredAwardItem) {
        details.push('A Cherry Bomb killing the final zombie should still drop the level award item.')
    }
    if (!charredAwardZombie || !charredAwardSession.zombies.includes(charredAwardZombie) || charredAwardZombie.state !== 'charred' || charredAwardZombie.dead) {
        details.push('Dropping the level award should not immediately remove a zombie burned into the charred ash animation.')
    }

    const debugAwardFallbackSession = new GameSession(ADVENTURE_1_4)
    debugAwardFallbackSession.currentWave = debugAwardFallbackSession.numWaves
    debugAwardFallbackSession.addZombie('normal', 2, 500)
    debugAwardFallbackSession.drainEvents()
    debugAwardFallbackSession.debugKillAllZombies()
    const fallbackAwardItem = debugAwardFallbackSession.items.find((item) => item.type === 'final-seed-packet' && !item.dead)
    if (!fallbackAwardItem || fallbackAwardItem.awardKind !== 'shovel') {
        details.push('Debug-killing the final zombies should still drop the Adventure 1-4 shovel award from the board center.')
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
