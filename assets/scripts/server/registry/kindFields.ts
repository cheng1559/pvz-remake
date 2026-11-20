import { isQualifiedId } from '@/shared/mod'

/**
 * A type's definition has the fields its kind takes (`takes`, its class's `config`) and none that another kind takes
 * (`taken`, every installed kind's): the base's own (a shooter's `shooter`) and a Mod kind's, named by qualified IDs
 * (ModField), which no definition has unless its kind takes it. `kind` names the type's kind in errors.
 */
export function checkKindFields(id: string, definition: object, kind: string, takes: readonly string[], taken: ReadonlySet<string>): void {
    const fields = definition as Record<string, unknown>
    for (const field of new Set([...taken, ...Object.keys(fields).filter(isQualifiedId)])) {
        const has = fields[field] !== undefined, own = takes.includes(field)
        if (has !== own) throw new Error(own ? `${id} of kind ${kind} needs ${field}` : `${id}.${field} needs a kind that takes it`)
    }
}
