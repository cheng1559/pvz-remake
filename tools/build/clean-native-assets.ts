import { rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Removes a native build's assets (`<dest>/data/assets`) so the build writes them afresh.
 *
 * A native build keeps its output folder, and the builder never copies a raw asset over one that is already there. A
 * file that changes under the same uuid, as `assets/resources/base.zip` does every time the base content is packed,
 * would stay as it was first built: the new code then meets old content and the game does not start.
 */
const dest = process.argv[2]
if (!dest) throw new Error('Usage: tsx tools/build/clean-native-assets.ts <build folder>')
rmSync(join(dest, 'data', 'assets'), { recursive: true, force: true })
