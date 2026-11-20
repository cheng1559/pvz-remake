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
            const button = { node: child(parent), onClick: options.onClick, options }
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
    // The members of client/plants/PlantView a Mod's view uses, with their signatures; the context is a PlantViewContext.
    class PlantView {
        private readonly player = { loadedId: '', tint: Color.WHITE, setColorOverride(color: Color) { this.tint = color } }
        constructor(protected readonly context: any) {}
        async initialize() { this.player.loadedId = this.context.plant.typeId }
        protected get body() { return this.player }
        sync(plant: any, world: any) { this.onBoard(plant, world) }
        protected onBoard(_plant: any, _world: any) {}
        protected particle(effect: string, x: number, y: number, order = 0, tint?: Color, mirrored?: boolean) {
            this.context.stage?.particle(effect, x, y, order, tint, mirrored)
        }
    }
    const executor = { execute: async (_input: string, _running: boolean, _run: (input: string) => any) => cli.debugCondition('DEBUG_NO_ACTIVE_GAME') }
    return { MainMenuScreen, buttons, dialogs, sounds, executor, Node, modules: {
        'cc': { Node, Color },
        'shared/debug/DebugCli': cli,
        'platform/debug/DebugCliCommands': { executor },
        'client/screens/MainMenuScreen': { MainMenuScreen },
        'client/view/uiNode': { uiNode: ({ parent }: any) => ({ node: child(parent) }) },
        'client/plants/PlantView': { PlantView },
        'client/sound/SoundSystem': { SoundSystem: { async play(id: string) { sounds.push(id) } } },
    } }
}
