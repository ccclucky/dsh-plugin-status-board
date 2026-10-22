/**
 * Remove build output.
 *
 * Kept as a script rather than an inline `rm -rf` so the build works
 * identically on Windows PowerShell and POSIX shells (`dsh` supports both).
 */
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
await rm(join(root, 'lib'), { recursive: true, force: true })
console.log('cleaned lib/')