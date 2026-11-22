# 沉浸式 AI 导游 · H5 运行验收

本文是独立语音底栏时期的宿主证据。五格中央语音及四个普通目的地的当前几何和交互记录见[导航 H5 验收](guide-navigation-web-verification.md)。

2026-11-22，在 Windows 上运行 HBuilderX 5.24 的生产 H5 页面，Chromium 151.0.7922.34 与 WebKit 26.5 各测试两种视口。四组均载入同一份 `pages-ai-guide-index.DDnq952T.js`，SHA-256 为 `f2d1df58f322554f67642908299a1c6b792caa35dfb9be5b796f3d21bf45d8d0`。两组 Chromium 各完成 12 项、两组 WebKit 各完成 8 项记录，页面未出现未捕获脚本异常。浏览器中的服务请求统一转发到回环内存后端（ASR、TTS、LLM 为 mock），其他第三方主机请求被阻止。未配置的讯飞云舞台返回 503 后页面保留静态角色及问答。商用数字人会话、实体麦克风和 iPhone 另需实机验证。

| 环境 | 按真实入口执行的操作 | 实际画面与日志 |
| --- | --- | --- |
| Chromium，390 × 844，简体、浅色、标准字号 | 以键盘进入设置、在弹层内移动焦点、Esc 返回原按钮。项目动效开关的两个值均写入存储。计时、字幕可见，历史含问答正文与资料。 | [首屏](evidence/guide-immersive-chromium-390-zh-light.webp) · [收音](evidence/guide-immersive-measured-mic.webp) · [历史与来源](evidence/guide-immersive-history.webp) · [检查项和产物 SHA](evidence/guide-immersive-chromium-390-zh-light.json) |
| Chromium，320 × 760，英文、深色、大字 | 文字和主操作未水平溢出。系统要求减动时显示原因；不能用应用开关覆盖。冷启、收音/取消、文字提问、历史回听、中断和切页均走实际页面。 | [首屏](evidence/guide-immersive-chromium-320-en-dark.webp) · [检查项和产物 SHA](evidence/guide-immersive-chromium-320-en-dark.json) |
| WebKit，390 × 844，简体、浅色 | 验证设置、焦点、字幕、文字提问、历史、来源和切页。Windows Playwright WebKit 无 MediaRecorder、AudioContext、OfflineAudioContext 或 mediaDevices；页面给出麦克风不可用原因和文字替代。 | [首屏](evidence/guide-immersive-webkit-390-zh-light.webp) · [检查项和产物 SHA](evidence/guide-immersive-webkit-390-zh-light.json) |
| WebKit，320 × 760，英文、深色、大字 | 麦克风不可用后仍可完成英文输入；模拟器报告支持 WAV，实际重放拒绝播放，页面显示本地化错误并保留完整回答、字幕与来源。 | [首屏](evidence/guide-immersive-webkit-320-en-dark.webp) · [检查项和产物 SHA](evidence/guide-immersive-webkit-320-en-dark.json) |

## 真实业务链路与受控输入

Chromium 测试只在 getUserMedia 硬件边界注入 312 Hz 的受控 MediaStream。项目实际使用 MediaRecorder 录制、Web Audio 分析、16 kHz PCM WAV 转码、multipart 上传及宿主音频播放。两次取消分别通过点按和长按后滑动完成，录音轨终止，各产生零次上传。再次点击结束录音后产生一次成功上传。文字提问单次发送，历史可查看全文与出处。回听时暂停保留当前段，随后继续并打断。注入 NotAllowedError 后麦克风不处于录制状态。切到首页再回导游，先前的录音未被上传或重启。

数字人播放与音源另有独立测试。Cubism WebGL + Web Audio 的带身份回调核对了两段音频与前一轮打断，中止后不能把旧回调写回当前状态。云 SDK 的真实商用音频与授权仍需联调。[校准录音、TTS 和模型回调](evidence/guide-audio-runtime.json)

## 轻声、正常音量与静音

![实际 H5 舞台录制，依次注入轻声幅度、较高幅度和静音](evidence/guide-immersive-orb-demo.webp)

短片取自正在收音的 Chromium 页面，仅截取完整 358 × 308 舞台。27 帧采集跨度 3.81 秒，按实际采集间隔编码为循环 WebP。脚本依次设置正弦峰值 0.035、0.14 和 0，对应理论 RMS 约 0.0247、0.099 和 0。动画的状态、测幅和渲染均由产品代码生成。这个文件是 QA 实录，不随客户端发布。

手机尺寸下分别比较静音、轻声、较高声和不可采样。统计实际球体裁切内至少一个 RGB 通道相差超过 8/255 的像素，在同一构建中核对轻声与较高声都出现实测环，撤掉分析器时环消失；仅依赖状态的轻缓活动仍可用，开启减少动态效果后停止。各次采样时间和浏览器合成帧可能漂移，以本次 JSON 为准。[62 px 状态图](evidence/guide-immersive-levels-chromium-320-en-dark.webp) · [76 px 状态图](evidence/guide-immersive-levels-chromium-390-zh-light.webp)

| 实际球尺寸 | 静音 → 轻声 | 轻声 → 较高声 | 无采样下间隔 720 ms | 减动下间隔 380 ms |
| --- | ---: | ---: | ---: | ---: |
| 62 × 62，3,844 个像素 | 1,192 | 1,849 | 847 | 0 |
| 76 × 76，5,776 个像素 | 1,745 | 2,836 | 1,106 | 0 |

独立工装另用九个连续合成帧测量变化区域，阈值和采样区与上述交叉状态截图不同。在 62px 球体中，输入 RMS 0.02、0.08、0.25 分别得到 27.13%、40.11%、49.35% 的变化区域；76px 球相应为 29.17%、43.86%、54.86%。静音均无实测环，减少动态或不可见时变化为零。上述数字是给定输入的渲染像素变化，不衡量外部声压、帧率或真机耗电。[独立工装实录](evidence/ai-orb-motion-perception.webp) · [采样定义及完整结果](evidence/ai-orb-motion-perception.json)

## 如何复测

先将要测的 H5 生产目录作为支持 history 回退的本机静态站启动，再运行本地 mock API。浏览器与 Pillow 只用于 QA。以下命令对两个本机服务执行，端口可按环境修改；如需存入仓库，先目检截图并核对 JSON 的构建哈希、接口状态及已知回退。

```powershell
python -X utf8 scripts/verify-immersive-guide.py --web http://127.0.0.1:7743 --api http://127.0.0.1:5264 --engine chromium --out "$env:TEMP/scenic-guide-h5"
python -X utf8 scripts/verify-immersive-guide.py --web http://127.0.0.1:7743 --api http://127.0.0.1:5264 --engine webkit --out "$env:TEMP/scenic-guide-h5"
```

代码在同一个浏览器上下文内用实际按钮和触摸事件行走流程。按压测试给页面发送开始、移动与结束触摸事件，未测物理指尖习惯或真实软键盘高度。两引擎的页面、模型服务、商业语音、物理麦克风和系统读屏的范围须各自记录。[运行脚本](../../../scripts/verify-immersive-guide.py) · [质量核对](ai-ambient-orb-checklist.md)
