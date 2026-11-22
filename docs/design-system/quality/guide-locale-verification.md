# 地图与 AI 导游多语言实测

2026-11-22，在从当前游客端源码运行的 H5 页面使用 Chrome 和 Playwright，经个人中心连续切换 English、繁體中文、简体中文。请求发往隔离的本地 API 和内存数据库。问答采用本地测试服务的应答，录音使用浏览器模拟麦克风，测试覆盖采集、转码、真实 HTTP 上传与界面呈现。

## 三种语言和两条网络路径

| 个人中心选择 | 地图搜索类别 | `POST /api/chat/ask` JSON locale | `POST /api/voice/ask-upload` multipart locale | 响应 |
| --- | --- | --- | --- | --- |
| English | Attraction | en | en | 200、200 |
| 繁體中文 | 景點 | zh-TW | zh-TW | 200、200 |
| 简体中文 | 景点 | zh-CN | zh-CN | 200、200 |

1. 在 390 × 844 视口依次打开筛选，输入不存在的词，检查本地化无结果提示，再按各语言的景点类别搜索并确认发现结果。
2. 用景区原名“九龙”选中“九龙灌浴”，从卡片打开导游。每种语言下检查自动送入的提问、答案、引用、播报和暂停操作标签。隔离 API 实际返回了相应语言的答案。切换语言后，先前的英文和中文会话继续显示其原始提问、回复及引用。
3. 在这三种语言分别使用 Record／錄音／录音，检查收音状态、取消和发送音频操作，录制后发送。检查浏览器发送的 JSON、解析实际上传的 multipart 表单，并读取六次 HTTP 响应状态。切换语言没有清空聊天记录。测试流程未出现页面异常。[繁体录音实拍](evidence/guide-voice-hant-recording.webp)
4. 在 320 × 750 视口注入浏览器明确拒绝录音的返回值。英文页显示允许麦克风的恢复提示，切换到繁体中文并回到 AI，已有错误随页面更新。该次拒绝没有上传录音。[英文麦克风拒绝实拍](evidence/guide-mic-en-denied.webp)

## 首页设施进入地图

在 320 × 750 英文页面，从 首页 → Visitor services → 游客中心 → View on map 进入灵山地图。详情参数为 `id=lingshan-806&area=lingshan`。手绘地图有 48 个标记，其中一个选中标记的无障碍名称与设施名一致。底卡显示“游客中心”、类别“Visitor services”及三个可用操作。选中标记的命中区域为 44 × 44 CSS px，顶部约为 257 px，底卡从约 449 px 开始。取消选点后标记总数恢复 47，已选状态清除。三项卡片操作都在 320 px 视口内。[英文设施选点实拍](evidence/guide-map-en-facility.webp)

随后从首页切换到 Nianhua Bay，打开“拈花手作体验馆”再进入地图。选中的 `nianhuawan-176` 分类为“Other facilities”，顶部约为 248 px。标记在顶部浮层与底卡之间，取消选取后点位数从 32 恢复 31。

## 能力与资料边界

- 前端在提交文本或录音提问时确定本次回答的语言。服务端按语言优先检索，在内容不足时允许回退到其他语言的景区资料。当前客户端记录历史原文，并保留内容方提供的名称、引用标题和手绘底图。地图、数字人信息卡的操作文案以及已知类别来自离线词表。新增类别需要补入三种语言。[前端语言表](../../../visitor-app/design/guide-locale.uts) · [问答请求](../../../visitor-app/services/guide-api.uts) · [服务端检索](../../../server/src/services/chat.mjs)
- 选用 English 时，英文听写首帧使用 en_us；简体、繁体和旧客户端均以 zh_cn 听写普通话。繁体回答使用 zh-TW。录音提示随个人中心设置切换，Chromium 在两种界面均实际显示对应语言的录音提示，无页面异常。[英文提示实拍](evidence/guide-asr-en.webp) · [语音实现](../../../server/src/services/voice.mjs)
- 微信原生 Live2D 的加载和错误字符串由父页依据当前语言传入。该记录只覆盖 H5 的运行结果，微信客户端、iOS 设备、鸿蒙和语音供应商的联调验收见发布清单。[微信原生组件](../../../visitor-app/wxcomponents/scenic-live2d/index.wxml) · [发布清单](release-checklist.md)

## 项目自有 WebView 舞台

2026-11-22，使用独立的本机 Node 服务、内存数据库和 Chrome 加载服务实际提供的 `/digital-human/` 与 `/live2d/`。原生端宿主在项目舞台的 URL 里传递语言、当前主题及减少动态偏好。浏览器舞台随系统配色，宿主也可指定主题。短期凭据和业务参数沿用原始 URL，舞台界面使用精确开放的同源脚本和由移动端 Token 生成的 CSS。[宿主参数](../../../visitor-app/design/stage-presentation.uts) · [舞台词表](../../../server/src/web/digital-human/stage-ui.js)

| 操作 | 实际观测 |
| --- | --- |
| 三种语言直接打开无会话的云舞台 | HTML lang 分别为 en、zh-TW、zh-CN。英文和繁体的无会话提示、按钮、表单和标题均显示对应语言。另用无效测试凭据触发真实 HTTP 401，繁体页面提示返回应用重新开启。深色面板测得 rgb(27, 40, 34)。[英文深色错误页](evidence/guide-cloud-stage-en-dark.webp) |
| 模拟不具备 Cubism Core 的宿主 | 浏览器仅屏蔽该外部库的载入，保留真实页面、浏览器运行时构建产物和样式。三种语言均渲染正确的能力错误、音频解锁按钮文案和 HTML lang。指定浅色时错误色为 rgb(163, 45, 52)，减少动态时加载环的 animation-name 为 none |
| 云舞台独立提问 | 用可控的 bootstrap 与播放器就绪事件代替商业 SDK 会话，实际调用本地问答 API。三种语言各产生一次问答，请求 locale 依次为 en、zh-TW、zh-CN。三次均收到回答，浏览器地址在 bootstrap 成功后移除了短期凭据 |
| 从游客 App 设置切换语言、减少动态 | 英文 AI 页选择 Local，实际 iframe 导航带 `model=Haru&embed=1&locale=en`。发送问题后前往个人中心改为繁体，回到 AI 后舞台带 `locale=zh-Hant`。前一次回答保持原文，全流程只有原始一次问答 POST。系统切入减少动态后，静态提示可见，内嵌 WebView 数为 0；点按“語音朗讀”之后仍是 0，无额外问答 POST |

减少动态时内嵌云端和 Live2D 渲染器释放，后续阅读使用宿主音频。若在渲染器实际播报期间打开该偏好，当前播报结束，可在消息处重新朗读。独立全屏云舞台保留用户主动开启的互动视频；加载和状态转场遵守减少动态。验证用的商业 SDK 就绪替身没有生成真实云视频，真实授权和口型仍由供应商联调验收。

## 讯飞 IAT 请求首帧与音色

**GUI-AI-04** 在宿主 HTTP 入口和供应商传输边界分开验收。Node 22.22.2 在回环地址实际启动同仓服务器和内存 SQLite，以原始 JSON 或 multipart 发起七个请求。测试在服务签名之后以本地 EventTarget 替身截获 WebSocket 的 send，未连接讯飞。输入为合成的 16 kHz 单声道 16 位 PCM，上传用完整 WAV。每次逐字节核对两个数据帧和结束帧，首帧有业务参数，后续帧均无业务参数。[可复跑测试](../../../server/scripts/test-voice-locale.mjs)

| 真实 HTTP 路由 | locale 样本 | 已捕获的 business.language |
| --- | --- | --- |
| POST /api/voice/asr，JSON PCM | en-US、缺省 | en_us、zh_cn |
| POST /api/voice/ask，JSON PCM | en | en_us |
| POST /api/voice/ask-upload，multipart WAV | en、zh-TW、zh-CN、缺省 | en_us、zh_cn、zh_cn、zh_cn |

七次均返回 HTTP 200；语音问答的回答语言和十分钟缓存按各自原始 locale 隔离。无 locale 的旧上传沿用 zh-CN。所有首帧保持 domain=iat、accent=mandarin 和原来的 eos/ptt。官方枚举规定 accent 必传，mandarin 同时用于普通话与其他语种；英语由 language=en_us 选择。音频封装、分片、缓存键与过期策略沿用项目原实现。[讯飞 IAT WebAPI](https://static.xfyun.cn/doc/asr/voicedictation/API.html)

语音问答的五个测试请求还截获真实 TTS 适配层产生的合成帧；英文、简体、繁体与缺省请求的每段 vcn 都是测试配置中同一个导游音色，tte 为 UTF8，解码后的合成文本逐字节对应该段回答。TTS 回包使用固定占位字节，未用于试听。讯飞 TTS 继续使用已配置的讲解音色/回退音色。官方要求在账号中开通相应发音人。项目未切换到未经授权的英文音色。真实账号上的英文听写权限、识别准确率、中文或英文实际发音与音画同步仍须商用账号验收。用 Node 22 在 server 目录运行 `npm run test:voice`，可重跑现有语音测试和上述七个请求；测试脚本内的供应商凭据均为测试常量。[讯飞在线合成 API](https://www.xfyun.cn/doc/tts/online_tts/API.html)

英文建议问题和大字模式采用单列。在 320 px 视口测量四个按钮，标准与大字模式下文字均在按钮内，最窄左右留白各约 13 px。大字模式点选“The Grand Buddha’s story”，实际问答请求仍提交完整原问题“Tell me about the Grand Buddha”，并获得可朗读的英文回答。
