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

function findDynamicProtection(record) {
  return (
    dynamicProtectionRules.find(
      (rule) => rule.root === record.root && record.relativePath.startsWith(rule.prefix)
    ) || null
  )
}

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

function validateLiteralSourceUrls(literalUrls) {
  for (const item of literalUrls) {
    if (item.urlPath.startsWith('/assets/')) continue
    const sourcePath = join(publicDir, item.urlPath.slice(1))
    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
      problems.push(`literal static URL is missing from public: ${item.urlPath} (${item.source})`)
    }
  }
}

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

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

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

function formatReferences(references) {
  return references.map((reference) => `${reference.path}:${reference.line}`).join(', ')
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

function toPosix(path) {
  return path.replaceAll('\\', '/')
}
