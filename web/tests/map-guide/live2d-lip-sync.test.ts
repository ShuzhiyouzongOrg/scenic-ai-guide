/**
 * @fileoverview Live2D 启发式口型分析测试。
 * @description 验证 Live2D 启发式口型分析在静音、暂停、元音和不同帧率下的稳定性。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { Live2dLipSyncAnalyzer, type LipSyncFrame } from '../../src/lib/live2d/lipSyncAnalyzer'

const sampleRate = 48_000
const fftSize = 2048

test('live2d lip sync keeps the mouth closed during silence and after stop', () => {
  const analyzer = new Live2dLipSyncAnalyzer()
  const silence = new Float32Array(fftSize)
  const spectrum = createSpectrum()

  for (let frame = 0; frame < 30; frame += 1) {
    const result = analyzer.analyze(input(silence, spectrum, 16.67, 'playing'))
    assert.equal(result.mouthOpen, 0)
    assert.equal(result.voiced, false)
  }

  analyzer.analyze(input(createVoiceWave(0.12), createSpectrum({ mid: -28 }), 16.67, 'playing'))
  const stopped = analyzer.analyze(input(silence, spectrum, 16.67, 'stopped'))
  assert.deepEqual(stopped, {
    mouthOpen: 0,
    mouthForm: 0,
    vowels: { a: 0, i: 0, u: 0, e: 0, o: 0 },
    rms: 0,
    voiced: false
  })
})

test('live2d lip sync follows speech attack and closes quickly while paused', () => {
  const analyzer = new Live2dLipSyncAnalyzer()
  const wave = createVoiceWave(0.12)
  const spectrum = createSpectrum({ open: -30, mid: -26 })
  let frame = analyzer.analyze(input(wave, spectrum, 16.67, 'playing'))
  const firstOpen = frame.mouthOpen

  for (let index = 0; index < 12; index += 1) {
    frame = analyzer.analyze(input(wave, spectrum, 16.67, 'playing'))
  }
  assert.ok(frame.mouthOpen > firstOpen)
  assert.ok(frame.mouthOpen > 0.45)

  const beforePause = frame.mouthOpen
  for (let index = 0; index < 7; index += 1) {
    frame = analyzer.analyze(input(new Float32Array(fftSize), createSpectrum(), 16.67, 'paused'))
  }
  assert.ok(frame.mouthOpen < beforePause)
  assert.ok(frame.mouthOpen < 0.02)
})

test('live2d lip sync varies mouth form and vowel weights with the real spectrum', () => {
  const roundedAnalyzer = new Live2dLipSyncAnalyzer()
  const spreadAnalyzer = new Live2dLipSyncAnalyzer()
  const wave = createVoiceWave(0.11)
  let rounded!: LipSyncFrame
  let spread!: LipSyncFrame

  for (let index = 0; index < 18; index += 1) {
    rounded = roundedAnalyzer.analyze(
      input(wave, createSpectrum({ low: -24, open: -44, bright: -62 }), 16.67, 'playing')
    )
    spread = spreadAnalyzer.analyze(
      input(wave, createSpectrum({ low: -58, open: -48, bright: -23 }), 16.67, 'playing')
    )
  }

  assert.ok(rounded.mouthForm < 0)
  assert.ok(spread.mouthForm > 0)
  assert.ok(rounded.vowels.u > rounded.vowels.i)
  assert.ok(spread.vowels.i > spread.vowels.u)
})

test('live2d lip sync gives open vowels shape and returns uncertain consonants toward neutral', () => {
  const openAnalyzer = new Live2dLipSyncAnalyzer()
  const consonantAnalyzer = new Live2dLipSyncAnalyzer()
  const wave = createVoiceWave(0.11)
  let open!: LipSyncFrame
  let consonant!: LipSyncFrame

  for (let index = 0; index < 18; index += 1) {
    open = openAnalyzer.analyze(
      input(wave, createSpectrum({ open: -24, mid: -29, bright: -60 }), 16.67, 'playing')
    )
    consonant = consonantAnalyzer.analyze(
      input(wave, createSpectrum({ open: -55, mid: -54, sibilant: -20 }), 16.67, 'playing')
    )
  }

  const openVowelWeight = Object.values(open.vowels).reduce((sum, value) => sum + value, 0)
  const consonantVowelWeight = Object.values(consonant.vowels).reduce(
    (sum, value) => sum + value,
    0
  )
  assert.ok(open.vowels.a > open.vowels.u)
  assert.ok(open.mouthForm > 0)
  assert.ok(consonantVowelWeight < openVowelWeight)
})

test('live2d lip sync smoothing is stable across 30 and 60 fps', () => {
  const at30 = runForDuration(30, 360)
  const at60 = runForDuration(60, 360)
  assert.ok(Math.abs(at30.mouthOpen - at60.mouthOpen) < 0.06)
  assert.ok(Math.abs(at30.mouthForm - at60.mouthForm) < 0.06)
})

function runForDuration(fps: number, durationMs: number): LipSyncFrame {
  const analyzer = new Live2dLipSyncAnalyzer()
  const deltaTimeMs = 1000 / fps
  const frames = Math.round(durationMs / deltaTimeMs)
  let result!: LipSyncFrame
  for (let index = 0; index < frames; index += 1) {
    result = analyzer.analyze(
      input(
        createVoiceWave(0.1),
        createSpectrum({ open: -31, mid: -27, bright: -37 }),
        deltaTimeMs,
        'playing'
      )
    )
  }
  return result
}

function createVoiceWave(amplitude: number): Float32Array {
  const samples = new Float32Array(fftSize)
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate
    samples[index] =
      Math.sin(2 * Math.PI * 180 * time) * amplitude +
      Math.sin(2 * Math.PI * 540 * time) * amplitude * 0.35
  }
  return samples
}

function createSpectrum(
  levels: Partial<Record<'low' | 'open' | 'mid' | 'bright' | 'sibilant', number>> = {}
): Float32Array {
  const spectrum = new Float32Array(fftSize / 2)
  spectrum.fill(-120)
  fillBand(spectrum, 160, 500, levels.low ?? -120)
  fillBand(spectrum, 500, 900, levels.open ?? -120)
  fillBand(spectrum, 900, 1600, levels.mid ?? -120)
  fillBand(spectrum, 1600, 2800, levels.bright ?? -120)
  fillBand(spectrum, 2800, 6000, levels.sibilant ?? -120)
  return spectrum
}

function fillBand(spectrum: Float32Array, minHz: number, maxHz: number, db: number): void {
  const binHz = sampleRate / fftSize
  const start = Math.ceil(minHz / binHz)
  const end = Math.min(spectrum.length - 1, Math.floor(maxHz / binHz))
  for (let index = start; index <= end; index += 1) spectrum[index] = db
}

function input(
  timeDomain: Float32Array,
  spectrumDb: Float32Array,
  deltaTimeMs: number,
  playbackState: 'playing' | 'paused' | 'stopped'
) {
  return { timeDomain, spectrumDb, sampleRate, fftSize, deltaTimeMs, playbackState }
}
