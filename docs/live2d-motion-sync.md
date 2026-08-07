# Live2D MotionSync integration status

## Current state

The application currently uses two distinct lip-sync paths:

- The production fallback path analyzes the real Web Audio signal and drives mouth-open,
  mouth-form, and vowel parameters. It is audio-derived, but it is not Live2D Cubism
  MotionSync.
- All four bundled models now reference a valid `motionsync3.json` configuration. Haru,
  Hiyori, and Hibiki use the Basic CRI mapping; Kei uses its Vowels CRI mapping.

The official phoneme-level path is not enabled because this repository does not contain
`live2dcubismmotionsynccore.min.js`. The Core is not distributed in the public
`CubismWebMotionSyncComponents` GitHub repository and is governed by the Live2D
Proprietary Software License Agreement.

## Required licensed input

Download the Web MotionSync package from the official Live2D download page after reviewing
and accepting its license:

- <https://www.live2d.com/sdk/download/motionsync/>
- <https://github.com/Live2D/CubismWebMotionSyncComponents>
- <https://docs.live2d.com/en/cubism-sdk-manual/motion-sync-setting-web/>

The expected licensed files include:

```text
live2dcubismmotionsynccore.min.js
live2dcubismmotionsynccore.d.ts
```

Do not substitute the ordinary `live2dcubismcore.min.js`; it renders Cubism models but does
not provide CRI phoneme analysis.

## Prepared model mapping

| Model | MotionSync profile | Required Cubism parameters |
| --- | --- | --- |
| Haru | Basic CRI | `ParamMouthOpenY`, `ParamMouthForm` |
| Hiyori | Basic CRI | `ParamMouthOpenY`, `ParamMouthForm` |
| Hibiki | Basic CRI | `ParamMouthOpenY`, `ParamMouthForm` |
| Kei | Vowels CRI | `ParamMouthOpenY`, `ParamA`, `ParamI`, `ParamU`, `ParamE`, `ParamO` |

`web/tests/map-guide/live2d-model-assets.test.ts` verifies every mapping against each
model's CDI data and checks the complete referenced asset graph.

## Integration work after Core provisioning

1. Add the licensed MotionSync Core as a locally controlled static asset; do not use a
   third-party CDN.
2. Vendor the matching official MotionSync Framework source and license notices from the
   same SDK release.
3. Load the Core once, initialize the MotionSync Framework, and fall back to the current
   audio-feature analyzer when initialization fails.
4. Feed decoded TTS PCM samples at their native sample rate into `CubismMotionSync` while
   the same `AudioBufferSourceNode` is playing.
5. Apply `CubismMotionSync.updateParameters()` after motion, expression, breath, and
   physics updates and before `CubismModel.update()`.
6. Stop PCM delivery on pause, interruption, model change, and component unmount. Recreate
   the processor when the input sample rate changes.
7. Validate A/I/U/E/O articulation, silence closure, pause/resume, segment boundaries, and
   rapid model switching for all four models before calling the path official MotionSync.

Until those steps are completed with the licensed Core present, product copy must describe
the current behavior as audio-driven lip sync rather than official phoneme-level MotionSync.
