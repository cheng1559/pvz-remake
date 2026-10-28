import { EventEmitter } from 'node:events'
import * as cli from '@/shared/debug/DebugCli'

/** Engine boundary for the packaged example; its real scripts execute against these objects. */
export function exampleClient() {
    class Node extends EventEmitter {
        static EventType = { NODE_DESTROYED: 'destroyed' }
        isValid = true
        children: Node[] = []
        destroy() {
            if (!this.isValid) return
            this.isValid = false
            for (const child of this.children) child.destroy()
            this.emit('destroyed')
        }
    }
    const buttons: any[] = [], dialogs: any[] = [], sounds: any[] = []
    const child = (parent: Node) => { const node = new Node(); parent.children.push(node); return node }
    const ui = {
        text: (key: string) => key,
        button(parent: Node, options: any) {
            const button = { node: child(parent), onPress() {}, options }
            buttons.push(button)
            return button
        },
        dialog(parent: Node, options: any) {
            const dialog = { node: child(parent), options }
            dialogs.push(dialog)
            return dialog
        },
    }
    class MainMenuScreen { node = new Node(); ui = ui; initialized = 0; async initialize(_ui = ui) { this.initialized++ } }
    class Color { static WHITE = new Color(255, 255, 255); constructor(public r: number, public g: number, public b: number) {} }
    class AnimatedPlantView {
        content: any
        body = {
            loadedId: '', playing: false, tint: Color.WHITE,
            async load(id: string) { this.loadedId = id },
            play() { this.playing = true },
            setColorOverride(color: Color) { this.tint = color },
        }
        constructor(context: any) { this.content = context.content }
        async initialize() { await (this as any).loadAnimations(); (this as any).startBody() }
        sync(plant: any, world: any, particle: any) { (this as any).syncVisuals(plant, world, particle) }
    }
    const game = {
        registry: { resolve: (category: string, id: string) => ({ category, id }) },
        loader: { async load(content: any) { return content } },
    }
    const executor = { execute: async (_input: string, _running: boolean, _run: (input: string) => any) => cli.debugCondition('delegated') }
    return { MainMenuScreen, buttons, dialogs, sounds, executor, Node, game, modules: {
        'cc': { Node, Color, AudioClip: class {} },
        'shared/debug/DebugCli': cli,
        'platform/debug/DebugCliCommands': { executor },
        'client/screens/MainMenuScreen': { MainMenuScreen },
        'client/view/uiNode': { uiNode: ({ parent }: any) => ({ node: child(parent) }) },
        'client/plants/AnimatedPlantView': { AnimatedPlantView },
        'client/game/loadIntegratedGameContent': { loadIntegratedGameContent: async () => game },
        'client/sound/SoundSystem': { SoundSystem: { async playClip(clip: any) { sounds.push(clip) } } },
    } }
}
