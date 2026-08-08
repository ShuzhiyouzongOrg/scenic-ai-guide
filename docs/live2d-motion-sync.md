# Live2D MotionSync integration

## Current state

The Live2D runtime now uses the official Cubism MotionSync Plugin for Web 5-r.2 and
its licensed CRI phoneme engine. Decoded TTS or official narration audio is played by
Web Audio and the same mono PCM stream is delivered incrementally to
`CubismMotionSync`, so mouth parameters are derived from the actual sound rather than a
synthetic sine wave.

The integration keeps the previous audio-feature analyzer as a runtime fallback. A
MotionSync Core download failure, invalid profile, unsupported model, or CRI processing
error does not block model rendering or audio playback.

## Runtime layout

```text
web/public/live2d/motionsync/core/
  live2dcubismmotionsynccore.min.js
  LICENSE.md
  RedistributableFiles.txt

web/src/lib/live2d/MotionSync/
  Core/live2dcubismmotionsynccore.d.ts
  Framework/src/*.ts
  LICENSE.md
  NOTICE.md
  CHANGELOG.md
```

The Core is loaded once after the standard Cubism Core. The application then starts the
MotionSync Framework, initializes Cubism, initializes MotionSync, and creates one
MotionSync processor per active model. Model processors are released before the shared
CRI engine and both frameworks are disposed.

## Audio and model update flow

1. The backend TTS or official audio file is decoded by the active `AudioContext`.
2. Multi-channel audio is downmixed to mono without changing the playback buffer.
3. `MotionSyncPcmCursor` releases only samples that have elapsed on the Web Audio clock;
   already processed samples are never sent twice.
4. `CubismMotionSync.setSoundBuffer()` and `updateParameters()` run after motion,
   expression, breath, physics, and pose updates, and before `CubismModel.update()`.
5. Processed samples are removed according to
   `getLastTotalProcessedCount()`, matching the official sample.
6. Pause stops PCM progress with the suspended audio clock. Stop, interruption, or a new
   playback generation clears buffered PCM so stale phonemes cannot enter the next
   narration.
7. Model switching and component unmount release the model processor, audio source,
   render loop, CRI engine, and WebGL resources.

## Model profiles

| Model  | MotionSync profile | Driven Cubism parameters                                            |
| ------ | ------------------ | ------------------------------------------------------------------- |
| Haru   | Basic CRI          | `ParamMouthOpenY`, `ParamMouthForm`                                 |
| Hiyori | Basic CRI          | `ParamMouthOpenY`, `ParamMouthForm`                                 |
| Hibiki | Basic CRI          | `ParamMouthOpenY`, `ParamMouthForm`                                 |
| Kei    | Vowels CRI         | `ParamMouthOpenY`, `ParamA`, `ParamI`, `ParamU`, `ParamE`, `ParamO` |

Kei exposes dedicated vowel blend shapes. The other bundled models use the official
Basic CRI mapping to convert A/I/U/E/O analysis into mouth-open and mouth-form values.

## Fallback behavior

- Core script unavailable: continue with the real-audio spectrum analyzer.
- Profile missing or invalid: load and render the model, then use the analyzer.
- CRI processing exception: release only the failed model processor and continue audio.
- TTS unavailable: preserve the existing text-only narration fallback.
- WebGL or model asset failure: preserve the existing avatar error state without blocking
  the guide or scenic map.

Fallback mouth motion remains audio-derived but must not be described as official
phoneme recognition. The application never substitutes unrelated random mouth motion.

## Verification

Automated checks cover:

- the complete asset graph and MotionSync profile of all four bundled models;
- presence of the locally hosted licensed MotionSync Core and redistribution notice;
- PCM clock alignment, channel downmix, queue-tail concatenation, and duplicate-sample
  prevention;
- TypeScript compilation and production bundling of the official Framework alias.

Browser acceptance must additionally check all four models with real narration audio:
model load, sound output, A/I/U/E/O articulation, silence closure, pause/resume/stop,
rapid model switching, stage view, and scenic-map portrait view.

## License and release requirements

The vendored Framework is governed by the Live2D Open Software License. MotionSync Core
is governed by the Live2D Proprietary Software License and only files listed in
`RedistributableFiles.txt` are copied to the public runtime directory. Keep all included
license and notice files in source and deployment packages.

Before public or commercial release, the operator must confirm that the project and all
model assets satisfy the applicable Live2D terms. Businesses meeting Live2D's revenue
threshold may also require a Cubism SDK Release License. See:

- <https://www.live2d.com/sdk/download/motionsync/>
- <https://docs.live2d.com/cubism-sdk-manual/cubism-sdk-motionsync-plugin-for-web/>
- <https://www.live2d.com/en/download/cubism-sdk/release-license/>
