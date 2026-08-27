import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const root = process.cwd()
const outputPath = resolve(root, 'src/assets/svg/auth-iconify.generated.ts')
const scanRoots = [
  'src/views/auth',
  'src/components/core/views/login',
  'src/components/core/forms/art-drag-verify'
].map((path) => resolve(root, path))
const sourceExtensions = new Set(['.ts', '.vue'])
const iconPattern = /\b(?:ri|solar):[a-z0-9-]+\b/giu
const names = new Set<string>()

for (const scanRoot of scanRoots) {
  for (const file of walk(scanRoot)) {
    if (!sourceExtensions.has(extname(file))) continue
    for (const match of readFileSync(file, 'utf8').matchAll(iconPattern)) names.add(match[0])
  }
}

const generated = readFileSync(outputPath, 'utf8')
const generatedNames = [...generated.matchAll(/^\s*"((?:ri|solar):[a-z0-9-]+)":\s*\{/gimu)]
  .map((match) => match[1])
  .sort()
const scannedNames = [...names].sort()

if (!existsSync(outputPath) || JSON.stringify(generatedNames) !== JSON.stringify(scannedNames)) {
  throw new Error(`Auth icon whitelist is stale: ${relative(root, outputPath)}.`)
}
console.log(`PASS  auth icon whitelist is current (${names.size} icons)`)

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}
