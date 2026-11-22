// Exercise the compiled Mini Program without opening a microphone or a WeChat session.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mock } from 'node:test'

export async function measureWechatOrb(buildDir, previousMeter = false) {
  const fromBuild = createRequire(resolve(buildDir, 'app.js'))
  const hooks = {}
  const recorder = { start(options) { this.options = options }, stop() {} }
  for (const name of ['Start', 'Stop', 'FrameRecorded', 'Error', 'InterruptionBegin']) {
    recorder['on' + name] = fn => { hooks[name] = fn }
  }
  globalThis.wx = {
    getSystemInfoSync: () => ({}), getAppBaseInfo: () => ({}), getDeviceInfo: () => ({}),
    getWindowInfo: () => ({}), getStorageSync: () => 'off', canIUse: () => false,
    getRecorderManager: () => recorder, getAccountInfoSync: () => ({ miniProgram: { envVersion: 'release' } }),
  }
  globalThis.Page = globalThis.App = globalThis.Component = () => {}
  globalThis.getApp = () => null
  const vue = fromBuild('./common/vendor.js')
  const mounted = [], unmounted = []
  let component
  wx.createComponent = definition => { component = definition }
  // Replace only the host lifecycle/element registration. Computed properties,
  // watchers, render functions, metering, and the Orb clock run from the build.
  Object.assign(vue, {
    onMounted: fn => mounted.push(fn), onUnmounted: fn => unmounted.push(fn),
    p: props => props, gei: () => '', sei: () => '', pvhc: () => '',
  })
  fromBuild('./design/motion.js').initializeDesignMotion()
  const tokens = fromBuild('./design/orb-tokens.js')
  const guide = fromBuild('./stores/guide-audio.js').useGuideAudio()
  const adapter = fromBuild('./services/wechat-audio.js').createWechatRecorder()
  const props = vue.reactive({
    get state() { return guide.interactionState.value },
    get level() { return guide.amplitude.value },
    get sampleCount() { return guide.sampleCount?.value },
    label: '声音电平', active: true, reducedMotion: false, size: 76,
  })
  function renderComponent(name) {
    fromBuild('./components/' + name + '/' + name + '.js')
    const render = component.setup(props, { expose() {} })
    return () => render(Object.assign({ $scope: { data: {} }, u_s_b_h: 0, u_s_a_i_b: 0 }, props), {})
  }
  const orb = renderComponent('sg-ai-ambient-orb'), meter = renderComponent('guide-level-meter')
  const sizes = [0, 0.025, 0.32]
  const names = ['silence', 'quiet', 'normal']
  const rate = 16000, seconds = 2, frequency = 220, frameBytes = 2048
  const page = readFileSync(resolve(buildDir, 'pages/ai-guide/index.js'), 'utf8')
  const pcmOptions = page.match(/\{[^{}]*?format:\s*['"]PCM['"][^{}]*?\}/)?.[0]
  assert.ok(pcmOptions, 'compiled guide PCM recorder options')
  for (const [key, value] of Object.entries({ sampleRate: rate, frameSize: frameBytes / 1024, numberOfChannels: 1 })) {
    assert.equal(Number(pcmOptions.match(new RegExp(key + ':\\s*([\\d.e+]+)', 'i'))?.[1]), value, key)
  }
  const segmentSamples = rate * seconds
  const pcm = Buffer.alloc(sizes.length * segmentSamples * 2)
  for (let i = 0; i < pcm.length / 2; i++) {
    const peak = sizes[Math.floor(i / segmentSamples)]
    pcm.writeInt16LE(Math.round(32767 * peak * Math.sin(2 * Math.PI * frequency * i / rate)), i * 2)
  }
  const rounded = x => Number(x.toFixed(6))
  const levels = sizes.map(() => []), boundaries = [], endpoints = [], attack = [], release = []
  function renderSample() {
    const model = orb(), bars = meter()
    const opacity = Number(model.g.match(/opacity:([\d.]+);/)[1])
    return {
      timeMs: Date.now(), rms: rounded(props.level), state: props.state, sampleCount: props.sampleCount,
      // sheen opacity in the current WXML binding is 0.77 + 0.22 * envelope.
      envelopeFromSheenOpacity: rounded((opacity - 0.77) / 0.22),
      volumeRing: model.c, glowStrength: rounded(model.a.strength),
      bodyTransform: model.i.split('transform:')[1],
      meterBarHeightsPx: bars.a ? bars.b.map(bar => parseInt(bar.b.slice(7), 10)) : [],
    }
  }
  adapter.onStart(() => { guide.beginAction(); guide.recording.value = true })
  const unknownAt = []
  let callbacks = 0
  adapter.onFrameRecorded(level => {
    callbacks++
    if (level < 0) unknownAt.push(Date.now())
    guide.sample('microphone', level)
  })
  adapter.onStop(() => { guide.recording.value = false; guide.resetMeter() })
  mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 0 })
  try {
    mounted.forEach(fn => fn())
    adapter.start({ duration: 60000, format: 'PCM', sampleRate: rate, numberOfChannels: 1, frameSize: frameBytes / 1024 })
    hooks.Start()
    await Promise.resolve()
    const missing = renderSample()
    assert.equal(missing.rms, -1)
    assert.equal(missing.volumeRing, false)
    let byte = 0
    for (let ms = 16; ms <= seconds * sizes.length * 1000; ms += 16) {
      mock.timers.tick(16)
      const end = Math.min(byte + frameBytes, pcm.length)
      if (ms === end * 1000 / (2 * rate)) {
        hooks.FrameRecorded({ frameBuffer: pcm.subarray(byte, end) })
        await Promise.resolve()
        assert.equal(guide.amplitudeSource.value, 'microphone')
        const first = Math.floor(byte / (2 * segmentSamples)), last = Math.floor((end - 1) / (2 * segmentSamples))
        if (first === last) levels[first].push(props.level)
        else boundaries.push({ endMs: ms, rms: rounded(props.level), from: names[first], to: names[last] })
        byte = end
      }
      if (ms % (seconds * 1000) === 0) endpoints.push(renderSample())
      if ([2080, 2160, 2320, 4080, 4160, 4320].includes(ms)) attack.push(renderSample())
    }
    assert.equal(byte, pcm.length)
    assert.equal(endpoints[0].envelopeFromSheenOpacity, 0)
    assert.ok(levels[0].every(value => value === 0))
    assert.ok(endpoints[1].rms > 0 && endpoints[1].rms < 0.025)
    assert.deepEqual(endpoints.map(point => point.volumeRing), [false, true, true])
    for (let i = 1; i < sizes.length; i++) {
      const previous = endpoints[i - 1], point = endpoints[i]
      assert.ok(point.envelopeFromSheenOpacity > previous.envelopeFromSheenOpacity + 0.1)
      if (previousMeter && i === 1) assert.deepEqual(point.meterBarHeightsPx, previous.meterBarHeightsPx)
      else assert.ok(Math.min(...point.meterBarHeightsPx) > Math.max(...previous.meterBarHeightsPx))
    }
    hooks.FrameRecorded({ frameBuffer: new ArrayBuffer(frameBytes) })
    await Promise.resolve()
    for (const dt of [80, 240, 640]) {
      for (let elapsed = 0; elapsed < dt; elapsed += 16) {
        mock.timers.tick(16)
        if ((Date.now() - endpoints[2].timeMs) % 64 === 0) {
          hooks.FrameRecorded({ frameBuffer: new ArrayBuffer(frameBytes) })
          await Promise.resolve()
        }
      }
      const point = renderSample(), elapsed = point.timeMs - endpoints[2].timeMs
      const expected = endpoints[2].envelopeFromSheenOpacity * Math.exp(-elapsed / tokens.orbReleaseMs)
      assert.equal(point.volumeRing, false)
      assert.ok(Math.abs(point.envelopeFromSheenOpacity - expected) < 0.00001)
      release.push(point)
    }
    if (!previousMeter) assert.deepEqual(release.at(-1).meterBarHeightsPx, endpoints[0].meterBarHeightsPx)
    adapter.stop()
    const callbacksAtStop = callbacks
    hooks.FrameRecorded({ frameBuffer: pcm.subarray(-frameBytes) })
    assert.equal(callbacks, callbacksAtStop)
    hooks.Stop({ tempFilePath: 'fixture.pcm' })
    await Promise.resolve()
    hooks.FrameRecorded({ frameBuffer: pcm.subarray(-frameBytes) })
    const stopped = renderSample()
    assert.deepEqual([stopped.state, stopped.rms, stopped.envelopeFromSheenOpacity, guide.amplitudeSource.value], ['IDLE', -1, 0, ''])
    assert.deepEqual(stopped.meterBarHeightsPx, [])
    adapter.start(recorder.options)
    hooks.Start()
    const gapStart = Date.now()
    hooks.FrameRecorded({ frameBuffer: pcm.subarray(-frameBytes) })
    await Promise.resolve()
    for (let ms = 0; ms < 2000; ms += 16) {
      mock.timers.tick(16)
      await Promise.resolve()
    }
    const interruptedFrames = renderSample()
    assert.equal(interruptedFrames.state, 'LISTENING')
    const unknownAfterGapMs = unknownAt.map(time => time - gapStart)
    if (previousMeter) {
      assert.deepEqual(unknownAfterGapMs, [])
      assert.ok(interruptedFrames.rms > 0 && interruptedFrames.volumeRing)
    } else {
      assert.deepEqual(unknownAfterGapMs, [512])
      assert.deepEqual([interruptedFrames.rms, interruptedFrames.volumeRing, interruptedFrames.meterBarHeightsPx], [-1, false, []])
    }
    hooks.FrameRecorded({ frameBuffer: pcm.subarray(-frameBytes) })
    await Promise.resolve()
    mock.timers.tick(tokens.orbTickMs)
    const recovered = renderSample()
    assert.ok(recovered.rms > 0 && recovered.volumeRing && recovered.meterBarHeightsPx.length === 7)
    assert.equal(guide.amplitudeSource.value, 'microphone')
    adapter.stop()
    hooks.Stop({ tempFilePath: 'fixture.pcm' })
    await Promise.resolve()
    const afterStopCallbacks = callbacks
    hooks.FrameRecorded({ frameBuffer: pcm.subarray(-frameBytes) })
    mock.timers.tick(2000)
    assert.equal(callbacks, afterStopCallbacks, 'late PCM and a prior gap timer cannot touch a stopped recording')
    const files = ['services/wechat-audio.js', 'stores/guide-audio.js', 'design/motion.js', 'design/orb-tokens.js',
      'components/sg-ai-ambient-orb/sg-ai-ambient-orb.js', 'components/guide-level-meter/guide-level-meter.js']
    return {
      kind: 'Deterministic PCM fixture through built MP-WEIXIN code. WeChat hardware and UI are not exercised.',
      meterExpectation: previousMeter ? 'Before correction: quiet input rounds to the same 3 px as digital silence.' : 'Three distinct levels and no stale bars after sustained silence.',
      generated: { frequencyHz: frequency, format: 'signed 16-bit little-endian, mono', sampleRateHz: rate,
        secondsPerSegment: seconds, frameBytes, fullFrameMs: 64, frameCount: Math.ceil(pcm.length / frameBytes),
        finalFrameBytes: pcm.length % frameBytes, sha256: createHash('sha256').update(pcm).digest('hex') },
      options: recorder.options, tokens, clock: '16 ms deterministic steps. When callbacks coincide the Orb ticks before PCM delivery.',
      segments: names.map((name, i) => ({ name, peakFractionOfFullScale: sizes[i], fullSegmentFrames: levels[i].length,
        measuredFrameRmsRange: [rounded(Math.min(...levels[i])), rounded(Math.max(...levels[i]))], endpoint: endpoints[i] })),
      mixedFrames: boundaries, beforeFirstFrame: missing, attackSamples: attack,
      releaseAfterDigitalSilence: release, afterStopAndLateFrame: stopped,
      recordingWithoutCallbacksForTwoSecondsAfterPositiveInput: interruptedFrames,
      unknownReadingAfterGapMs: unknownAfterGapMs, firstFrameAfterGap: recovered,
      buildSha256: Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(resolve(buildDir, file))).digest('hex')])),
    }
  } finally {
    unmounted.forEach(fn => fn())
    mock.timers.reset()
  }
}
