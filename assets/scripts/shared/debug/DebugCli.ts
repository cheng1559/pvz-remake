/** `plants`: the plant seeds, which /plant takes; `seeds`: every seed, zombie seeds too, which /seed takes. */
export interface DebugCliCatalog { plants: string[], seeds: string[], zombies: string[], items: string[], levels: string[] }
interface DebugCliOutcome {
    action?: 'restart' | 'reload' | 'manageMods' | 'quit' | 'goto' | 'level'
    levelId?: string
    /** For `goto`. */
    page?: DebugGotoPage
    catalog?: DebugCliCatalog
    /** A switch's state after the command turned it over (`/cooldown` and the like). */
    enabled?: boolean
    /** Advice the client shows after a success: a string table key, its %s filled with `args`, string keys themselves. */
    advice?: { key: string, args?: string[] }
}
/**
 * Success and syntax messages only reach the console. A failed condition closes the CLI and shows as advice, so it names
 * a string table key (Mods use their own qualified keys) whose %s/%d the client fills with args in order.
 */
export type DebugCliResult = DebugCliOutcome & (
    | { ok: true, message: string, failure?: undefined }
    | { ok: false, failure: 'syntax', message: string }
    | { ok: false, failure: 'condition', key: string, args?: string[] })
export interface DebugCliCommand { name: string, args: string[] }
export interface CommandSpec { name: string, parameters: string[], minimum: number, values?: Record<number, readonly string[]> }
/** The switches: each command turns its switch over and says where it now stands as advice (debugSwitchAdvice). */
export const DEBUG_SWITCHES = ['hotkeys', 'haptics', 'cursor', 'cooldown', 'suncost', 'sunspawning', 'plantinvincible', 'cheatseed', 'fps',
    'hitboxes', 'background', 'mobile', 'fullscreen'] as const
/** The /perf switches, one per category. */
export const DEBUG_PERF_SWITCHES = ['plants', 'zombies', 'particles', 'sfx', 'logic'] as const
/** The menu pages /goto opens (MenuPageId); the splash, title and award screens only come in their own order. */
export const DEBUG_GOTO_PAGES = ['main', 'minigames', 'puzzle', 'survival', 'almanac', 'plants', 'zombies', 'store',
    'garden', 'mushroom', 'aquarium', 'tree', 'achievements', 'help'] as const
export type DebugGotoPage = (typeof DEBUG_GOTO_PAGES)[number]
const builtins: CommandSpec[] = [
    ...['win', 'lose', 'nextflag', 'nextwave', 'kill', 'restart', 'reload', 'quit'].map(name => ({ name, parameters: [], minimum: 0 })),
    { name: 'goto', parameters: ['{page}'], minimum: 1, values: { 0: DEBUG_GOTO_PAGES } },
    { name: 'plant', parameters: ['{plant_name}', '{row}', '{col}', '[team]'], minimum: 3, values: { 3: ['plants', 'zombies'] } },
    { name: 'seed', parameters: ['{slot}', '{seed_name}', '[team]'], minimum: 2, values: { 2: ['plants', 'zombies'] } },
    { name: 'repick', parameters: [], minimum: 0 },
    { name: 'removeplant', parameters: ['{row}', '{col}'], minimum: 2 },
    { name: 'grave', parameters: ['{row}', '{col}', '[team]'], minimum: 2, values: { 2: ['zombies', 'plants'] } },
    { name: 'zombie', parameters: ['{zombie_name}', '[row]', '[col]', '[team]'], minimum: 1, values: { 3: ['zombies', 'plants'] } },
    { name: 'item', parameters: ['{item_name}', '[row]', '[col]'], minimum: 1 },
    { name: 'damage', parameters: ['{damage}'], minimum: 1 },
    { name: 'level', parameters: ['{level}'], minimum: 1 },
    { name: 'gamespeed', parameters: ['{0-10}'], minimum: 1 },
    ...['music', 'sfx'].map(name => ({ name, parameters: ['{0-100}'], minimum: 1 })),
    ...DEBUG_SWITCHES.map(name => ({ name, parameters: [], minimum: 0 })),
    { name: 'fontsharpness', parameters: ['{0-1}'], minimum: 1 },
    { name: 'seedstyle', parameters: ['{standard|rendered|tilted}'], minimum: 1, values: { 0: ['standard', 'rendered', 'tilted'] } },
    { name: 'mod', parameters: [], minimum: 0 },
    { name: 'perf', parameters: ['{plants|zombies|particles|sfx|logic}'], minimum: 1, values: { 0: DEBUG_PERF_SWITCHES } },
    { name: 'lawnmower', parameters: ['{trigger|reset}', '[row]'], minimum: 1, values: { 0: ['trigger', 'reset'] } },
    ...['sun', 'money'].map(name => ({ name, parameters: ['{add|set}', '{number}'], minimum: 2, values: { 0: ['add', 'set'] } })),
    { name: 'collect', parameters: ['{auto|click|move}'], minimum: 1, values: { 0: ['auto', 'click', 'move'] } },
    { name: 'achievement', parameters: ['{give|reset}', '[achievement]'], minimum: 1, values: { 0: ['give', 'reset'] } },
]

// Wrap the read instead of mutating the table so host.dispose() also removes Mod syntax.
export const specs = { list: (): readonly CommandSpec[] => builtins }

/** `/seed {slot} empty`: the name that empties a bank slot instead of naming a seed. */
export const EMPTY_SLOT = 'empty'
export const debugSyntax = (message: string): DebugCliResult => ({ ok: false, message, failure: 'syntax' })
export const debugCondition = (key: string, ...args: (string | number | boolean)[]): DebugCliResult =>
    ({ ok: false, failure: 'condition', key, ...(args.length ? { args: args.map(String) } : {}) })
export const debugSuccess = (message: string): DebugCliResult => ({ ok: true, message })
/**
 * A switch turned over, as advice: DEBUG_SWITCH_ON or DEBUG_SWITCH_OFF with the switch's name, DEBUG_SWITCH_{NAME}
 * (`/perf plants` is DEBUG_SWITCH_PERF_PLANTS).
 */
export const debugSwitchAdvice = (name: string, enabled: boolean): { key: string, args: string[] } =>
    ({ key: enabled ? 'DEBUG_SWITCH_ON' : 'DEBUG_SWITCH_OFF', args: [`DEBUG_SWITCH_${name.trim().replace(/\s+/g, '_').toUpperCase()}`] })
/** A switch's success: its new state, and the advice that says it. */
export const debugSwitched = (name: string, enabled: boolean): DebugCliResult =>
    ({ ...debugSuccess(`${name}: ${enabled ? 'on' : 'off'}`), enabled, advice: debugSwitchAdvice(name, enabled) })
export const normalizeDebugName = (name: string) => name.toLowerCase().replace(/^pvz:/, '').replace(/[\s_-]+/g, '')
export const debugInteger = (value: string | undefined): number | null =>
    value !== undefined && /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null

/** `/sun` and `/money {add|set} {amount}`: the new amount, kept within 0..max, or the syntax failure. */
export function debugAmount(args: readonly string[], current: number, max: number): number | DebugCliResult {
    const amount = debugInteger(args[1])
    if (amount === null) return debugSyntax('Amount must be an integer')
    const next = (args[0].toLowerCase() === 'add' ? current : 0) + amount
    if (!Number.isSafeInteger(next)) return debugSyntax('Amount is too large')
    return Math.max(0, Math.min(max, next))
}

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
        // A bare "/" names no command yet, so nothing is completed, not even on Tab.
        if (!name || !allowEmpty && commands.some(spec => spec.name === name)) return []
        return commands.filter(spec => spec.name.startsWith(name)).map(spec => value.slice(0, start) + (token.startsWith('/') ? '/' : '') + spec.name)
    }
    if (!token && !allowEmpty) return []
    const spec = commands.find(spec => spec.name === name)
    const dynamic = name === 'seed' && index === 2 ? catalog?.seeds && [...catalog.seeds, EMPTY_SLOT] : index !== 1 ? undefined : name === 'plant' ? catalog?.plants : name === 'zombie' ? catalog?.zombies
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
