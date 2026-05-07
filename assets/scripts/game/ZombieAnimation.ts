import { Node } from 'cc'
import { Animator } from '@/core/Animator/Animator'
import type { AnimNode } from '@/core/Animator/AnimNode'
import type { ZombieEntity, ZombieType } from './GameTypes'

export type ZombieAnimationType =
    | ZombieType
    | 'newspaper'
    | 'screen-door'
    | 'pole-vaulter'
    | 'football'
    | 'dancing'
    | 'backup-dancer'
    | 'snorkel'
    | 'zamboni'
    | 'bobsled'
    | 'dolphin-rider'
    | 'jack-in-the-box'
    | 'balloon'
    | 'digger'
    | 'pogo'
    | 'yeti'
    | 'bungee'
    | 'ladder'
    | 'catapult'
    | 'gargantuar'
    | 'imp'

export interface ZombieAnimationView {
    animator: Animator | null
    body: AnimNode | null
    flag: AnimNode | null
    propeller: AnimNode | null
    currentAnimation: string
    currentAnimationSpeed: number
    currentAnimationTime: number
}

export interface PlayZombieBodyAnimationOptions {
    speed?: number
    time?: number
    manualTime?: boolean
    loop?: boolean
    blendTime?: number
}

export interface AttachFlagZombieAnimationOptions {
    enabled?: boolean
    animated?: boolean
    time?: number
    sortHost?: Animator | null
    zIndex?: number
}

const FLAG_ZOMBIE_ATTACHMENT_TRACK = 'Zombie_flag_attachment'
const FLAG_ZOMBIE_ATTACHMENT_Z = 17
const BALLOON_PROPELLER_ATTACHMENT_TRACK = 'hat'
const BALLOON_PROPELLER_ANIMATION = 'propeller'
const BALLOON_PROPELLER_FRAME_COUNT = 3

export function createZombieAnimationView(animator: Animator | null = null): ZombieAnimationView {
    return {
        animator,
        body: null,
        flag: null,
        propeller: null,
        currentAnimation: '',
        currentAnimationSpeed: 1,
        currentAnimationTime: 0,
    }
}

export function wireZombieAnimation(
    animator: Animator,
    view: ZombieAnimationView,
    zombieType: ZombieAnimationType,
) {
    view.animator = animator
    view.body = animator.addAnimNode('body')
    view.propeller = null
    configureZombieTracks(animator, zombieType)
    if (zombieType === 'balloon' && view.body) {
        view.propeller = animator.addAnimNode(BALLOON_PROPELLER_ANIMATION)
        view.propeller?.showOnlyTrack(BALLOON_PROPELLER_ANIMATION)
        view.propeller?.attachToTrack({
            node: view.body,
            track: BALLOON_PROPELLER_ATTACHMENT_TRACK,
        })
        view.propeller?.play({
            name: BALLOON_PROPELLER_ANIMATION,
            loop: true,
            speed: 1,
            frameCountOverride: BALLOON_PROPELLER_FRAME_COUNT,
            truncateDisappearingFrames: false,
        })
    }
}

export async function attachFlagZombieAnimation(
    parentNode: Node,
    view: ZombieAnimationView,
    animationJson: Record<string, any>,
    options: AttachFlagZombieAnimationOptions = {},
) {
    const {
        enabled = true,
        animated = true,
        time = 0,
        sortHost = null,
        zIndex = FLAG_ZOMBIE_ATTACHMENT_Z,
    } = options
    if (!parentNode.isValid || !view.body) return

    const flagNode = new Node('Flag')
    flagNode.layer = parentNode.layer
    if (sortHost) {
        sortHost.insertExternalNode(FLAG_ZOMBIE_ATTACHMENT_TRACK, flagNode, zIndex)
    } else {
        parentNode.addChild(flagNode)
    }
    const flagAnimator = flagNode.addComponent(Animator)
    flagAnimator.enabled = enabled
    await flagAnimator.parseJson(animationJson)
    if (!flagNode.isValid || !view.body) return

    view.flag = flagAnimator.addAnimNode('flag')
    view.flag?.attach({ node: view.body, slot: 'Zombie_flaghand' })
    view.flag?.play({ name: 'Zombie_flag', loop: true, speed: animated ? 15 / 12 : 0, time })
}

export function configureZombieTracks(animator: Animator, zombieType: ZombieAnimationType) {
    const hiddenByDefault = [
        'anim_cone',
        'anim_bucket',
        'anim_screendoor',
        'Zombie_flaghand',
        'Zombie_duckytube',
        'anim_tongue',
        'Zombie_mustache',
        'Zombie_innerarm_screendoor',
        'Zombie_innerarm_screendoor_hand',
        'Zombie_outerarm_screendoor',
    ]
    for (const track of hiddenByDefault) {
        animator.hideTrack(track)
    }

    switch (zombieType) {
        case 'traffic-cone':
            animator.showTrack('anim_cone')
            animator.hideTrack('anim_hair')
            break
        case 'bucket':
            animator.showTrack('anim_bucket')
            animator.hideTrack('anim_hair')
            break
        case 'ducky-tube':
            animator.showTrack('Zombie_duckytube')
            break
        case 'flag':
            animator.showTrack('Zombie_flaghand')
            animator.showTrack('Zombie_innerarm_screendoor')
            animator.hideTrack('anim_innerarm1')
            animator.hideTrack('anim_innerarm2')
            animator.hideTrack('anim_innerarm3')
            break
        case 'screen-door':
            animator.showTrack('anim_screendoor')
            animator.showTrack('Zombie_innerarm_screendoor')
            animator.showTrack('Zombie_innerarm_screendoor_hand')
            animator.showTrack('Zombie_outerarm_screendoor')
            animator.hideTrack('anim_innerarm1')
            animator.hideTrack('anim_innerarm2')
            animator.hideTrack('anim_innerarm3')
            animator.hidePrefix('Zombie_outerarm_hand')
            animator.hidePrefix('Zombie_outerarm_lower')
            animator.hidePrefix('Zombie_outerarm_upper')
            break
    }
}

export function syncZombieTrackVisibility(view: ZombieAnimationView, zombie: ZombieEntity) {
    const animator = view.animator
    if (!animator) return

    if (zombie.hasHead) {
        animator.showPrefix('anim_head')
        animator.showPrefix('anim_hair')
        if (zombie.hasTongue) {
            animator.showPrefix('anim_tongue')
        } else {
            animator.hidePrefix('anim_tongue')
        }
        if (zombie.type === 'traffic-cone' || zombie.type === 'bucket') {
            animator.hidePrefix('anim_hair')
        }
    } else {
        animator.hidePrefix('anim_head')
        animator.hidePrefix('anim_hair')
        animator.hidePrefix('anim_tongue')
    }

    if (!zombie.hasArm) {
        animator.hidePrefix('Zombie_outerarm_lower')
        animator.hidePrefix('Zombie_outerarm_hand')
        animator.setTrackImageOverride('Zombie_outerarm_upper', 'zombie_outerarm_upper2')
    } else {
        animator.showPrefix('Zombie_outerarm_lower')
        animator.showPrefix('Zombie_outerarm_hand')
        animator.setTrackImageOverride('Zombie_outerarm_upper', null)
    }

    if (zombie.type === 'traffic-cone') {
        if (zombie.helmHealth > 0) {
            animator.showTrack('anim_cone')
            animator.hidePrefix('anim_hair')
        } else {
            animator.hideTrack('anim_cone')
            if (zombie.hasHead) animator.showPrefix('anim_hair')
        }
    } else if (zombie.type === 'bucket') {
        if (zombie.helmHealth > 0) {
            animator.showTrack('anim_bucket')
            animator.hidePrefix('anim_hair')
        } else {
            animator.hideTrack('anim_bucket')
            if (zombie.hasHead) animator.showPrefix('anim_hair')
        }
    }
}

export function playZombieBodyAnimation(
    view: ZombieAnimationView,
    animation: string,
    options: PlayZombieBodyAnimationOptions = {},
) {
    const { speed = 1, time = 0, manualTime = true, loop, blendTime = 0 } = options
    if (!view.body) {
        view.currentAnimation = animation
        view.currentAnimationSpeed = speed
        view.currentAnimationTime = time
        return
    }

    if (view.currentAnimation === animation && view.body.isPlaying) {
        if (view.currentAnimationSpeed !== speed) {
            view.currentAnimationSpeed = speed
        }
        view.currentAnimationTime = time
        view.body.speed = manualTime ? 0 : speed
        if (manualTime) {
            view.body.time = time
        }
        return
    }

    view.currentAnimation = animation
    view.currentAnimationSpeed = speed
    view.currentAnimationTime = time
    const isDeathAnimation = isZombieDeathAnimation(animation)
    view.body.play({
        name: animation,
        loop: loop ?? !isDeathAnimation,
        speed: manualTime ? 0 : speed,
        time,
        blendTime,
        keepLastFrame: isDeathAnimation,
    })
}

function isZombieDeathAnimation(animation: string) {
    return (
        animation === 'anim_death' ||
        animation === 'anim_death2' ||
        animation === 'anim_superlongdeath' ||
        animation === 'anim_waterdeath'
    )
}
