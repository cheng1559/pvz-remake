import type { Node } from 'cc'
import type { AnimNode } from '@/core/Animator/AnimNode'
import type { Animator } from '@/core/Animator'
import type { PlantAnimationView } from '../PlantAnimation'
import type { ZombieAnimationView } from '../ZombieAnimation'
import type { LawnMowerEntity, PlantEntity, ZombieType } from '../GameTypes'

export interface PlantView extends PlantAnimationView {
    node: Node
    animator: Animator | null
    highlighted: boolean
    highlightOverlay: Node | null
    shootingAnimationActive: boolean
    shootingAnimationToken: number
    wallnutDamageState: PlantEntity['state'] | null
    wallnutFrozen: boolean
}

export interface ZombieView extends ZombieAnimationView {
    node: Node
    clipNode: Node | null
    visualRootNode: Node | null
    bodyNode: Node | null
    shadowClipNode: Node | null
    shadowRootNode: Node | null
    shadowNode: Node | null
    moweredAnimator: Animator | null
    moweredAnimNode: AnimNode | null
    charredAnimator: Animator | null
    charredAnimNode: AnimNode | null
    showingMowered: boolean
    showingCharred: boolean
    baseColorSignature: string
    additiveSignature: string
}

export interface LawnMowerView {
    node: Node
    cachedNode: Node | null
    animatorNode: Node | null
    animNode: AnimNode | null
    state: LawnMowerEntity['state'] | null
}

export interface IntroLawnMowerView {
    row: number
    node: Node
    shadowNode: Node
}

export interface MoneyItemView {
    iconNode: Node | null
    glowNode: Node | null
    shineNode: Node | null
    animatorNode: Node | null
    animNode: AnimNode | null
}

export interface RenderEntitySnapshot {
    x: number
    y: number
    scale?: number
    alpha?: number
}

export interface IntroStreetZombieSpec {
    type: ZombieType
    gridX: number
    gridY: number
}

export interface SodRollView {
    node: Node
    animNode: AnimNode
}

export interface ProgressFlagView {
    totalWavesAtFlag: number
    poleNode: Node
    flagNode: Node
}

export interface BoardPixelRect {
    x: number
    y: number
    width: number
    height: number
}
