/**
 * @fileoverview 生产构建 Source Map 归档脚本。
 * @description 将构建目录中的 Source Map 移至独立制品目录，并记录版本、提交与校验摘要。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = resolve(webRoot, option('--dist', 'dist'))
const artifactRoot = resolve(
  webRoot,
  option(
    '--artifact-root',
    process.env.SOURCEMAP_ARTIFACT_DIR || 'performance/artifacts/sourcemaps'
  )
)

/**
 * @description 读取命令行选项后的值，缺失时使用默认值。
 * @param {string} name 命令行选项名称。
 * @param {string} fallback 未提供选项值时使用的默认值。
 * @returns {string} 命令行传入值或默认值。
 */
function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

/**
 * @description 递归列出目录下的全部文件。
 * @param {string} directory 待遍历的目录绝对路径。
 * @returns {string[]} 目录树中的文件绝对路径列表。
 * @throws {Error} 目录不存在或读取失败时由文件系统接口抛出。
 */
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

/**
 * @description 执行 Git 只读命令并在失败或空输出时返回回退值。
 * @param {string[]} args 传给 Git 的参数列表。
 * @param {string} [fallback] 命令失败或输出为空时使用的回退值。
 * @returns {string} 去除首尾空白后的命令输出或回退值。
 */
function gitValue(args, fallback = 'unknown') {
  try {
    return (
      execFileSync('git', args, {
        cwd: webRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim() || fallback
    )
  } catch {
    return fallback
  }
}

/**
 * @description 从生产环境变量文件中读取应用版本号。
 * @returns {string} 生产版本号；文件缺失或配置无效时返回空字符串。
 */
function readProductionVersion() {
  try {
    const source = readFileSync(join(webRoot, '.env.production'), 'utf8')
    const match = source.match(/^\s*VITE_VERSION\s*=\s*(.*?)\s*$/m)
    return match?.[1]?.replace(/^['"]|['"]$/g, '') || ''
  } catch {
    return ''
  }
}

/**
 * @description 将任意值规范化为可安全用于目录名称的路径片段。
 * @param {unknown} value 待规范化的版本、提交或构建标识。
 * @returns {string} 仅含字母、数字、点、下划线和连字符的非空片段。
 */
function safeSegment(value) {
  return (
    String(value || 'unknown')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  )
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
 * @description 校验目标目录严格位于指定归档根目录内部。
 * @param {string} root 允许写入的归档根目录。
 * @param {string} target 待校验的目标目录。
 * @returns {void} 路径通过校验时不返回值。
 * @throws {Error} 目标等于根目录或逃逸到根目录外时抛出。
 */
function assertInside(root, target) {
  const relation = relative(root, target)
  if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) {
    throw new Error(`Sourcemap artifact path escapes its root: ${target}`)
  }
}

if (!existsSync(distRoot) || !statSync(distRoot).isDirectory()) {
  throw new Error(`Production dist does not exist: ${distRoot}`)
}

const packageJson = JSON.parse(readFileSync(join(webRoot, 'package.json'), 'utf8'))
const commit = safeSegment(
  process.env.BUILD_COMMIT || process.env.GITHUB_SHA || gitValue(['rev-parse', 'HEAD'])
)
const version = safeSegment(
  process.env.BUILD_VERSION ||
    process.env.VITE_VERSION ||
    readProductionVersion() ||
    packageJson.version
)
const buildId = safeSegment(
  process.env.BUILD_ID ||
    (process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
      : new Date().toISOString().replace(/[:.]/g, '-'))
)
const artifactDirectory = join(artifactRoot, version, commit, buildId)
assertInside(artifactRoot, artifactDirectory)

const sourceMaps = walk(distRoot)
  .filter((path) => path.endsWith('.map') || path.endsWith('.map.gz'))
  .sort()
if (sourceMaps.length === 0) {
  throw new Error(`No hidden sourcemaps were produced below ${distRoot}.`)
}

const entries = []
for (const sourcePath of sourceMaps) {
  const distMap = relative(distRoot, sourcePath).replaceAll(sep, '/')
  const artifactPath = join(artifactDirectory, ...distMap.split('/'))
  mkdirSync(dirname(artifactPath), { recursive: true })
  renameSync(sourcePath, artifactPath)

  const distAsset = distMap.replace(/\.map(?:\.gz)?$/, '')
  const assetPath = join(distRoot, ...distAsset.split('/'))
  const assetExists = existsSync(assetPath) && statSync(assetPath).isFile()
  entries.push({
    distAsset,
    artifactMap: relative(artifactRoot, artifactPath).replaceAll(sep, '/'),
    compressed: distMap.endsWith('.map.gz'),
    bytes: statSync(artifactPath).size,
    sha256: sha256(artifactPath),
    assetBytes: assetExists ? statSync(assetPath).size : null,
    assetSha256: assetExists ? sha256(assetPath) : null
  })
}

const publicMaps = walk(distRoot).filter(
  (path) => path.endsWith('.map') || path.endsWith('.map.gz')
)
if (publicMaps.length > 0) {
  throw new Error(`Public dist still contains sourcemaps: ${publicMaps.join(', ')}`)
}

const publicMapReferences = walk(distRoot)
  .filter((path) => /\.(?:js|css)$/i.test(path))
  .filter((path) => /sourceMappingURL\s*=/.test(readFileSync(path, 'utf8')))
if (publicMapReferences.length > 0) {
  throw new Error(
    `Hidden sourcemap build leaked sourceMappingURL references: ${publicMapReferences.join(', ')}`
  )
}

const manifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  commit,
  commitShort: commit.slice(0, 12),
  version,
  packageVersion: packageJson.version,
  buildId,
  dirty: gitValue(['status', '--porcelain'], '') !== '',
  publicDist: relative(webRoot, distRoot).replaceAll(sep, '/'),
  sourceMapCount: entries.length,
  sourceMaps: entries
}
mkdirSync(artifactDirectory, { recursive: true })
writeFileSync(
  join(artifactDirectory, 'sourcemap-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
)

console.log(
  `Archived ${entries.length} hidden sourcemaps for ${version}@${commit.slice(0, 12)} to ${relative(webRoot, artifactDirectory)}.`
)
