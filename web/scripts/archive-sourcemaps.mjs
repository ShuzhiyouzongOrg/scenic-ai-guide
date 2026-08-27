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

function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

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

function readProductionVersion() {
  try {
    const source = readFileSync(join(webRoot, '.env.production'), 'utf8')
    const match = source.match(/^\s*VITE_VERSION\s*=\s*(.*?)\s*$/m)
    return match?.[1]?.replace(/^['"]|['"]$/g, '') || ''
  } catch {
    return ''
  }
}

function safeSegment(value) {
  return (
    String(value || 'unknown')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  )
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

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
