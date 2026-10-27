export function readModContent(file: string, sourceFiles?: Set<string>): {
    resources: Record<string, any>
    gameplay?: any
    presentation?: any
}
