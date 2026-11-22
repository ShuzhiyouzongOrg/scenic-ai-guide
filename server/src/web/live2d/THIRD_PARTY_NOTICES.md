# Live2D runtime notices

This evaluation-only runtime compiles the Cubism Web Framework code previously
ported from `awesome-digital-human-live2d` into this repository. The upstream
application is MIT licensed, but that license does not replace the separate
Live2D licenses below.

- Cubism Web Framework: Live2D Open Software License.
- Cubism Core (`live2dcubismcore.min.js`): Live2D Proprietary Software License.
- Bundled `.moc3`, texture, motion, and expression files: verify the license of
  each model before public distribution. Their presence in an MIT repository
  does not establish an MIT license for the model artwork.
- A Cubism SDK Release License may be required depending on the distributor's
  business status and release scenario.

This test integration must not be treated as clearance for a public release.
Review the current Live2D agreements and replace the evaluation models with
models whose publication rights are documented before shipping.

## DCloud WebView bridge

The embedded App stage serves DCloud's unmodified `uni.webview.1.5.8.js`
from the same origin. This 6,641-byte browser adapter transports model and
playback events across the uni-app x WebView boundary. It has no runtime
package dependencies. Ordinary framed browser previews use the existing
parent-window channel.

- [Official SDK, pinned to commit 1dfb0982a50f2297f856b5dda8a4cd38bb504e95](https://github.com/dcloudio/uni-app/blob/1dfb0982a50f2297f856b5dda8a4cd38bb504e95/dist/uni.webview.1.5.8.js)
- [Bundled Apache License 2.0](vendor/dcloud/LICENSE) and [upstream license](https://github.com/dcloudio/uni-app/blob/1dfb0982a50f2297f856b5dda8a4cd38bb504e95/LICENSE)
- SDK SHA-256: `5ce885a6a9a3864d6fe63309a73a4d8275d3701a48160c9123f768402a3b4df8`
