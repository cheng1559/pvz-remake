import { Color, Graphics, Mask, Node, Rect, Size, Sprite, UIOpacity } from 'cc'
import { GameScreenEndSequences } from './GameScreenEndSequences'
import { Animator } from '@/core/Animator'
import { SpriteLoader } from '@/core/SpriteLoader'
import { getAtlasFrame, SEED_PACKET_HEIGHT, SEED_PACKET_WIDTH, SeedPacketRenderer } from '@/ui/SeedPacketRenderer'
import { createSpriteNode, createUINode, setUISize } from '@/ui/UIFactory'
import { GAME_TICK_SECONDS, SEED_DEFINITIONS } from '../GameDefinitions'
import {
    attachFlagZombieAnimation,
    createZombieAnimationView,
    playZombieBodyAnimation,
    syncZombieTrackVisibility,
    wireZombieAnimation,
} from '../ZombieAnimation'
import {
    getAnimationRateSpeed,
    playPotatoArmedAnimation,
    wirePlantAnimation,
} from '../PlantAnimation'
import { lerp } from './GameScreenMath'
import {
    MONEY_COIN_ANIMATION_SPEED_MAX,
    MONEY_COIN_ANIMATION_SPEED_MIN,
    MONEY_COIN_REANIM_X,
    MONEY_COIN_REANIM_Y,
    MONEY_DIAMOND_ANIMATION_RATE_MAX,
    MONEY_DIAMOND_ANIMATION_RATE_MIN,
    MONEY_DIAMOND_REANIM_X,
    MONEY_DIAMOND_REANIM_Y,
    MONEY_ITEM_SPRITES,
    MONEY_STATIC_GLOW_X,
    MONEY_STATIC_GLOW_Y,
} from './MoneyItemVisualConfig'
import {
    PLANT_SHADOW_ADJUSTMENTS,
    PLANT_VISUAL_ADJUSTMENTS,
    PROJECTILE_SHADOW_ADJUSTMENTS,
    PROJECTILE_SHADOW_COLUMNS,
    PROJECTILE_SHADOW_DAY_CEL,
    PROJECTILE_SHADOW_HEIGHT,
    PROJECTILE_SHADOW_WIDTH,
    PROJECTILE_SPRITES,
} from './GameVisualConfig'
import {
    CHOMPER_BITE_ANIM_RATE,
    CHOMPER_CHEW_ANIM_RATE,
    CHOMPER_SWALLOW_ANIM_RATE,
    DEBUG_ATTACK_RECT_COLOR,
    DEBUG_BODY_RECT_COLOR,
    DEBUG_HITBOX_EDGE_WIDTH,
    GAMEPLAY_LAWN_MOWER_REANIM_X_OFFSET,
    GAMEPLAY_LAWN_MOWER_REANIM_Y_OFFSET,
    GAME_OVER_DAY_ZOMBIE_CLIP_X,
    GAME_OVER_WINNER_WALK_START_TICKS,
    INTRO_LAWN_MOWER_SCALE,
    LAWN_MOWER_CACHED_DRAW_OFFSET_X,
    LEVEL_AWARD_FLASH_TIME,
    PLANT_HIGHLIGHT_COLOR,
    POTATO_MINE_RISE_ANIM_RATE,
    ZOMBIE_BODY_REANIM_OFFSET_X,
    ZOMBIE_BODY_REANIM_OFFSET_Y,
    ZOMBIE_REANIM_BLEND_TIME,
} from './GameScreenCore'
import type {
    GameEntity,
    ItemEntity,
    LawnMowerEntity,
    PlantEntity,
    PlantType,
    ProjectileEntity,
    ZombieEntity,
} from '../GameTypes'
import type {
    LawnMowerView,
    MoneyItemView,
    PlantView,
    RenderEntitySnapshot,
    ZombieView,
} from './GameScreenViewTypes'

export abstract class GameEntityRenderer extends GameScreenEndSequences {
    protected _syncEntity(entity: GameEntity) {
        let node = this._entityNodes.get(entity.id)
        if (!node) {
            node = this._createEntityNode(entity)
            this._entityNodes.set(entity.id, node)
        }
        const renderState = this._getRenderEntityState(entity)
        if (entity.kind === 'item') {
            node.setPosition(
                renderState.x + entity.width / 2,
                -(renderState.y + entity.height / 2),
                this._entityZ(entity),
            )
            const scale = renderState.scale ?? entity.scale
            if (entity.type === 'final-seed-packet') {
                node.setScale(1, 1, 1)
                if (entity.awardKind === 'shovel') {
                    this._syncFinalShovelVisual(node, scale, entity.age, entity.beingCollected)
                } else {
                    this._syncFinalSeedPacketVisual(node, scale)
                }
            } else {
                node.setScale(scale, scale, 1)
            }
            const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity)
            opacity.opacity = renderState.alpha ?? entity.alpha
            this._syncMoneyItemAnimation(entity)
            return
        }
        node.setPosition(renderState.x, -renderState.y, this._entityZ(entity))
        if (entity.kind === 'plant') {
            this._syncPlantAnimation(entity)
        } else if (entity.kind === 'zombie') {
            this._syncZombieGameOverClip(entity, renderState)
            this._syncZombieAnimation(entity)
        } else if (entity.kind === 'lawnmower') {
            this._syncLawnMowerAnimation(entity)
        }
    }

    protected _getRenderEntityState(entity: GameEntity): RenderEntitySnapshot {
        if (entity.kind === 'zombie' &&
            this._gameOverActive &&
            entity.id === this._gameOverWinnerZombieId) {
            return {
                x: entity.x,
                y: entity.y,
            }
        }

        const previous = this._previousEntitySnapshots.get(entity.id)
        if (!previous || this._session.paused) return this._createRenderEntitySnapshot(entity)

        const t = this._renderInterpolationAlpha()
        const current = this._createRenderEntitySnapshot(entity)
        return {
            x: lerp(previous.x, current.x, t),
            y: lerp(previous.y, current.y, t),
            scale: previous.scale == null || current.scale == null
                ? current.scale
                : lerp(previous.scale, current.scale, t),
            alpha: previous.alpha == null || current.alpha == null
                ? current.alpha
                : Math.round(lerp(previous.alpha, current.alpha, t)),
        }
    }

    protected _renderInterpolationAlpha() {
        return Math.max(0, Math.min(1, this._gameAccumulator / GAME_TICK_SECONDS))
    }

    protected _createEntityNode(entity: GameEntity) {
        switch (entity.kind) {
            case 'plant':
                return this._createPlantNode(entity)
            case 'zombie':
                return this._createZombieNode(entity)
            case 'projectile':
                return this._createProjectileNode(entity)
            case 'item':
                return this._createItemNode(entity)
            case 'lawnmower':
                return this._createLawnMowerNode(entity)
        }
    }

    protected _syncEntityLayerOrder() {
        const entries: { node: Node, order: number }[] = []
        for (const entity of [
            ...this._session.plants,
            ...this._session.zombies,
            ...this._session.projectiles,
            ...this._session.lawnMowers,
        ]) {
            const node = this._entityNodes.get(entity.id)
            if (!node?.isValid) continue

            const rowOrder = entity.row * 10
            const typeOrder =
                entity.kind === 'lawnmower' ? 3 :
                    entity.kind === 'projectile' ? 2 :
                    entity.kind === 'zombie' ? 1 : 0
            entries.push({ node, order: rowOrder + typeOrder })
        }

        entries.sort((a, b) => a.order - b.order)
        for (let i = 0; i < entries.length; i++) {
            entries[i].node.setSiblingIndex(i)
        }
    }

    protected _drawHitboxDebug() {
        const graphics = this._collisionDebugGraphics
        if (!graphics) return

        graphics.clear()
        if (!this._debugHitboxesVisible) return

        for (const plant of this._session.plants) {
            if (plant.dead) continue
            const rect = this._session.debugGetPlantBodyRect(plant)
            this._drawBoardDebugRect(
                graphics,
                rect.x,
                rect.y,
                rect.width,
                rect.height,
                DEBUG_BODY_RECT_COLOR,
            )
        }

        for (const zombie of this._session.zombies) {
            if (zombie.dead) continue
            if (zombie.state === 'dying' || zombie.state === 'mowered' || zombie.state === 'charred') continue
            this._drawBoardDebugRect(
                graphics,
                zombie.x + zombie.bodyRect.x,
                zombie.y + zombie.bodyRect.y,
                zombie.bodyRect.width,
                zombie.bodyRect.height,
                DEBUG_BODY_RECT_COLOR,
            )
            this._drawBoardDebugRect(
                graphics,
                zombie.x + zombie.attackRect.x,
                zombie.y + zombie.attackRect.y,
                zombie.attackRect.width,
                zombie.attackRect.height,
                DEBUG_ATTACK_RECT_COLOR,
            )
        }

        for (const projectile of this._session.projectiles) {
            if (projectile.dead) continue
            const rect = projectile.getProjectileRect()
            this._drawBoardDebugRect(
                graphics,
                rect.x,
                rect.y,
                rect.width,
                rect.height,
                DEBUG_ATTACK_RECT_COLOR,
            )
        }

        for (const mower of this._session.lawnMowers) {
            if (mower.dead) continue
            const rect = this._session.debugGetLawnMowerAttackRect(mower)
            this._drawBoardDebugRect(
                graphics,
                rect.x,
                rect.y,
                rect.width,
                rect.height,
                DEBUG_ATTACK_RECT_COLOR,
            )
        }

        this._collisionDebugLayer?.setSiblingIndex(this._entityLayer.children.length - 1)
    }

    protected _drawBoardDebugRect(graphics: Graphics, x: number, y: number, width: number, height: number, color: Color) {
        graphics.fillColor = color
        graphics.fillRect(x, -(y + DEBUG_HITBOX_EDGE_WIDTH), width + DEBUG_HITBOX_EDGE_WIDTH, DEBUG_HITBOX_EDGE_WIDTH)
        graphics.fillRect(x, -(y + height + DEBUG_HITBOX_EDGE_WIDTH), width + DEBUG_HITBOX_EDGE_WIDTH, DEBUG_HITBOX_EDGE_WIDTH)
        if (height <= DEBUG_HITBOX_EDGE_WIDTH) return

        graphics.fillRect(x, -(y + height), DEBUG_HITBOX_EDGE_WIDTH, height - DEBUG_HITBOX_EDGE_WIDTH)
        graphics.fillRect(
            x + width,
            -(y + height),
            DEBUG_HITBOX_EDGE_WIDTH,
            height - DEBUG_HITBOX_EDGE_WIDTH,
        )
    }

    protected _createPlantNode(plant: PlantEntity) {
        const node = createUINode(`Plant_${plant.id}`, { parent: this._entityLayer, anchorX: 0, anchorY: 1, width: 100, height: 100 })
        const view = this._createPlantVisual(node, plant.type, true, 255, true, 0, plant.id)
        this._plantViews.set(plant.id, view)
        return node
    }

    protected _createZombieNode(zombie: ZombieEntity) {
        const node = createUINode(`Zombie_${zombie.id}`, { parent: this._entityLayer, anchorX: 0, anchorY: 1, width: 120, height: 120 })
        const view = this._createZombieVisual(node, zombie)
        this._zombieViews.set(zombie.id, view)
        return node
    }

    protected _createProjectileNode(projectile: ProjectileEntity) {
        const node = createUINode(`Projectile_${projectile.id}`, {
            parent: this._entityLayer,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: projectile.width,
            height: projectile.height,
        })

        const shadow = SpriteLoader.get('pea_shadows')
        if (shadow) {
            const adjust = PROJECTILE_SHADOW_ADJUSTMENTS[projectile.type]
            const shadowFrame = getAtlasFrame(
                shadow,
                PROJECTILE_SHADOW_DAY_CEL,
                PROJECTILE_SHADOW_WIDTH,
                PROJECTILE_SHADOW_HEIGHT,
                PROJECTILE_SHADOW_COLUMNS,
            )
            const shadowNode = createSpriteNode({
                name: 'ProjectileShadow',
                spriteFrame: shadowFrame,
                parent: node,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
                x: adjust.offsetX,
                y: -(projectile.shadowY - projectile.y),
                z: -1,
            })
            const scale = adjust.scale ?? 1
            shadowNode.setScale(scale, scale, 1)
        }

        const spriteFrame = SpriteLoader.get(PROJECTILE_SPRITES[projectile.type])
        if (spriteFrame) {
            createSpriteNode({
                name: 'ProjectileSprite',
                spriteFrame,
                parent: node,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
            })
        }

        return node
    }

    protected _createZombieVisual(
        node: Node,
        zombie: ZombieEntity,
        options: { manualTime?: boolean } = {},
    ): ZombieView {
        const view: ZombieView = {
            node,
            clipNode: null,
            visualRootNode: null,
            bodyNode: null,
            shadowNode: null,
            moweredAnimNode: null,
            charredAnimNode: null,
            showingMowered: false,
            showingCharred: false,
            ...createZombieAnimationView(),
        }
        const clipNode = createUINode('ZombieClip', {
            parent: node,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: this._session.geometry.width,
            height: this._session.geometry.height,
        })
        const visualRootNode = createUINode('ZombieVisualRoot', {
            parent: clipNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 120,
            height: 120,
        })
        view.clipNode = clipNode
        view.visualRootNode = visualRootNode
        const visualParent = visualRootNode
        const shadow = SpriteLoader.get('plantshadow')
        if (shadow) {
            view.shadowNode = createSpriteNode({
                name: 'ZombieShadow',
                spriteFrame: shadow,
                parent: visualParent,
                x: 23,
                y: -92,
            })
        }
        const zombieAnimation = this._zombieAnimations.get(zombie.type)
        if (zombieAnimation?.json) {
            const animatorNode = new Node('Animator')
            animatorNode.layer = node.layer
            animatorNode.setPosition(ZOMBIE_BODY_REANIM_OFFSET_X, ZOMBIE_BODY_REANIM_OFFSET_Y, 0)
            visualParent.addChild(animatorNode)
            view.bodyNode = animatorNode
            const animator = animatorNode.addComponent(Animator)
            view.animator = animator
            animator.enabled = this._isZombieSceneAnimationEnabled(zombie.id)
            const animationJson = zombieAnimation.json as Record<string, any>
            void animator.parseJson(animationJson).then(() => {
                animator.enabled = this._isZombieSceneAnimationEnabled(zombie.id)
                wireZombieAnimation(animator, view, zombie.type)
                syncZombieTrackVisibility(view, zombie)
                if (zombie.state === 'mowered') {
                    this._syncMoweredZombieAnimation(view, zombie)
                } else if (zombie.state === 'charred') {
                    this._syncCharredZombieAnimation(view, zombie)
                } else {
                    const animation = view.body?.hasAnimation(zombie.currentAnimation)
                        ? zombie.currentAnimation
                        : zombie.currentAnimation === 'anim_idle2' && view.body?.hasAnimation('anim_idle')
                            ? 'anim_idle'
                            : zombie.currentAnimation
                    playZombieBodyAnimation(view, animation, {
                        speed: zombie.animationSpeed,
                        time: zombie.animationTime,
                        manualTime: options.manualTime,
                    })
                }
                if (zombie.type === 'flag') {
                    this._attachFlagZombieVisual(animatorNode, view, zombie)
                }
                this._syncZombieHitFlash(view, zombie)
                this._syncSceneAnimationState()
            })
        }
        return view
    }

    protected _createItemNode(item: ItemEntity) {
        const node = createUINode(`Item_${item.id}`, {
            parent: this._itemLayer,
            anchorX: 0.5,
            anchorY: 0.5,
            width: item.width,
            height: item.height,
        })
        node.addComponent(UIOpacity).opacity = item.alpha
        if (item.type === 'sun' || item.type === 'small-sun' || item.type === 'large-sun') {
            this._createSunVisual(node)
        } else if (item.type === 'final-seed-packet' && item.awardKind === 'shovel') {
            this._createFinalShovelVisual(node, item)
        } else if (item.type === 'final-seed-packet') {
            this._createFinalSeedPacketVisual(node, item)
        } else {
            this._createMoneyItemVisual(node, item)
        }
        return node
    }

    protected _createLawnMowerNode(mower: LawnMowerEntity) {
        const node = createUINode(`LawnMower_${mower.id}`, {
            parent: this._entityLayer,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 120,
            height: 120,
        })
        const view: LawnMowerView = {
            node,
            cachedNode: null,
            animatorNode: null,
            animNode: null,
            state: null,
        }
        this._lawnMowerViews.set(mower.id, view)

        const shadow = SpriteLoader.get('plantshadow')
        if (shadow) {
            const shadowOffset = this._getReadyLawnMowerShadowOffset()
            createSpriteNode({
                name: 'LawnMowerShadow',
                spriteFrame: shadow,
                parent: node,
                layer: this.node.layer,
                anchorX: 0.5,
                anchorY: 0.5,
                x: shadowOffset.x,
                y: -shadowOffset.y,
                z: -1,
            })
        }

        const cachedMower = SpriteLoader.get('lawnmower_cached')
        if (cachedMower) {
            view.cachedNode = createSpriteNode({
                name: 'CachedMower',
                spriteFrame: cachedMower,
                parent: node,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
                x: GAMEPLAY_LAWN_MOWER_REANIM_X_OFFSET + LAWN_MOWER_CACHED_DRAW_OFFSET_X,
                y: -GAMEPLAY_LAWN_MOWER_REANIM_Y_OFFSET,
            })
        }

        if (this._lawnMowerAnimation?.json) {
            const animatorNode = createUINode('Animator', {
                parent: node,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
                width: 120,
                height: 120,
                x: GAMEPLAY_LAWN_MOWER_REANIM_X_OFFSET,
                y: -GAMEPLAY_LAWN_MOWER_REANIM_Y_OFFSET,
            })
            animatorNode.setScale(INTRO_LAWN_MOWER_SCALE, INTRO_LAWN_MOWER_SCALE, 1)
            animatorNode.active = false
            view.animatorNode = animatorNode
            const animator = animatorNode.addComponent(Animator)
            animator.enabled = this._isGameplaySceneAnimationEnabled()
            void animator.parseJson(this._lawnMowerAnimation.json as Record<string, any>).then(() => {
                animator.enabled = this._isGameplaySceneAnimationEnabled()
                view.animNode = animator.addAnimNode('default')
                this._syncLawnMowerAnimation(mower)
                this._syncSceneAnimationState()
            })
        }

        return node
    }

    protected _syncLawnMowerAnimation(mower: LawnMowerEntity) {
        const view = this._lawnMowerViews.get(mower.id)
        if (!view) return

        if (view.cachedNode?.isValid) view.cachedNode.active = mower.state === 'ready'
        if (view.animatorNode?.isValid) view.animatorNode.active = mower.state === 'triggered'
        if (!view.animNode) return

        const speed = mower.state === 'triggered'
            ? getAnimationRateSpeed(view.animNode, 'anim_normal', 70)
            : 0
        if (view.state !== mower.state) {
            view.animNode.play({
                name: 'anim_normal',
                loop: true,
                speed,
            })
            view.state = mower.state
            return
        }
        view.animNode.speed = speed
    }

    protected _createSunVisual(node: Node) {
        if (!this._sunAnimation?.json) {
            const sunFrame = SpriteLoader.get('sun1')
            if (sunFrame) createSpriteNode({ spriteFrame: sunFrame, parent: node, x: 0, y: 0 })
            return
        }

        const animatorNode = new Node('Animator')
        animatorNode.layer = node.layer
        animatorNode.setPosition(0, 0, 0)
        node.addChild(animatorNode)
        const animator = animatorNode.addComponent(Animator)
        animator.enabled = this._isGameplaySceneAnimationEnabled()
        void animator.parseJson(this._sunAnimation.json as Record<string, any>).then(() => {
            animator.enabled = this._isGameplaySceneAnimationEnabled()
            const sun = animator.addAnimNode('default')
            sun?.play({ name: 'default', speed: getAnimationRateSpeed(sun, 'default', 6), loop: true })
            this._syncSceneAnimationState()
        })
    }

    protected _createMoneyItemVisual(node: Node, item: ItemEntity) {
        const spriteName = MONEY_ITEM_SPRITES[item.type]
        if (!spriteName) return

        const spriteFrame = SpriteLoader.get(spriteName)
        if (!spriteFrame) return

        const view: MoneyItemView = {
            iconNode: null,
            glowNode: null,
            shineNode: null,
            animatorNode: null,
            animNode: null,
        }

        if (item.type === 'silver-coin' || item.type === 'gold-coin') {
            const glowFrame = SpriteLoader.get('coinglow')
            if (glowFrame) {
                view.glowNode = createSpriteNode({
                    name: 'MoneyGlow',
                    spriteFrame: glowFrame,
                    parent: node,
                    layer: this.node.layer,
                    anchorX: 0.5,
                    anchorY: 0.5,
                    x: MONEY_STATIC_GLOW_X,
                    y: MONEY_STATIC_GLOW_Y,
                    z: -1,
                })
                view.glowNode.addComponent(UIOpacity).opacity = 255
            }
        }

        view.iconNode = createSpriteNode({
            name: 'MoneyItem',
            spriteFrame,
            parent: node,
            layer: this.node.layer,
            anchorX: 0.5,
            anchorY: 0.5,
        })

        if (item.type === 'silver-coin' || item.type === 'gold-coin') {
            this._createCoinReanimVisual(node, item, view)
        }

        if (item.type === 'diamond') {
            const shineFrame = SpriteLoader.get('diamond_shine1')
            if (shineFrame) {
                view.shineNode = createSpriteNode({
                    name: 'DiamondShine',
                    spriteFrame: shineFrame,
                    parent: node,
                    layer: this.node.layer,
                    anchorX: 0.5,
                    anchorY: 0.5,
                    z: 1,
                })
            }
            this._createDiamondReanimVisual(node, item, view)
        }

        this._moneyItemViews.set(item.id, view)
    }

    protected _createCoinReanimVisual(parent: Node, item: ItemEntity, view: MoneyItemView) {
        const animation = item.type === 'silver-coin'
            ? this._silverCoinAnimation
            : this._goldCoinAnimation
        if (!animation?.json) return

        const animatorNode = createUINode('MoneyReanim', {
            parent,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            x: MONEY_COIN_REANIM_X,
            y: MONEY_COIN_REANIM_Y,
        })
        animatorNode.addComponent(UIOpacity).opacity = 0
        view.animatorNode = animatorNode

        const animator = animatorNode.addComponent(Animator)
        animator.enabled = this._isGameplaySceneAnimationEnabled()
        void animator.parseJson(animation.json as Record<string, any>).then(() => {
            animator.enabled = this._isGameplaySceneAnimationEnabled()
            const animNode = animator.addAnimNode('default')
            view.animNode = animNode
            const duration = animNode?.getAnimationDuration('default') ?? 0
            const speedSeed = this._deterministicUnit(item.id * 78.233)
            animNode?.play({
                name: 'default',
                loop: true,
                speed: MONEY_COIN_ANIMATION_SPEED_MIN +
                    (MONEY_COIN_ANIMATION_SPEED_MAX - MONEY_COIN_ANIMATION_SPEED_MIN) * speedSeed,
                time: Math.max(0, duration - 1) * this._deterministicUnit(item.id * 12.9898),
            })
            this._syncMoneyItemAnimation(item)
            this._syncSceneAnimationState()
        })
    }

    protected _createDiamondReanimVisual(parent: Node, item: ItemEntity, view: MoneyItemView) {
        const animation = this._diamondAnimation
        if (!animation?.json) return

        const animatorNode = createUINode('DiamondReanim', {
            parent,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            x: MONEY_DIAMOND_REANIM_X,
            y: MONEY_DIAMOND_REANIM_Y,
        })
        animatorNode.addComponent(UIOpacity).opacity = 0
        view.animatorNode = animatorNode

        const animator = animatorNode.addComponent(Animator)
        animator.enabled = this._isGameplaySceneAnimationEnabled()
        void animator.parseJson(animation.json as Record<string, any>).then(() => {
            animator.enabled = this._isGameplaySceneAnimationEnabled()
            const animNode = animator.addAnimNode('default')
            view.animNode = animNode
            const duration = animNode?.getAnimationDuration('default') ?? 0
            const animRate = MONEY_DIAMOND_ANIMATION_RATE_MIN +
                (MONEY_DIAMOND_ANIMATION_RATE_MAX - MONEY_DIAMOND_ANIMATION_RATE_MIN) * Math.random()
            animNode?.play({
                name: 'default',
                loop: true,
                speed: getAnimationRateSpeed(animNode, 'default', animRate),
                time: Math.max(0, duration - 1) * this._deterministicUnit(item.id * 12.9898),
            })
            this._syncMoneyItemAnimation(item)
            this._syncSceneAnimationState()
        })
    }

    protected _syncMoneyItemAnimation(item: ItemEntity) {
        const view = this._moneyItemViews.get(item.id)
        if (!view) return

        if (item.type === 'silver-coin' || item.type === 'gold-coin') {
            const shouldAnimate = item.hitGround && !item.beingCollected
            if (view.iconNode?.isValid) {
                view.iconNode.active = !shouldAnimate
                view.iconNode.setScale(1, 1, 1)
            }
            if (view.glowNode?.isValid) {
                view.glowNode.active = !shouldAnimate
                const opacity = view.glowNode.getComponent(UIOpacity) ?? view.glowNode.addComponent(UIOpacity)
                opacity.opacity = 255
            }
            if (view.animatorNode?.isValid) {
                const opacity = view.animatorNode.getComponent(UIOpacity) ?? view.animatorNode.addComponent(UIOpacity)
                opacity.opacity = shouldAnimate ? 255 : 0
            }
            return
        }

        if (item.type !== 'diamond') return

        const hasReanim = !!view.animNode
        if (view.iconNode?.isValid) view.iconNode.active = !hasReanim
        if (view.shineNode?.isValid) view.shineNode.active = !hasReanim
        if (view.animatorNode?.isValid) {
            const opacity = view.animatorNode.getComponent(UIOpacity) ?? view.animatorNode.addComponent(UIOpacity)
            opacity.opacity = hasReanim ? 255 : 0
        }
    }

    protected _deterministicUnit(seed: number) {
        const value = Math.sin(seed) * 10000
        return value - Math.floor(value)
    }

    protected _createFinalSeedPacketVisual(node: Node, item: ItemEntity) {
        const seedType = item.awardSeedType ?? 'sunflower'
        SeedPacketRenderer.drawSeedPacket({
            name: 'FinalSeedPacketNormal',
            parent: node,
            layer: this.node.layer,
            x: 0,
            y: 0,
            seedType,
            cost: SEED_DEFINITIONS[seedType].cost,
            seeds: SpriteLoader.get('seeds'),
            packetPlants: SpriteLoader.get('packet_plants'),
            cachedPacketPlants: SpriteLoader.get('packet_plants_cached'),
            costFont: this._packetCostFont,
        })
        SeedPacketRenderer.drawSeedPacket({
            name: 'FinalSeedPacketLarge',
            parent: node,
            layer: this.node.layer,
            x: 0,
            y: 0,
            scale: 2,
            seedType,
            cost: SEED_DEFINITIONS[seedType].cost,
            seeds: null,
            seedPacketLarger: SpriteLoader.get('seedpacket_larger'),
            plantPreviews: SpriteLoader.get('plant_previews_cached'),
            costFont: this._packetCostFont,
        })
        this._syncFinalSeedPacketVisual(node, item.scale)
    }

    protected _createFinalShovelVisual(node: Node, item: ItemEntity) {
        const shovel = SpriteLoader.get('shovel_hi_res')
        if (!shovel) return

        createSpriteNode({
            name: 'FinalShovelBase',
            spriteFrame: shovel,
            parent: node,
            layer: this.node.layer,
            anchorX: 0.5,
            anchorY: 0.5,
            x: 0,
            y: 0,
        })
        const flashNode = createSpriteNode({
            name: 'FinalShovelFlash',
            spriteFrame: shovel,
            parent: node,
            layer: this.node.layer,
            anchorX: 0.5,
            anchorY: 0.5,
            x: 0,
            y: 0,
        })
        flashNode.getComponent(Sprite)!.color = new Color(0, 0, 0, 255)
        this._syncFinalShovelVisual(node, item.scale, item.age, false)
    }

    protected _syncFinalSeedPacketVisual(node: Node, scale: number) {
        const visualScale = Math.max(0.001, scale)
        const normalPacket = node.children.find((child) => child.name === 'FinalSeedPacketNormal')
        const largePacket = node.children.find((child) => child.name === 'FinalSeedPacketLarge')
        const topLeftX = -SEED_PACKET_WIDTH * visualScale / 2
        const topLeftY = SEED_PACKET_HEIGHT * visualScale / 2

        if (normalPacket?.isValid) {
            normalPacket.active = visualScale <= 1
            normalPacket.setScale(visualScale, visualScale, 1)
            normalPacket.setPosition(topLeftX, topLeftY, 0)
        }
        if (largePacket?.isValid) {
            largePacket.active = visualScale > 1
            largePacket.setScale(visualScale / 2, visualScale / 2, 1)
            largePacket.setPosition(topLeftX, topLeftY, 0)
        }
    }

    protected _syncFinalShovelVisual(node: Node, scale: number, age: number, beingCollected: boolean) {
        const base = node.children.find((child) => child.name === 'FinalShovelBase')
        const flash = node.children.find((child) => child.name === 'FinalShovelFlash')
        if (!base?.isValid || !flash?.isValid) return

        const visualScale = Math.max(0.001, scale)
        base.setScale(visualScale * 0.5, visualScale * 0.5, 1)
        flash.setScale(visualScale * 0.5, visualScale * 0.5, 1)
        base.setPosition(0, 0, 0)
        flash.setPosition(0, 0, 0)

        const flashSprite = flash.getComponent(Sprite)
        const flashOpacity = flash.getComponent(UIOpacity) ?? flash.addComponent(UIOpacity)
        if (!flashSprite) return

        if (scale < 0.001 || beingCollected) {
            flash.active = false
            flashOpacity.opacity = 0
            return
        }

        flash.active = true
        const ageInFlashCycle = age % LEVEL_AWARD_FLASH_TIME
        const half = LEVEL_AWARD_FLASH_TIME / 2
        const grayness = Math.min(255, Math.round(55 + 200 * Math.abs(half - ageInFlashCycle) / half))
        flashOpacity.opacity = 255 - grayness
    }

    protected _syncPlantHighlights() {
        const highlightedPlantId = this._session.selectedTool === 'shovel'
            ? this._session.getPlantAt(this._mousePixel.x, this._mousePixel.y)?.id ?? null
            : null

        for (const [plantId, view] of this._plantViews) {
            const plant = this._session.plants.find((item) => item.id === plantId)
            const highlighted = plantId === highlightedPlantId
            if (highlighted) {
                this._showPlantHighlight(view)
            } else if (plant && plant.eatenFlashCounter > 0) {
                this._showPlantEatenFlash(view, plant.eatenFlashCounter)
            } else {
                this._hidePlantHighlight(view)
            }
            view.highlighted = highlighted
        }
    }

    protected _showPlantHighlight(view: PlantView) {
        view.animator?.setExtraAdditiveDraw(true, PLANT_HIGHLIGHT_COLOR)
    }

    protected _hidePlantHighlight(view: PlantView) {
        view.animator?.setExtraAdditiveDraw(false)
    }

    protected _showPlantEatenFlash(view: PlantView, flashCounter: number) {
        const grayness = Math.min(255, flashCounter * 3)
        view.animator?.setExtraAdditiveDraw(true, new Color(grayness, grayness, grayness, 255))
    }

    protected _createPlantVisual(
        node: Node,
        plantType: PlantType,
        includeShadow: boolean,
        opacity: number,
        animated: boolean,
        staticAnimTime: number,
        plantId?: number,
    ): PlantView {
        const shadow = SpriteLoader.get('plantshadow')
        if (includeShadow && shadow) {
            const shadowAdjust = PLANT_SHADOW_ADJUSTMENTS[plantType] ?? { offsetX: -3, offsetY: 51 }
            const shadowNode = createSpriteNode({
                name: 'PlantShadow',
                spriteFrame: shadow,
                parent: node,
                x: shadowAdjust.offsetX,
                y: -shadowAdjust.offsetY,
            })
            const shadowScale = shadowAdjust.scale ?? 1
            shadowNode.setScale(shadowScale, shadowScale, 1)
        }

        const view: PlantView = {
            node,
            plantType,
            animator: null,
            body: null,
            head: null,
            face: null,
            face2: null,
            glow: null,
            idleSpeed: 1,
            highlighted: false,
            highlightOverlay: null,
            shootingAnimationActive: false,
            shootingAnimationToken: 0,
            wallnutDamageState: null,
            wallnutFrozen: false,
        }
        const plantAnimation = this._plantAnimations.get(plantType)
        if (plantAnimation?.json) {
            const animatorNode = new Node('Animator')
            animatorNode.layer = node.layer
            const visualAdjust = PLANT_VISUAL_ADJUSTMENTS[plantType]
            animatorNode.setPosition(visualAdjust?.offsetX ?? 0, -(visualAdjust?.offsetY ?? 0), 0)
            const visualScale = visualAdjust?.scale ?? 1
            animatorNode.setScale(visualScale, visualScale, 1)
            node.addChild(animatorNode)
            const animator = animatorNode.addComponent(Animator)
            view.animator = animator
            animator.enabled = this._isGameplaySceneAnimationEnabled()
            const animationJson = plantAnimation.json as Record<string, any>
            void animator.parseJson(animationJson).then(() => {
                animator.enabled = this._isGameplaySceneAnimationEnabled()
                this._setAnimatorOpacity(animator, animationJson, opacity)
                wirePlantAnimation(animator, view, plantType, { animated, staticAnimTime, shakeNode: animatorNode })
                const currentPlant = plantId == null
                    ? null
                    : this._session.plants.find((item) => item.id === plantId)
                if (currentPlant) this._syncPlantAnimation(currentPlant)
                this._syncSceneAnimationState()
            })
        }
        return view
    }

    protected _setAnimatorOpacity(animator: Animator, animationJson: Record<string, any>, opacity: number) {
        const color = new Color(255, 255, 255, opacity)
        for (const nodeData of Object.values(animationJson)) {
            const tracks = (nodeData as { tracks?: Record<string, unknown> }).tracks
            if (!tracks) continue
            for (const trackName of Object.keys(tracks)) {
                animator.setTrackColor(trackName, color)
            }
        }
    }

    protected _attachFlagZombieVisual(parentNode: Node, view: ZombieView, zombie: ZombieEntity) {
        if (!this._flagZombieAnimation?.json || !view.body) return

        const animationJson = this._flagZombieAnimation.json as Record<string, any>
        void attachFlagZombieAnimation(parentNode, view, animationJson, {
            enabled: this._isZombieSceneAnimationEnabled(zombie.id),
            sortHost: view.animator,
        }).then(() => {
            syncZombieTrackVisibility(view, zombie)
            this._syncSceneAnimationState()
        })
    }

    protected _syncZombieGameOverClip(zombie: ZombieEntity, renderState: RenderEntitySnapshot) {
        const view = this._zombieViews.get(zombie.id)
        if (!view) return

        if (!this._gameOverActive || zombie.id !== this._gameOverWinnerZombieId) {
            view.node.active = true
            this._clearZombieGameOverClip(view)
            return
        }

        const visible = this._gameOverTicks > GAME_OVER_WINNER_WALK_START_TICKS
        view.node.active = visible
        if (!visible) {
            this._clearZombieGameOverClip(view)
            return
        }

        this._applyZombieBoardClip(
            view,
            renderState,
            GAME_OVER_DAY_ZOMBIE_CLIP_X,
            0,
            this._session.geometry.width,
            this._session.geometry.height,
        )
    }

    protected _applyZombieBoardClip(
        view: ZombieView,
        renderState: RenderEntitySnapshot,
        boardX: number,
        boardY: number,
        width: number,
        height: number,
    ) {
        if (!view.clipNode?.isValid || !view.visualRootNode?.isValid) return

        const localX = boardX - renderState.x
        const localY = renderState.y - boardY
        setUISize(view.clipNode, width, height, 0, 1)
        view.clipNode.setPosition(localX, localY, 0)
        view.visualRootNode.setPosition(-localX, -localY, 0)

        const mask = view.clipNode.getComponent(Mask) ?? view.clipNode.addComponent(Mask)
        mask.type = Mask.Type.GRAPHICS_RECT
        mask.enabled = true
    }

    protected _clearZombieGameOverClip(view: ZombieView) {
        if (!view.clipNode?.isValid) return

        const mask = view.clipNode.getComponent(Mask)
        if (mask) mask.enabled = false
        view.clipNode.setPosition(0, 0, 0)
        if (view.visualRootNode?.isValid) view.visualRootNode.setPosition(0, 0, 0)
    }

    protected _syncPlantAnimation(plant: PlantEntity) {
        const view = this._plantViews.get(plant.id)
        if (!view) return
        if (plant.type !== 'wallnut') return

        this._syncWallNutDamageState(view, plant)
        this._syncWallNutEatingFreeze(view, plant)
    }

    protected _syncWallNutDamageState(view: PlantView, plant: PlantEntity) {
        if (!view.animator || view.wallnutDamageState === plant.state) return

        view.wallnutDamageState = plant.state
        if (plant.state === 'wallnut-cracked2') {
            view.animator.setTrackImageOverride('anim_face', 'wallnut_cracked2')
        } else if (plant.state === 'wallnut-cracked1') {
            view.animator.setTrackImageOverride('anim_face', 'wallnut_cracked1')
        } else {
            view.animator.setTrackImageOverride('anim_face', null)
        }
    }

    protected _syncWallNutEatingFreeze(view: PlantView, plant: PlantEntity) {
        const frozen = plant.recentlyEatenCounter > 0
        if (view.wallnutFrozen === frozen) return

        view.wallnutFrozen = frozen
        if (frozen) {
            this._endPlantBlinkAnimation(view)
            if (view.body) view.body.speed = 0
            return
        }

        if (view.body) view.body.speed = view.idleSpeed
    }

    protected _syncZombieAnimation(zombie: ZombieEntity) {
        const view = this._zombieViews.get(zombie.id)
        if (!view) return
        this._setNodeAnimatorsEnabled(view.node, this._isZombieSceneAnimationEnabled(zombie.id))
        if (this._gameOverActive && zombie.id !== this._gameOverWinnerZombieId) return

        if (this._gameOverActive && zombie.id === this._gameOverWinnerZombieId) {
            if (view.showingMowered) this._clearMoweredZombieAnimation(view)
            if (view.showingCharred) this._clearCharredZombieAnimation(view)
            syncZombieTrackVisibility(view, zombie)
            this._syncZombieShadow(view, zombie)
            this._syncZombieHitFlash(view, zombie)
            playZombieBodyAnimation(view, zombie.currentAnimation, {
                speed: zombie.animationSpeed,
                time: zombie.animationTime,
                manualTime: true,
                loop: true,
                blendTime: this._getZombieAnimationBlendTime(view, zombie.currentAnimation),
            })
            return
        }
        if (zombie.state === 'mowered') {
            this._syncMoweredZombieAnimation(view, zombie)
            return
        }
        if (zombie.state === 'charred') {
            this._syncCharredZombieAnimation(view, zombie)
            return
        }
        if (view.showingMowered) this._clearMoweredZombieAnimation(view)
        if (view.showingCharred) this._clearCharredZombieAnimation(view)
        syncZombieTrackVisibility(view, zombie)
        this._syncZombieShadow(view, zombie)
        this._syncZombieHitFlash(view, zombie)
        const blendTime = this._getZombieAnimationBlendTime(view, zombie.currentAnimation)
        playZombieBodyAnimation(view, zombie.currentAnimation, {
            speed: zombie.animationSpeed,
            time: zombie.animationTime,
            blendTime,
        })
    }

    protected _syncMoweredZombieAnimation(view: ZombieView, zombie: ZombieEntity) {
        if (!view.body) return

        syncZombieTrackVisibility(view, zombie)
        this._syncZombieHitFlash(view, zombie)
        this._syncZombieShadow(view, zombie)
        view.showingMowered = true
        view.body.speed = 0
        if (!view.moweredAnimNode) {
            this._createMoweredZombieDriver(view)
        }
        if (!view.moweredAnimNode) return

        if (!view.moweredAnimNode.isPlaying) {
            view.moweredAnimNode.play({
                name: 'default',
                loop: false,
                speed: 0,
                keepLastFrame: true,
            })
            view.body.attachToTrack({ node: view.moweredAnimNode, track: 'locator' })
        }
        const duration = view.moweredAnimNode.getAnimationDuration('default') ?? 1
        view.moweredAnimNode.time = Math.min(Math.max(0, duration - 1), zombie.animationTime)
    }

    protected _syncCharredZombieAnimation(view: ZombieView, zombie: ZombieEntity) {
        if (!view.bodyNode) return

        if (view.showingMowered) this._clearMoweredZombieAnimation(view)
        this._syncZombieShadow(view, zombie)
        view.bodyNode.active = false
        view.showingCharred = true
        if (!view.charredAnimNode) {
            this._createCharredZombieDriver(view)
        }
        if (!view.charredAnimNode) return

        if (!view.charredAnimNode.isPlaying) {
            view.charredAnimNode.play({
                name: 'anim_crumble',
                loop: false,
                speed: 0,
                keepLastFrame: true,
            })
        }
        const duration = view.charredAnimNode.getAnimationDuration('anim_crumble') ?? 1
        view.charredAnimNode.time = Math.min(Math.max(0, duration - 1), zombie.animationTime)
    }

    protected _syncZombieHitFlash(view: ZombieView, zombie: ZombieEntity) {
        if (zombie.hitFlashCounter <= 0) {
            view.animator?.setExtraAdditiveDraw(false)
            return
        }

        const grayness = Math.min(255, zombie.hitFlashCounter * 10)
        view.animator?.setExtraAdditiveDraw(true, new Color(grayness, grayness, grayness, 255))
    }

    protected _syncZombieShadow(view: ZombieView, zombie: ZombieEntity) {
        if (!view.shadowNode?.isValid) return

        view.shadowNode.active = zombie.state !== 'dying' &&
            zombie.state !== 'mowered' &&
            zombie.state !== 'charred'
    }

    protected _createMoweredZombieDriver(view: ZombieView) {
        if (!this._moweredZombieAnimation?.json || !view.node.isValid) return

        const driverNode = createUINode('MoweredDriver', {
            parent: view.node,
            layer: view.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 1,
            height: 1,
        })
        const driver = driverNode.addComponent(Animator)
        driver.enabled = !this._session.paused
        void driver.parseJson(this._moweredZombieAnimation.json as Record<string, any>).then(() => {
            if (!view.node.isValid) return

            view.moweredAnimNode = driver.addAnimNode('default')
        })
    }

    protected _createCharredZombieDriver(view: ZombieView) {
        if (!this._charredZombieAnimation?.json || !view.visualRootNode?.isValid) return

        const driverNode = createUINode('CharredDriver', {
            parent: view.visualRootNode,
            layer: view.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 1,
            height: 1,
            x: 22,
            y: 10,
        })
        const driver = driverNode.addComponent(Animator)
        driver.enabled = !this._session.paused
        void driver.parseJson(this._charredZombieAnimation.json as Record<string, any>).then(() => {
            if (!view.node.isValid) return

            view.charredAnimNode = driver.addAnimNode('default')
        })
    }

    protected _clearMoweredZombieAnimation(view: ZombieView) {
        view.showingMowered = false
        if (view.shadowNode?.isValid) view.shadowNode.active = true
    }

    protected _clearCharredZombieAnimation(view: ZombieView) {
        view.showingCharred = false
        if (view.bodyNode?.isValid) view.bodyNode.active = true
        if (view.shadowNode?.isValid) view.shadowNode.active = true
        if (view.charredAnimNode) view.charredAnimNode.stop()
    }

    protected _playZombieAnimation(entityId: number, animation: string) {
        const view = this._zombieViews.get(entityId)
        if (!view) return
        const zombie = this._session.zombies.find((item) => item.id === entityId)
        const blendTime = this._getZombieAnimationBlendTime(view, animation)
        playZombieBodyAnimation(view, animation, {
            speed: zombie?.animationSpeed ?? 1,
            time: zombie?.animationTime ?? 0,
            blendTime,
        })
    }

    protected _getZombieAnimationBlendTime(view: ZombieView, nextAnimation: string) {
        if (!view.currentAnimation || view.currentAnimation === nextAnimation) return 0
        return ZOMBIE_REANIM_BLEND_TIME
    }

    protected _playPlantAnimation(entityId: number, animation: string) {
        const view = this._plantViews.get(entityId)
        if (!view) return

        if (animation.startsWith('anim_blink')) {
            if (this._isPlantBlinkBlocked(entityId, view)) {
                this._endPlantBlinkAnimation(view)
                return
            }
            this._playPlantBlinkAnimation(view, animation)
            return
        }

        switch (animation) {
            case 'shoot':
                this._playShooterAnimation(view)
                break
            case 'potato-rise':
                this._playBodyAnimation(view, 'anim_rise', POTATO_MINE_RISE_ANIM_RATE, false, 'anim_armed')
                break
            case 'potato-armed':
                playPotatoArmedAnimation(view)
                break
            case 'chomper-bite':
                this._playBodyAnimation(view, 'anim_bite', CHOMPER_BITE_ANIM_RATE, true)
                break
            case 'chomper-chew':
                this._playBodyAnimation(view, 'anim_chew', CHOMPER_CHEW_ANIM_RATE, false)
                break
            case 'chomper-swallow':
                this._playBodyAnimation(view, 'anim_swallow', CHOMPER_SWALLOW_ANIM_RATE, true, 'anim_idle')
                break
            case 'idle':
                this._playBodyIdleAnimation(view)
                break
        }
    }

    protected _playShooterAnimation(view: PlantView) {
        this._endPlantBlinkAnimation(view)
        if (!view.head?.hasAnimation('anim_shooting')) return

        const animRate = view.plantType === 'repeater' ? 45 : 35
        const shootingToken = ++view.shootingAnimationToken
        view.shootingAnimationActive = true
        view.head.play({
            name: 'anim_shooting',
            speed: getAnimationRateSpeed(view.head, 'anim_shooting', animRate),
            blendTime: 0.1,
            keepLastFrame: true,
            onFinish: () => {
                if (view.shootingAnimationToken !== shootingToken) return
                view.shootingAnimationActive = false
                view.head?.play({
                    name: 'anim_head_idle',
                    speed: view.idleSpeed,
                    time: view.body?.time ?? 0,
                    loop: true,
                    blendTime: 0.1,
                })
            },
        })
    }

    protected _playBodyAnimation(
        view: PlantView,
        animation: string,
        animRate: number,
        keepLastFrame: boolean,
        nextAnimation?: string,
    ) {
        if (!view.body?.hasAnimation(animation)) return

        view.body.play({
            name: animation,
            speed: getAnimationRateSpeed(view.body, animation, animRate),
            blendTime: 0.1,
            keepLastFrame,
            onFinish: () => {
                if (!nextAnimation) return
                if (nextAnimation === 'anim_idle') {
                    this._playBodyIdleAnimation(view)
                } else if (nextAnimation === 'anim_armed') {
                    playPotatoArmedAnimation(view)
                }
            },
        })
    }

    protected _playBodyIdleAnimation(view: PlantView) {
        view.body?.play({
            name: 'anim_idle',
            speed: view.idleSpeed,
            loop: true,
            blendTime: 0.1,
        })
    }

    protected _playPlantBlinkAnimation(view: PlantView, animation: string) {
        const face = animation === 'anim_blink2' ? view.face2 : view.face
        if (!face?.hasAnimation(animation)) return

        if (view.plantType === 'potatomine') {
            view.animator?.hideTrack('anim_eye')
        }
        face.play({
            name: animation,
            speed: getAnimationRateSpeed(face, animation, 15),
            keepLastFrame: false,
            onFinish: () => {
                if (view.plantType === 'potatomine') {
                    view.animator?.showTrack('anim_eye')
                }
            },
        })
    }

    protected _endPlantBlinkAnimation(view: PlantView) {
        view.animator?.stopAnimNode(view.face)
        view.animator?.stopAnimNode(view.face2)
        view.animator?.showTrack('anim_eye')
    }

    protected _isPlantBlinkBlocked(entityId: number, view: PlantView) {
        const plant = this._session.plants.find((item) => item.id === entityId)
        return view.shootingAnimationActive || (!!plant && plant.shootingCounter !== 0)
    }

}
