/**
 * @fileoverview 登录与注册页面本地图标生成脚本。
 * @description 扫描授权页面所需 Iconify 图标，生成固定白名单并支持一致性检查。
 */
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

/**
 * @description 递归列出授权页面扫描目录中的全部文件。
 * @param {string} directory 待遍历的目录绝对路径。
 * @returns {string[]} 目录树中的文件绝对路径列表。
 * @throws {Error} 目录无法读取时由文件系统接口抛出。
 */
function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}
