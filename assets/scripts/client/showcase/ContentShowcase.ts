import { Color, Node } from 'cc'
import { ClientContentLoader } from '@/client/content/ClientContentLoader'
import { ContentRegistry } from '@/client/content/ContentRegistry'
import { BitmapTextRenderer, type BitmapTextSnapshot } from '@/client/font/BitmapTextRenderer'
import { MusicPlayer, type MusicPlaybackSnapshotV2 } from '@/client/music/MusicPlayer'
import { ParticlePlayer, type ParticlePlayerSnapshot } from '@/client/particle/ParticlePlayer'
import { ReanimPlayer, type ReanimPlaybackSnapshot } from '@/client/reanim/ReanimPlayer'
import { SoundPlayer } from '@/client/sound/SoundPlayer'
import { uiNode } from '@/client/view/uiNode'
import { MusicSystem } from '@/client/music/MusicSystem'

export async function showContentShowcase(parent: Node): Promise<Node> {
    const loader = new ClientContentLoader()
    const registry = new ContentRegistry()
    registry.register(await loader.loadManifest('pvz-base'))
    registry.freeze()
    const animationRoot = uiNode({ name: 'ReanimV2' }).node
    const body = uiNode({ name: 'SunflowerBody', parent: animationRoot }).node.addComponent(ReanimPlayer)
    const face = uiNode({ name: 'SunflowerFace', parent: animationRoot }).node.addComponent(ReanimPlayer)
    const zombieNode = uiNode({ name: 'ZombieIdle' }).node
    const zombie = zombieNode.addComponent(ReanimPlayer)
    const textNode = uiNode({ name: 'BitmapFontV2', anchor: { x: 0, y: 1 } }).node
    const text = textNode.addComponent(BitmapTextRenderer)
    const particleNode = uiNode({ name: 'ParticleV2' }).node
    const particle = particleNode.addComponent(ParticlePlayer)
    const soundNode = uiNode({ name: 'SoundV2' }).node
    const sound = soundNode.addComponent(SoundPlayer)
    const musicNode = uiNode({ name: 'MusicV2' }).node
    const music = musicNode.addComponent(MusicPlayer)
    try {
        await Promise.all([
            body.load('pvz:sunflower', registry, loader),
            face.load('pvz:sunflower_blink', registry, loader),
            zombie.load('pvz:zombie', registry, loader),
            text.load('pvz:dwarventodcraft18', registry, loader),
            particle.load('pvz:peasplat', registry, loader),
            sound.load('pvz:splat', registry, loader),
            music.load('pvz:title_theme', registry, loader),
        ])
        face.attachToTrack(body, 'anim_idle')
        face.hide()
        text.setText('PLANTS VS. ZOMBIES\nAVATAR WAVES', {
            fontSize: 30,
            maxWidth: 440,
            align: 'center',
        })
    } catch (error) {
        animationRoot.destroy()
        zombieNode.destroy()
        textNode.destroy()
        particleNode.destroy()
        soundNode.destroy()
        musicNode.destroy()
        throw error
    }
    if (!parent.isValid) {
        animationRoot.destroy()
        zombieNode.destroy()
        textNode.destroy()
        particleNode.destroy()
        soundNode.destroy()
        musicNode.destroy()
        throw new Error('content showcase parent was destroyed')
    }

    const root = uiNode({
        name: 'ContentV2Showcase',
        parent,
        size: { width: 800, height: 600 },
        graphics: true,
    })
    root.graphics!.fillColor = new Color(24, 27, 32, 245)
    root.graphics!.rect(-400, -300, 800, 600)
    root.graphics!.fill()

    animationRoot.setPosition(-90, 80, 0)
    animationRoot.setScale(2.5, 2.5, 1)
    root.node.addChild(animationRoot)
    zombieNode.setPosition(80, 180, 0)
    zombieNode.setScale(1.4, 1.4, 1)
    root.node.addChild(zombieNode)
    textNode.setPosition(-220, -120, 0)
    root.node.addChild(textNode)
    particleNode.setPosition(180, 80, 0)
    particleNode.setScale(2.5, 2.5, 1)
    root.node.addChild(particleNode)
    root.node.addChild(soundNode)
    root.node.addChild(musicNode)
    body.play({ loop: true })
    zombie.play({ loop: true })
    particle.play(0x50565a32)
    return root.node
}

interface ContentShowcaseSnapshot {
    body: ReanimPlaybackSnapshot
    face: ReanimPlaybackSnapshot
    zombie: ReanimPlaybackSnapshot
    text: BitmapTextSnapshot
    particle: ParticlePlayerSnapshot
    music: MusicPlaybackSnapshotV2
}

interface ContentShowcaseProbe {
    show(): Promise<Node>
    hide(): void
    blink(): void
    splat(): void
    sound(): void
    impact(): void
    music(): void
    pauseMusic(): void
    resumeMusic(): void
    stopMusic(): void
    setText(text: string): void
    snapshot(): ContentShowcaseSnapshot
    restore(snapshot: ContentShowcaseSnapshot): void
}

type ProbeGlobal = typeof globalThis & { pvzPhase2?: ContentShowcaseProbe }

export function installContentShowcaseProbe(parent: Node): void {
    let showcase: Node | null = null
    let legacyMusicPaused = false
    const claimMusic = () => {
        if (legacyMusicPaused) return
        MusicSystem.pause()
        legacyMusicPaused = true
    }
    const releaseMusic = () => {
        if (!legacyMusicPaused) return
        MusicSystem.resume()
        legacyMusicPaused = false
    }
    ;(globalThis as ProbeGlobal).pvzPhase2 = {
        async show() {
            if (showcase?.isValid) return showcase
            showcase = await showContentShowcase(parent)
            return showcase
        },
        hide() {
            if (showcase?.isValid) showcase.destroy()
            showcase = null
            releaseMusic()
        },
        blink() {
            requireContent(showcase).face.play({ loop: false, rate: 1.25, timeSeconds: 0 })
        },
        splat() {
            requireContent(showcase).particle.play(0x50565a32)
        },
        sound() {
            requireContent(showcase).sound.play()
        },
        impact() {
            const content = requireContent(showcase)
            content.particle.play(0x50565a32)
            content.sound.play()
        },
        music() {
            const content = requireContent(showcase)
            claimMusic()
            content.music.play()
        },
        pauseMusic() {
            requireContent(showcase).music.pause()
        },
        resumeMusic() {
            const content = requireContent(showcase)
            claimMusic()
            content.music.resume()
        },
        stopMusic() {
            requireContent(showcase).music.stop()
            releaseMusic()
        },
        setText(value) {
            requireContent(showcase).text.setText(value)
        },
        snapshot() {
            const content = requireContent(showcase)
            return {
                body: content.body.snapshot(),
                face: content.face.snapshot(),
                zombie: content.zombie.snapshot(),
                text: content.text.snapshot(),
                particle: content.particle.snapshot(),
                music: content.music.snapshot(),
            }
        },
        restore(snapshot) {
            const content = requireContent(showcase)
            content.body.restore(snapshot.body)
            content.face.restore(snapshot.face)
            content.zombie.restore(snapshot.zombie)
            content.text.restore(snapshot.text)
            content.particle.restore(snapshot.particle)
            content.music.restore(snapshot.music)
            if (snapshot.music.playing) claimMusic()
            else releaseMusic()
        },
    }
}

function requireContent(showcase: Node | null): {
    body: ReanimPlayer
    face: ReanimPlayer
    zombie: ReanimPlayer
    text: BitmapTextRenderer
    particle: ParticlePlayer
    sound: SoundPlayer
    music: MusicPlayer
} {
    const root = showcase?.getChildByName('ReanimV2')
    const body = root?.getChildByName('SunflowerBody')?.getComponent(ReanimPlayer)
    const face = root?.getChildByName('SunflowerFace')?.getComponent(ReanimPlayer)
    const zombie = showcase?.getChildByName('ZombieIdle')?.getComponent(ReanimPlayer)
    const text = showcase?.getChildByName('BitmapFontV2')?.getComponent(BitmapTextRenderer)
    const particle = showcase?.getChildByName('ParticleV2')?.getComponent(ParticlePlayer)
    const sound = showcase?.getChildByName('SoundV2')?.getComponent(SoundPlayer)
    const music = showcase?.getChildByName('MusicV2')?.getComponent(MusicPlayer)
    if (!body || !face || !zombie || !text || !particle || !sound || !music) {
        throw new Error('content showcase is not open')
    }
    return { body, face, zombie, text, particle, sound, music }
}
