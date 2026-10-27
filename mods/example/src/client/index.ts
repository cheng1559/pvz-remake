import { installBeacon } from './beacon.js'
import { installMenu } from './menu.js'
import type { Context } from './types.js'

export async function register(context: Context): Promise<void> {
    const { host, assets } = context
    const cli = host.get('shared/debug/DebugCli')
    const declarations = [
        { name: 'example:hello', parameters: [], minimum: 0 },
        { name: 'example:charge', parameters: ['{row}', '{col}'], minimum: 2 },
    ]
    host.around(cli.specs, 'list', next => {
        const entries = next()
        return [...entries, ...declarations.filter(spec => !entries.some((entry: any) => entry.name === spec.name))]
    })
    const help = new TextDecoder('utf-8').decode(assets.bytes('assets/help.txt'))
    const { loadIntegratedGameContent } = host.get('client/game/loadIntegratedGameContent')
    const { AudioClip } = host.get('cc')
    const { SoundSystem } = host.get('client/sound/SoundSystem')
    const chime = async () => {
        const game = await loadIntegratedGameContent()
        const clip = await game.loader.load(game.registry.resolve('sounds', 'example:chime'), AudioClip)
        await SoundSystem.playClip(clip)
    }
    const playChime = () => { void chime().catch(error => console.error('[Example Mod]', error)) }
    const { executor } = host.get('platform/debug/DebugCliCommands')
    host.around(executor, 'execute', function (next, input, ...args) {
        const command = cli.parseDebugCliCommand(input)
        if (!('name' in command) || command.name !== 'example:hello') return next(input, ...args)
        playChime()
        return cli.debugSuccess(help)
    })
    installBeacon(context)
    await installMenu(context, help, playChime)
}
