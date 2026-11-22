// Unit fixture for recorder ownership and PCM decoding. No hardware or SDK is used.
import assert from 'node:assert/strict'
import { createWechatRecorder, microphoneLevel } from '../visitor-app/services/wechat-audio.js'

const handlers = {}
const starts = []
let stops = 0
const recorder = {
  start(options) { starts.push(options) },
  stop() { stops++ },
}
for (const event of ['Start', 'FrameRecorded', 'Stop', 'Error', 'InterruptionBegin']) {
  recorder['on' + event] = fn => { assert.equal(handlers[event], undefined); handlers[event] = fn }
}
globalThis.wx = {
  getRecorderManager: () => recorder,
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'release' } }),
}
const first = createWechatRecorder()
const second = createWechatRecorder()
let started = 0
let interrupted = 0
let finalFile = ''
const levels = []
first.onStart(() => started++)
first.onStop(event => { finalFile = event.tempFilePath })
first.onFrameRecorded(level => levels.push(level))
first.onInterruptionBegin(() => { interrupted++; first.stop() })
let otherError = ''
second.onError(error => { otherError = error.errMsg })
const options = { duration: 60000, format: 'PCM', frameSize: 2, sampleRate: 16000, numberOfChannels: 1 }
first.start(options)
assert.deepEqual(starts.at(-1), options)
second.start(options)
assert.ok(otherError.includes('busy'))
handlers.Start()
handlers.FrameRecorded({ frameBuffer: new ArrayBuffer(0) })
handlers.FrameRecorded({ frameBuffer: new Int16Array([0, 0]).buffer })
handlers.FrameRecorded({ frameBuffer: new Int16Array([300, 3277, -3277]).subarray(1) })
handlers.FrameRecorded({ frameBuffer: new Int16Array([-19661, 19661]).buffer })
assert.deepEqual(levels, [0, 3277 / 32768, 19661 / 32768])
assert.equal(microphoneLevel({}), -1)
handlers.InterruptionBegin()
assert.equal(interrupted, 1)
assert.equal(stops, 1)
handlers.Stop({ tempFilePath: 'fixture.pcm' })
assert.equal(finalFile, 'fixture.pcm')

// Release during permission prompt. Stop the same native recording once started.
first.start(options)
first.stop()
assert.equal(stops, 1)
handlers.Start()
assert.equal(stops, 2)
assert.equal(started, 1)
handlers.Stop({ tempFilePath: '' })
first.offFrameRecorded()
second.start({ ...options, format: 'mp3', frameSize: undefined, encodeBitRate: 48000 })
handlers.Start()
handlers.FrameRecorded({ frameBuffer: new Int16Array([30000]).buffer })
assert.equal(levels.length, 3)
assert.equal('frameSize' in starts.at(-1), false)
assert.equal(starts.at(-1).encodeBitRate, 48000)
handlers.Stop({ tempFilePath: 'fixture.mp3' })
console.log('WeChat recorder adapter unit fixture passed: single listener ownership, PCM RMS, pending permission cancellation, MP3 fallback.')

// Optionally exercise the rendered bindings from an actual MP-WEIXIN build.
// node scripts/verify-wechat-audio.mjs --mp-build PATH [--evidence FILE]
// Add --previous-meter only when reproducing the pre-fix weak-signal baseline.
const buildOption = process.argv.indexOf('--mp-build')
if (buildOption !== -1) {
  const { measureWechatOrb } = await import('./fixtures/wechat-orb-pcm.mjs')
  const result = await measureWechatOrb(process.argv[buildOption + 1], process.argv.includes('--previous-meter'))
  const json = JSON.stringify(result, null, 2)
  const output = process.argv.indexOf('--evidence')
  if (output === -1) console.log(json)
  else {
    const { mkdirSync, writeFileSync } = await import('node:fs')
    const { dirname } = await import('node:path')
    const file = process.argv[output + 1]
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, json + '\n')
  }
}
