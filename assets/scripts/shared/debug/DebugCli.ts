export interface DebugCliCatalog { plants: string[], zombies: string[], items: string[], levels: string[] }
export interface DebugCliResult {
    ok: boolean
    message: string
    failure?: 'syntax' | 'condition'
    action?: 'restart' | 'reload' | 'manageMods' | 'home' | 'quit' | 'help' | 'menu' | 'shop' | 'almanac' | 'zengarden' | 'level'
    levelId?: string
    catalog?: DebugCliCatalog
}
export interface DebugCliCommand { name: string, args: string[] }
export interface CommandSpec { name: string, parameters: string[], minimum: number, values?: Record<number, readonly string[]> }
const bool = ['true', 'false']
const builtins: CommandSpec[] = [
    ...['win', 'lose', 'nextflag', 'nextwave', 'kill', 'restart', 'reload', 'home', 'quit', 'help', 'menu', 'shop', 'almanac', 'zengarden'].map(name => ({ name, parameters: [], minimum: 0 })),
    { name: 'plant', parameters: ['{plant_name}', '{row}', '{col}'], minimum: 3 },
    { name: 'seed', parameters: ['{slot}', '{seed_name}'], minimum: 2 },
    { name: 'removeplant', parameters: ['{row}', '{col}'], minimum: 2 },
    { name: 'zombie', parameters: ['{zombie_name}', '[row]', '[col]'], minimum: 1 },
    { name: 'item', parameters: ['{item_name}', '[row]', '[col]'], minimum: 1 },
    { name: 'damage', parameters: ['{damage}'], minimum: 1 },
    { name: 'level', parameters: ['{level}'], minimum: 1 },
    { name: 'gamespeed', parameters: ['{0-10}'], minimum: 1 },
    ...['music', 'sfx'].map(name => ({ name, parameters: ['{0-100}'], minimum: 1 })),
    ...['hotkeys', 'haptics', 'cooldown', 'suncost', 'sunspawning', 'hitboxes', 'background', 'mobile', 'fullscreen'].map(name => ({ name, parameters: ['{enabled}'], minimum: 1, values: { 0: bool } })),
    { name: 'seedstyle', parameters: ['{standard|rendered|tilted}'], minimum: 1, values: { 0: ['standard', 'rendered', 'tilted'] } },
    { name: 'mod', parameters: [], minimum: 0 },
    { name: 'perf', parameters: ['{plants|zombies|particles|sfx|logic}', '{enabled}'], minimum: 2, values: { 0: ['plants', 'zombies', 'particles', 'sfx', 'logic'], 1: bool } },
    { name: 'lawnmower', parameters: ['{trigger|reset}', '[row]'], minimum: 1, values: { 0: ['trigger', 'reset'] } },
    ...['sun', 'money'].map(name => ({ name, parameters: ['{add|set}', '{number}'], minimum: 2, values: { 0: ['add', 'set'] } })),
    { name: 'collect', parameters: ['{auto|click|move}'], minimum: 1, values: { 0: ['auto', 'click', 'move'] } },
]

// Wrap the read instead of mutating the table so host.dispose() also removes Mod syntax.
export const specs = { list: (): readonly CommandSpec[] => builtins }

export const debugSyntax = (message: string): DebugCliResult => ({ ok: false, message, failure: 'syntax' })
export const debugCondition = (message: string): DebugCliResult => ({ ok: false, message, failure: 'condition' })
export const debugSuccess = (message: string): DebugCliResult => ({ ok: true, message })
export const normalizeDebugName = (name: string) => name.toLowerCase().replace(/^pvz:/, '').replace(/[\s_-]+/g, '')
export const debugInteger = (value: string | undefined): number | null =>
    value !== undefined && /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null

export function parseDebugCliCommand(value: string): DebugCliCommand | DebugCliResult {
    const tokens = [...value.trim().matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(match => match[1] ?? match[2] ?? match[3])
    const name = tokens.shift()?.replace(/^\//, '').toLowerCase() ?? ''
    const spec = specs.list().find(spec => spec.name === name)
    if (!spec) return debugSyntax(`Unknown command: ${name}`)
    if (tokens.length < spec.minimum || tokens.length > spec.parameters.length || name === 'item' && tokens.length === 2) {
        return debugSyntax(`Usage: /${name} ${spec.parameters.join(' ')}`.trim())
    }
    for (const [index, values] of Object.entries(spec.values ?? {})) {
        if (tokens[Number(index)] !== undefined && !values.includes(tokens[Number(index)].toLowerCase())) {
            return debugSyntax(`Invalid ${name} argument: ${tokens[Number(index)]}. Use ${values.join(', ')}`)
        }
    }
    return { name, args: tokens }
}

export function getDebugCliCompletions(value: string, catalog?: DebugCliCatalog, allowEmpty = false): string[] {
    const tokens = [...value.matchAll(/\S+/g)]
    if (!tokens.length) return []
    const trailing = /\s$/.test(value)
    const index = trailing ? tokens.length : tokens.length - 1
    const token = trailing ? '' : tokens[index][0]
    const start = trailing ? value.length : tokens[index].index!
    const name = tokens[0][0].replace(/^\//, '').toLowerCase()
    const commands = specs.list()
    if (index === 0) {
        if (!allowEmpty && commands.some(spec => spec.name === name)) return []
        return commands.filter(spec => spec.name.startsWith(name)).map(spec => value.slice(0, start) + (token.startsWith('/') ? '/' : '') + spec.name)
    }
    if (!token && !allowEmpty) return []
    const spec = commands.find(spec => spec.name === name)
    const dynamic = name === 'seed' && index === 2 ? catalog?.plants : index !== 1 ? undefined : name === 'plant' ? catalog?.plants : name === 'zombie' ? catalog?.zombies
        : name === 'item' ? catalog?.items : name === 'level' ? catalog?.levels : undefined
    const values = dynamic ?? spec?.values?.[index - 1] ?? []
    return values.filter(option => option.toLowerCase().startsWith(token.toLowerCase()))
        .map(option => value.slice(0, start) + option)
}

export function getDebugCliSuffix(value: string, catalog?: DebugCliCatalog): string {
    const completion = getDebugCliCompletions(value, catalog)[0]
    if (completion && completion.length > value.length) return completion.slice(value.length)
    const tokens = value.trim().split(/\s+/)
    const spec = specs.list().find(spec => spec.name === tokens[0].replace(/^\//, '').toLowerCase())
    if (spec?.values?.[tokens.length - 2]
        && !spec.values[tokens.length - 2].includes(tokens[tokens.length - 1].toLowerCase())) return ''
    const hints = spec?.parameters.slice(tokens.length - 1) ?? []
    return hints.length ? (/\s$/.test(value) ? '' : ' ') + hints.join(' ') : ''
}
