/**
 * @fileoverview Web 静态资源审计与构建裁剪脚本。
 * @description 扫描资源引用、动态保护目录和构建产物，报告冗余文件并按显式白名单裁剪。
 */
import { createHash } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * @description 描述文本语料文件的路径和规范化内容。
 * @typedef {object} TextCorpusRecord
 * @property {string} path 文件绝对路径。
 * @property {string} relativePath 相对于仓库根目录的正斜杠路径。
 * @property {string} text 统一使用正斜杠的文本内容。
 */

/**
 * @description 描述静态资源在某个文本文件中的首次引用位置。
 * @typedef {object} ReferenceRecord
 * @property {string} path 引用来源的仓库相对路径。
 * @property {number} line 首次引用所在的一基行号。
 */

/**
 * @description 描述需要验证的字面量静态资源 URL 及其来源文件。
 * @typedef {object} LiteralUrlRecord
 * @property {string} urlPath 以斜杠开头的静态资源 URL。
 * @property {string} source 包含该 URL 的仓库相对路径。
 */

/**
 * @description 描述一个公开或源码静态资源及其引用、保护规则和审计状态。
 * @typedef {object} AssetRecord
 * @property {'public' | 'source'} root 资源所属根目录类型。
 * @property {string} path 文件绝对路径。
 * @property {string} relativePath 相对于资源根目录的正斜杠路径。
 * @property {number} bytes 文件字节数。
 * @property {ReferenceRecord[]} runtimeReferences 运行时代码引用位置。
 * @property {ReferenceRecord[]} documentationReferences 文档引用位置。
 * @property {object | null} protection 匹配到的动态资源保护规则。
 * @property {string} status 当前资源审计分类。
 */

/**
 * @description 当前审计脚本所在目录，用于推导 Web 工程和仓库根路径。
 * @type {string}
 */
const scriptDir = dirname(fileURLToPath(import.meta.url))
const webDir = resolve(scriptDir, '..')
const repoDir = resolve(webDir, '..')
const publicDir = join(webDir, 'public')
const sourceAssetsDir = join(webDir, 'src', 'assets')
const distDir = join(webDir, 'dist')

const args = new Set(process.argv.slice(2))
const checkDist = args.has('--dist') || args.has('--prune-dist')
const pruneDist = args.has('--prune-dist')

if (pruneDist && !checkDist) {
  throw new Error('--prune-dist requires --dist')
}

// These files have byte-smaller, runtime-referenced replacements. The source
// files remain untouched; --prune-dist only removes their copied build output.
const confirmedPublicExclusions = new Map([
  ['images/login-bg.png', 'images/login-bg.optimized.webp'],
  ['images/login-bg.webp', 'images/login-bg.optimized.webp'],
  ['images/page-bg.webp', 'images/page-bg-optimized.webp'],
  ['images/page-bg-dark.webp', 'images/page-bg-dark-optimized.webp'],
  ['images/sidebar-bg.png', 'images/sidebar-bg.webp'],
  ['images/README.md', null],
  ['images/chat/README.md', null]
])

// Vite only emits imported src/assets files. Hash-check this high-cost legacy
// source so a future indirect import cannot silently put it back in dist.
const confirmedSourceOnly = new Set(['images/common/logo.webp'])

// These trees are addressed through data/model files and runtime-computed URLs.
// Never infer that an individual file is unused from a plain text grep.
const dynamicProtectionRules = [
  {
    root: 'public',
    prefix: 'live2d/',
    reason: 'Live2D model IDs and model3 JSON recursively select textures, motions and binaries'
  },
  {
    root: 'public',
    prefix: 'map-guide/',
    reason: 'map bootstrap JSON and area selection construct snapshot and artwork URLs at runtime'
  },
  {
    root: 'source',
    prefix: 'images/avatar/',
    reason: 'avatar choices and persisted profile values select this family dynamically'
  }
]

const runtimeRoots = [
  join(webDir, 'index.html'),
  join(webDir, 'src'),
  join(webDir, 'vite.config.ts'),
  join(webDir, 'package.json'),
  join(repoDir, 'desktop'),
  join(repoDir, 'server', 'src'),
  join(repoDir, 'visitor-app'),
  join(repoDir, 'deploy'),
  join(repoDir, '.github')
]

const documentationRoots = [
  join(repoDir, 'README.md'),
  join(repoDir, 'README_CN.md'),
  join(repoDir, 'docs'),
  join(publicDir, 'images', 'README.md'),
  join(publicDir, 'images', 'chat', 'README.md')
]

const ignoredDirectoryNames = new Set([
  '.git',
  'node_modules',
  'dist',
  'performance',
  'unpackage',
  '.setup-tools',
  '.setup-logs',
  'LocalTemp'
])
const ignoredFileNames = new Set(['package-lock.json', 'pnpm-lock.yaml', 'runtime.js'])
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.mts',
  '.scss',
  '.ts',
  '.tsx',
  '.uts',
  '.uvue',
  '.vue',
  '.wxml',
  '.wxss',
  '.yaml',
  '.yml'
])
const binaryAssetExtensions = new Set([
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.moc3',
  '.mp3',
  '.png',
  '.svg',
  '.ttf',
  '.wasm',
  '.wav',
  '.webp',
  '.woff',
  '.woff2'
])
const staticUrlExtensionPattern =
  '(?:css|gif|html|ico|jpe?g|js|json|moc3|mp3|png|svg|ttf|wasm|wav|webp|woff2?)'

const problems = []
const runtimeCorpus = loadTextCorpus(runtimeRoots)
const documentationCorpus = loadTextCorpus(documentationRoots)
const publicFiles = walkFiles(publicDir).map((path) => describeFile('public', publicDir, path))
const sourceFiles = walkFiles(sourceAssetsDir).map((path) =>
  describeFile('source', sourceAssetsDir, path)
)

for (const record of [...publicFiles, ...sourceFiles]) {
  record.runtimeReferences = findReferences(record, runtimeCorpus)
  record.documentationReferences = findReferences(record, documentationCorpus)
  record.protection = findDynamicProtection(record)
  record.status = classify(record)
}

validateConfirmedExclusions(publicFiles, sourceFiles)
const literalSourceUrls = collectLiteralStaticUrls(runtimeCorpus)
validateLiteralSourceUrls(literalSourceUrls)
validateElectronBoundary()

let prunedBytes = 0
if (checkDist) {
  if (!existsSync(join(distDir, 'index.html'))) {
    problems.push('web/dist/index.html is missing; run the production build before --dist')
  } else {
    if (pruneDist) prunedBytes = pruneConfirmedDistCopies()
    validateDistMirror(publicFiles)
    validateSourceOnlyHashes(sourceFiles)
    validateBuiltLiteralUrls()
  }
}

printReport(publicFiles, sourceFiles, literalSourceUrls, prunedBytes)

if (problems.length > 0) {
  console.error('\nStatic asset audit failed:')
  for (const problem of problems) console.error(`- ${problem}`)
  process.exitCode = 1
}

/**
 * @description 根据资源根目录和文件路径创建待审计的资源记录。
 * @param {'public' | 'source'} root 资源所属根目录类型。
 * @param {string} baseDir 计算资源相对路径的根目录。
 * @param {string} path 资源文件绝对路径。
 * @returns {AssetRecord} 已填充体积且引用和分类尚待计算的资源记录。
 * @throws {Error} 文件状态无法读取时由文件系统接口抛出。
 */
function describeFile(root, baseDir, path) {
  return {
    root,
    path,
    relativePath: toPosix(relative(baseDir, path)),
    bytes: statSync(path).size,
    runtimeReferences: [],
    documentationReferences: [],
    protection: null,
    status: 'unknown'
  }
}

/**
 * @description 递归列出文件或目录树中的文件，并跳过审计忽略目录。
 * @param {string} root 待遍历的文件或目录路径。
 * @returns {string[]} 按路径排序的文件绝对路径列表。
 * @throws {Error} 路径状态或目录内容无法读取时由文件系统接口抛出。
 */
function walkFiles(root) {
  if (!existsSync(root)) return []
  const rootStat = statSync(root)
  if (rootStat.isFile()) return [root]
  const files = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(path))
    else if (entry.isFile()) files.push(path)
  }
  return files.sort((left, right) => left.localeCompare(right))
}

/**
 * @description 从多个根路径加载尺寸受限且扩展名受支持的文本语料。
 * @param {string[]} roots 待扫描的文件或目录根路径列表。
 * @returns {TextCorpusRecord[]} 可用于引用检索的文本语料记录。
 * @throws {Error} 候选文件状态或内容无法读取时由文件系统接口抛出。
 */
function loadTextCorpus(roots) {
  const files = roots.flatMap(walkFiles)
  const corpus = []
  for (const path of files) {
    if (ignoredFileNames.has(path.split(/[\\/]/u).at(-1))) continue
    if (!textExtensions.has(extname(path).toLowerCase())) continue
    const size = statSync(path).size
    if (size > 2 * 1024 * 1024) continue
    corpus.push({
      path,
      relativePath: toPosix(relative(repoDir, path)),
      text: readFileSync(path, 'utf8').replaceAll('\\', '/')
    })
  }
  return corpus
}

/**
 * @description 为资源生成公开路径、源码路径和路径别名等可检索引用形式。
 * @param {AssetRecord} record 待生成检索词的资源记录。
 * @returns {string[]} 去除空值后的资源引用检索词列表。
 */
function referenceNeedles(record) {
  if (record.root === 'public') {
    return [record.relativePath, `/${record.relativePath}`, `%BASE_URL%${record.relativePath}`]
  }

  const relativePath = record.relativePath
  const [topLevel, ...restParts] = relativePath.split('/')
  const rest = restParts.join('/')
  const aliases = {
    images: '@imgs',
    styles: '@styles'
  }
  return [
    `@/assets/${relativePath}`,
    `src/assets/${relativePath}`,
    `assets/${relativePath}`,
    aliases[topLevel] && rest ? `${aliases[topLevel]}/${rest}` : null
  ].filter(Boolean)
}

/**
 * @description 在文本语料中查找资源任一引用形式的首次出现位置。
 * @param {AssetRecord} record 待查找引用的资源记录。
 * @param {TextCorpusRecord[]} corpus 待检索的文本语料。
 * @returns {ReferenceRecord[]} 命中该资源的文件和一基行号列表。
 */
function findReferences(record, corpus) {
  const needles = [...new Set(referenceNeedles(record))]
  const references = []
  for (const file of corpus) {
    let firstIndex = -1
    for (const needle of needles) {
      const index = file.text.indexOf(needle)
      if (index >= 0 && (firstIndex < 0 || index < firstIndex)) firstIndex = index
    }
    if (firstIndex < 0) continue
    references.push({
      path: file.relativePath,
      line: file.text.slice(0, firstIndex).split('\n').length
    })
  }
  return references
}

/**
 * @description 查找覆盖当前资源路径的动态资源保护规则。
 * @param {AssetRecord} record 待判断的资源记录。
 * @returns {object | null} 首条匹配的保护规则；未匹配时返回 `null`。
 */
function findDynamicProtection(record) {
  return (
    dynamicProtectionRules.find(
      (rule) => rule.root === record.root && record.relativePath.startsWith(rule.prefix)
    ) || null
  )
}

/**
 * @description 根据显式排除、运行时引用和动态保护规则划分资源审计状态。
 * @param {AssetRecord} record 已完成引用和保护规则计算的资源记录。
 * @returns {string} 资源对应的审计状态编码。
 */
function classify(record) {
  if (record.root === 'public' && confirmedPublicExclusions.has(record.relativePath)) {
    return 'confirmed-build-exclusion'
  }
  if (record.root === 'source' && confirmedSourceOnly.has(record.relativePath)) {
    return 'confirmed-source-only'
  }
  if (record.runtimeReferences.length > 0) return 'runtime-referenced'
  if (record.protection) return 'dynamic-protected'
  if (record.root === 'source' && !binaryAssetExtensions.has(extname(record.path).toLowerCase())) {
    return 'source-module'
  }
  return 'candidate'
}

/**
 * @description 校验显式生产排除项、替代资源和仅源码资源仍满足既定边界。
 * @param {AssetRecord[]} publicRecords 公开目录资源记录。
 * @param {AssetRecord[]} sourceRecords 源码资源记录。
 * @returns {void} 发现的问题追加到全局问题列表，不返回数据。
 */
function validateConfirmedExclusions(publicRecords, sourceRecords) {
  for (const [relativePath, replacement] of confirmedPublicExclusions) {
    const record = publicRecords.find((item) => item.relativePath === relativePath)
    if (!record) {
      problems.push(`confirmed exclusion is missing from source inventory: public/${relativePath}`)
      continue
    }
    if (record.runtimeReferences.length > 0) {
      problems.push(
        `confirmed exclusion gained a runtime reference: public/${relativePath} (${formatReferences(record.runtimeReferences)})`
      )
    }
    if (!replacement) continue
    const replacementRecord = publicRecords.find((item) => item.relativePath === replacement)
    if (!replacementRecord) {
      problems.push(`replacement is missing: public/${replacement}`)
    } else if (replacementRecord.runtimeReferences.length === 0) {
      problems.push(`replacement has no runtime reference: public/${replacement}`)
    }
  }

  for (const relativePath of confirmedSourceOnly) {
    const record = sourceRecords.find((item) => item.relativePath === relativePath)
    if (!record) {
      problems.push(`confirmed source-only asset is missing: src/assets/${relativePath}`)
    } else if (record.runtimeReferences.length > 0) {
      problems.push(
        `confirmed source-only asset gained a runtime reference: src/assets/${relativePath} (${formatReferences(record.runtimeReferences)})`
      )
    }
  }
}

/**
 * @description 从文本语料中收集去重后的字面量静态资源 URL。
 * @param {TextCorpusRecord[]} corpus 待扫描的文本语料。
 * @returns {LiteralUrlRecord[]} 按 URL 和来源排序的静态资源引用列表。
 */
function collectLiteralStaticUrls(corpus) {
  const found = new Map()
  const patterns = [
    new RegExp(
      `["'\\x60](\\/(?:assets|images|live2d|map-guide)\\/[^"'\\x60\\s?#)]+\\.${staticUrlExtensionPattern})(?:[?#][^"'\\x60]*)?["'\\x60]`,
      'giu'
    ),
    new RegExp(`%BASE_URL%((?:images|live2d|map-guide)\\/[^"'\\s?#)]+\\.${staticUrlExtensionPattern})`, 'giu'),
    new RegExp(`\\$\\{import\\.meta\\.env\\.BASE_URL\\}((?:images|live2d|map-guide)\\/[^"'\\x60\\s?#)]+\\.${staticUrlExtensionPattern})`, 'giu'),
    /["'\x60](\/favicon\.ico)["'\x60]/giu
  ]

  for (const file of corpus) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      for (const match of file.text.matchAll(pattern)) {
        const rawPath = match[1]
        if (!rawPath || rawPath.includes('${') || rawPath.includes('%')) continue
        const urlPath = `/${rawPath.replace(/^\//u, '')}`
        const key = `${urlPath}\0${file.relativePath}`
        if (!found.has(key)) {
          found.set(key, { urlPath, source: file.relativePath })
        }
      }
    }
  }
  return [...found.values()].sort((left, right) =>
    `${left.urlPath}:${left.source}`.localeCompare(`${right.urlPath}:${right.source}`)
  )
}

/**
 * @description 校验源码字面量 URL 指向的非构建资源实际存在于公开目录。
 * @param {LiteralUrlRecord[]} literalUrls 源码中收集的静态资源 URL。
 * @returns {void} 缺失资源追加到全局问题列表，不返回数据。
 * @throws {Error} 已存在目标的文件状态无法读取时由文件系统接口抛出。
 */
function validateLiteralSourceUrls(literalUrls) {
  for (const item of literalUrls) {
    if (item.urlPath.startsWith('/assets/')) continue
    const sourcePath = join(publicDir, item.urlPath.slice(1))
    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
      problems.push(`literal static URL is missing from public: ${item.urlPath} (${item.source})`)
    }
  }
}

/**
 * @description 校验 Electron 打包配置和主进程仍以 Web 构建目录为静态资源根。
 * @returns {void} 边界偏移问题追加到全局问题列表，不返回数据。
 * @throws {Error} Electron 配置或主进程文件无法读取时抛出。
 */
function validateElectronBoundary() {
  const builderPath = join(repoDir, 'desktop', 'electron-builder.yml')
  const mainPath = join(repoDir, 'desktop', 'main.mjs')
  const builder = readFileSync(builderPath, 'utf8').replaceAll('\\', '/')
  const main = readFileSync(mainPath, 'utf8')
  if (!builder.includes('from: ../web/dist') || !builder.includes('to: web/dist')) {
    problems.push('Electron no longer packages web/dist as its static resource root')
  }
  if (!main.includes('WEB_DIST_DIR: paths.webDist')) {
    problems.push('Electron no longer points the Node static server at its packaged web/dist')
  }
}

/**
 * @description 从构建目录删除显式确认的冗余公开资源副本及其 Gzip 文件。
 * @returns {number} 本次删除的构建产物总字节数。
 * @throws {Error} 文件状态读取或删除失败时由文件系统接口抛出。
 */
function pruneConfirmedDistCopies() {
  let removedBytes = 0
  for (const relativePath of confirmedPublicExclusions.keys()) {
    for (const suffix of ['', '.gz']) {
      const target = join(distDir, `${relativePath}${suffix}`)
      if (!existsSync(target)) continue
      removedBytes += statSync(target).size
      rmSync(target, { force: true })
      console.log(`PRUNE dist/${toPosix(relative(distDir, target))}`)
    }
  }
  return removedBytes
}

/**
 * @description 校验构建目录完整镜像未排除的公开资源且文件体积一致。
 * @param {AssetRecord[]} publicRecords 公开目录资源记录。
 * @returns {void} 镜像缺失或体积变化问题追加到全局问题列表。
 * @throws {Error} 构建产物文件状态无法读取时由文件系统接口抛出。
 */
function validateDistMirror(publicRecords) {
  for (const record of publicRecords) {
    const target = join(distDir, record.relativePath)
    if (confirmedPublicExclusions.has(record.relativePath)) {
      if (existsSync(target)) {
        problems.push(`confirmed public exclusion is still in dist: ${record.relativePath}`)
      }
      continue
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      problems.push(`public asset is missing from dist: ${record.relativePath}`)
      continue
    }
    if (statSync(target).size !== record.bytes) {
      problems.push(`public asset size changed while copying to dist: ${record.relativePath}`)
    }
  }
}

/**
 * @description 通过文件体积和 SHA-256 摘要校验仅源码资源未被间接打入构建目录。
 * @param {AssetRecord[]} sourceRecords 源码资源记录。
 * @returns {void} 发现同内容构建副本时追加问题，不返回数据。
 * @throws {Error} 构建或源码文件无法读取时由文件系统接口抛出。
 */
function validateSourceOnlyHashes(sourceRecords) {
  const distFiles = walkFiles(distDir)
  const filesBySize = new Map()
  for (const path of distFiles) {
    const size = statSync(path).size
    if (!filesBySize.has(size)) filesBySize.set(size, [])
    filesBySize.get(size).push(path)
  }

  for (const relativePath of confirmedSourceOnly) {
    const record = sourceRecords.find((item) => item.relativePath === relativePath)
    if (!record) continue
    const sourceHash = sha256(record.path)
    const copies = (filesBySize.get(record.bytes) || []).filter((path) => sha256(path) === sourceHash)
    if (copies.length > 0) {
      problems.push(
        `unreferenced src asset was emitted to dist: ${relativePath} -> ${copies.map((path) => toPosix(relative(distDir, path))).join(', ')}`
      )
    }
  }
}

/**
 * @description 校验构建文本中的字面量静态 URL 均能解析为现存构建文件。
 * @returns {void} 缺失构建资源追加到全局问题列表，不返回数据。
 * @throws {Error} 构建文本或目标文件状态无法读取时由文件系统接口抛出。
 */
function validateBuiltLiteralUrls() {
  const builtCorpus = loadTextCorpus([distDir])
  for (const item of collectLiteralStaticUrls(builtCorpus)) {
    if (item.urlPath.includes('${')) continue
    const target = join(distDir, item.urlPath.slice(1))
    if (!existsSync(target) || !statSync(target).isFile()) {
      problems.push(`built static URL resolves to a missing file: ${item.urlPath} (${item.source})`)
    }
  }
}

/**
 * @description 计算文件内容的 SHA-256 摘要。
 * @param {string} path 待计算摘要的文件路径。
 * @returns {string} 小写十六进制 SHA-256 摘要。
 * @throws {Error} 文件无法读取时由文件系统接口抛出。
 */
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * @description 输出资源分类、保护目录、生产排除项和人工复核候选的审计摘要。
 * @param {AssetRecord[]} publicRecords 公开目录资源记录。
 * @param {AssetRecord[]} sourceRecords 源码资源记录。
 * @param {LiteralUrlRecord[]} literalUrls 已校验的字面量静态 URL。
 * @param {number} prunedBytes 本次从构建目录删除的字节数。
 * @returns {void} 审计摘要写入标准输出后不返回数据。
 */
function printReport(publicRecords, sourceRecords, literalUrls, prunedBytes) {
  const allRecords = [...publicRecords, ...sourceRecords]
  const statusCounts = Object.fromEntries(
    [...new Set(allRecords.map((record) => record.status))]
      .sort()
      .map((status) => [status, allRecords.filter((record) => record.status === status).length])
  )
  const protectedBytes = allRecords
    .filter((record) => record.status === 'dynamic-protected')
    .reduce((sum, record) => sum + record.bytes, 0)
  const excludedBytes = publicRecords
    .filter((record) => record.status === 'confirmed-build-exclusion')
    .reduce((sum, record) => sum + record.bytes, 0)

  console.log('Static asset audit')
  console.log(`- runtime text files scanned: ${runtimeCorpus.length}`)
  console.log(`- public files audited: ${publicRecords.length}`)
  console.log(`- src/assets files audited: ${sourceRecords.length}`)
  console.log(`- literal static URL references checked: ${literalUrls.length}`)
  console.log(`- status counts: ${JSON.stringify(statusCounts)}`)
  console.log(`- dynamic-protected bytes: ${formatBytes(protectedBytes)}`)
  console.log(`- confirmed public build exclusions: ${formatBytes(excludedBytes)}`)
  if (pruneDist) console.log(`- dist bytes pruned this run: ${formatBytes(prunedBytes)}`)

  console.log('\nConfirmed production exclusions (source files retained):')
  for (const record of publicRecords.filter(
    (item) => item.status === 'confirmed-build-exclusion'
  )) {
    const replacement = confirmedPublicExclusions.get(record.relativePath)
    console.log(
      `- public/${record.relativePath} (${formatBytes(record.bytes)})${replacement ? ` -> public/${replacement}` : ''}`
    )
  }
  for (const record of sourceRecords.filter((item) => item.status === 'confirmed-source-only')) {
    console.log(`- src/assets/${record.relativePath} (${formatBytes(record.bytes)}), not emitted by Vite`)
  }

  console.log('\nDynamic roots retained as complete families:')
  for (const rule of dynamicProtectionRules) {
    const records = allRecords.filter(
      (record) => record.root === rule.root && record.relativePath.startsWith(rule.prefix)
    )
    console.log(
      `- ${rule.root}/${rule.prefix} ${records.length} files, ${formatBytes(records.reduce((sum, record) => sum + record.bytes, 0))}: ${rule.reason}`
    )
  }

  const candidates = allRecords.filter((record) => record.status === 'candidate')
  console.log(`\nReview-only candidates (${candidates.length}; never pruned automatically):`)
  for (const record of candidates) {
    const docs = record.documentationReferences.length
      ? `; docs ${formatReferences(record.documentationReferences)}`
      : ''
    const prefix = record.root === 'public' ? 'public' : 'src/assets'
    console.log(`- ${prefix}/${record.relativePath} (${formatBytes(record.bytes)})${docs}`)
  }

  if (problems.length === 0) {
    console.log(`\nPASS static asset references${checkDist ? ', dist mirror, built URLs and Electron boundary' : ' and Electron boundary'}`)
  }
}

/**
 * @description 将资源引用位置格式化为逗号分隔的路径与行号文本。
 * @param {ReferenceRecord[]} references 资源引用位置列表。
 * @returns {string} 适合日志输出的引用位置文本。
 */
function formatReferences(references) {
  return references.map((reference) => `${reference.path}:${reference.line}`).join(', ')
}

/**
 * @description 将字节数格式化为 B、KiB 或 MiB 文本。
 * @param {number} bytes 待格式化的字节数。
 * @returns {string} 按数量级格式化的体积文本。
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

/**
 * @description 将 Windows 路径分隔符统一转换为正斜杠。
 * @param {string} path 待规范化的路径。
 * @returns {string} 使用正斜杠的路径。
 */
function toPosix(path) {
  return path.replaceAll('\\', '/')
}
