// Requires ImageMagick 7 only when regenerating the checked-in PNGs.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('../visitor-app/', import.meta.url))
const {color} = JSON.parse(fs.readFileSync(path.join(app, 'design/tokens.json'), 'utf8'))
for (const name of ['home','map','ai','trip','profile']) {
  const master = fs.readFileSync(path.join(app, 'design/icons', name + '.svg'), 'utf8')
  for (const [theme, suffix] of ['', '-dark'].entries()) {
    for (const selected of [false, true]) {
      const svg = master.replace('currentColor', color[selected ? 'primary' : 'muted'][theme])
        .replace('stroke-width="1.65"', selected ? 'stroke-width="2.45"' : 'stroke-width="1.65"')
      const output = path.join(app, 'static/tabbar', name + (selected ? '-active' : '') + suffix + '.png')
      const result = spawnSync('magick', ['-background','none','-density','576','svg:-','-resize','72x72','-strip','-define','png:exclude-chunks=date,time','PNG32:' + output], {input:svg})
      if (result.status !== 0) throw new Error(result.error?.message || result.stderr.toString())
    }
  }
}

// Native map markers require image paths. Keep the same center anchor and
// outline as the interactive markers drawn over the illustrated map.
const pointMaster = fs.readFileSync(path.join(app, 'design/icons/map-point.svg'), 'utf8')
for (const [theme, suffix] of ['', '-dark'].entries()) {
  for (const selected of [false, true]) {
    const svg = pointMaster.replace('currentColor', color[selected ? 'ai' : 'primary'][theme])
      .replace('stroke="white"', 'stroke="' + color.surface[theme] + '"')
      .replace('fill="none"', selected ? 'fill="' + color.surface[theme] + '"' : 'fill="none"')
    const filename = 'map-point' + (selected ? '-active' : '') + suffix + '.png'
    const output = path.join(app, 'static/map', filename)
    const result = spawnSync('magick', ['-background','none','-density','576','svg:-','-resize','72x72','-strip','-define','png:exclude-chunks=date,time','PNG32:' + output], {input:svg})
    if (result.status !== 0) throw new Error(result.error?.message || result.stderr.toString())
  }
}
