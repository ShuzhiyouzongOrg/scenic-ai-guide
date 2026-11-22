# 导游五格导航的 H5 宿主验收

最终 H5 导游分片为 `pages-ai-guide-index.C70AWfnv.js`，SHA-256 为 `a58a1f86fea868535991c3f8a977970a6f46f45df7a16ce1ea836d9893119cda`。本次独立编译包含 App 键盘高度分支、微信标签栏度量及草稿/占位文字主题色。对照原冻结构建的 110 个输出文件，77 个路径与字节完全相同，HTML 和部分分片引用发生变化，因此重新运行浏览器验收。[最终构建与逐项记录](evidence/guide-navigation/h5-ime-rebuild.json)

| 最终复测 | 实际结果 |
| --- | --- |
| 正文与占位提示 | Chromium 151.0.7922.34、Windows WebKit 26.5 均在 390×844 简中浅色和 320×760 英文暗色大字输入同一景区问题并成功发送。读取浏览器实际输入元素的文字填充色、占位节点文字色与输入区域背景，浅色对比度为 12.97∶1 / 5.29∶1，暗色为 10.61∶1 / 6.56∶1。图中为测试草稿。[浅色](evidence/guide-navigation/draft-light.webp) · [暗色](evidence/guide-navigation/draft-dark.webp) |
| 四个普通目的地与中央动作 | 四组普通图标和标签矩形偏差均为 **0 CSS px**。390px 的冷往返采样分别为 Chromium 104 帧、WebKit 88 帧，均未采到双栏或空栏。两组 Chromium 均完成13项导游检查，各有一次完整录音上传和一次文字问答；WebKit 各完成9项，录音能力缺失时显示错误和文字替代。四组均无未捕获脚本错误。[本次运行的几何、状态与请求](evidence/guide-navigation/h5-ime-rebuild.json) |
| 同源与五页回归 | 两种引擎及两种宽度另经同源网关完成同一套导游检查。五页回归在两个引擎及两种尺寸共采集20个页面结果，均无未捕获脚本异常。中央语音专项同时验证了上滑取消、点击发送、播放中断以及按住期间自然播放结束。[同源、五页和语音用例结果](evidence/guide-navigation/h5-ime-rebuild.json) |

## 五格导航首次冻结

首次冻结使用 `pages-ai-guide-index.CNSlFJHF.js`，SHA-256 为 `9e1ba83949a6343510711748a61c84a24c11d2490596560abce0cbf7b40c16ee`。下列 48+47 帧、对照图与录屏保留该轮原始采集。更新后的输入框直接见上表。[改前与改后](evidence/guide-navigation/before-after.webp) · [系统栏对照](evidence/guide-navigation/alignment.webp) · [进出动画实录](evidence/guide-navigation/center-transition.webp)

## 页面、动作与样本

| 宿主与视口 | 轨道与内容 | 录音及问答 |
| --- | --- | --- |
| Chromium，390×844，简中浅色 | 轨道 y=790，高54。普通图标 y=796.5、宽24，文字 y=823.5。图标及文字与系统栏共线。人物舞台高360，中央56×56。 | 13 项检查。取消零上传，明确发送上传一次，文字问答一次。宿主播放器暂停、继续、停止及录音中离页释放音轨均通过。[首屏](evidence/guide-navigation/guide-light.webp) · [实际录制](evidence/guide-navigation/recording.webp) · [对话记录](evidence/guide-navigation/history.webp) |
| Chromium，320×760，英文暗色、大字、系统减动 | 轨道 y=706，五个中心为 32/96/160/224/288。普通图标 y=712.5，文字 y=739.5。舞台高334，麦克风仍为56。 | 13 项检查，通过真实录音和播放路径。初始减动直接显示最终形态，无中间透明度。系统强制减动时设置面板显示原因。[窄屏](evidence/guide-navigation/guide-dark.webp) · [逐项结果](evidence/guide-navigation/production.json) |
| WebKit，相同两种视口 | 390宽时普通图标 y=797、文字 y=824；320英文时分别 y=714、741。两种视口都使用各自宿主实际渲染的字体与行高。 | 每组9项。两次文字问答分别成功。Windows WebKit 缺少所需录音 API；两次均为零语音上传，播放失败保留字幕和可操作的文字替代。[生产页面测量](evidence/guide-navigation/production.json) |

- **四个目标双向通行。** 每组都从导游访问首页、地图、行程、我的，再点击各自系统第三项返回。地图入口另用 Enter 激活。从普通目的地返回时中央恢复可操作空闲态。面板可从页头记录/设置及字幕行打字打开，设置的 Escape 与焦点返回均经过键盘实测。普通四格复用同一主题下的源图；浅色或暗色非活动资源、10px 标签与字体族逐项核对。[生产日志](evidence/guide-navigation/production.json)
- **冷入口与临时布局。** 首次直接进入导游，再去本次首次访问的首页后返回。独立的 390px 采样中 Chromium 48 帧、WebKit 47 帧，均没有同一帧的双栏或空栏；导游可见正文底边始终在844，首页挂载后底边为790。冷首页挂载期间分别有7帧/3帧尚无可测正文元素，系统栏持续显示。中央在普通模式经过中间透明度；减动样本只见最终形态。采样无法证明两帧之间的绘制或物理设备帧率。循环图裁自 Chromium 的实际合成输出。[两个引擎逐帧坐标](evidence/guide-navigation/cold-frames.json) · [底栏实录](evidence/guide-navigation/center-transition.webp)
- **故障与语义。** 对平台隐藏栏回调注入错误后，页面保留系统五项和一个正文麦克风。恢复后再次进入导游可启用中央格。模拟 switchTab 失败，语音形态恢复且下一次切换成功。语音专项还分别按住触摸、鼠标和空格跨越自然结束，未启动新录音；暂停态 Enter 续播。按住后上滑取消、等待权限时松手、收到真实 start 后松手各走对应业务分支。[可复跑的中央按钮检查](../../../scripts/verify-voice-action.py) · [手势数据](evidence/guide-navigation/button-results.json) · [授权和跨态](evidence/guide-navigation/button-extra.json)
- **真实同源服务。** 390/320 两种视口、两个浏览器另在同源回环网关完成同一组操作，分别获得与生产页测量相同的语音上传/文字问答计数。未授权的云角色返回503时由静态立绘承接。两种网络方式共八组导游实测，均无未捕获页面脚本异常。[同源响应与动作](evidence/guide-navigation/same-origin.json)
- **五页整体验收。** 两个引擎各使用390×844、320×690走五个页面，共20份页面测量。均无横向溢出或失效的底栏图标。复测地图首屏、首页两景区推荐与详情、行程生成和保存、设置大字与语言及加载失败恢复。控制台记录中包含受控的路线503及未配置的云角色503，未捕获脚本异常为零。[Chromium](evidence/guide-navigation/five-chromium.json) · [WebKit](evidence/guide-navigation/five-webkit.json)

## 对照基线

2026-11-22，在 Windows 上用 Playwright 加载 HBuilderX 5.24 的 H5 生产构建。改造前从五个真实根页量取系统栏。390×844 的系统栏上边在 y=790，高 54 CSS px，五个目的地的横向中心依次是 39、117、195、273、351。导游页原有另一排打字、讲话与历史操作，中心在 x=69、195、321。以下复测以普通根页的有色轨道、图标与文字为基准，另行测量导游页向上扩出的麦克风命中范围。[此前页面与音频验证](ai-guide-immersive-web-verification.md) · [项目导航规范](../components/navigation.md)

改造前两种宿主的五页几何原始值分别保存在 [Chromium 基线](evidence/guide-navigation/baseline-chromium.json)与 [WebKit 基线](evidence/guide-navigation/baseline-webkit.json)。导游自绘栏另有8px透明区域容纳凸出的中央控件。对照图中普通四项的落点按有色轨道对齐。

## 复跑

1. 以 HBuilderX 5.24 编译当前 visitor-app 的 H5 生产版本。用支持 history 回退的本机静态服务托管产物。启动已有隔离后端，使健康接口的 ASR、TTS、LLM 均为 mock。本次所有写入和测试音频留在回环地址。
2. 安装开发用 Python Playwright、Pillow 和 Chromium/WebKit 浏览器。对两种引擎分别运行下列命令。第一条保留编译产物字节，由浏览器测试拦截器将生产 API 域名定向至本机。五页测试覆盖真实导航、键盘激活、保存行程、个人大字、景区切换、目的地详情及失败后重试。

```powershell
python scripts/verify-immersive-guide.py --web http://127.0.0.1:7763 --api http://127.0.0.1:5264 --engine chromium --out $env:TEMP/guide-nav-chromium
python scripts/verify-visitor-web.py --web http://127.0.0.1:7763 --api http://127.0.0.1:5264 --engine webkit --output $env:TEMP/five-pages-webkit
python scripts/verify-voice-action.py --web http://127.0.0.1:7763 --api http://127.0.0.1:5264
```

3. 若需真实浏览器同源请求，在独立终端运行开发用网关。网关从回环后端反代 API 和舞台资源，仅在内存中将打包的 API 域名改到自身地址。随后对两种引擎将测试的 `--web` 与 `--api` 都设为网关；浏览器继续阻挡外部站点并记录本机响应。项目发布文件、API 源码和线上数据不参与替换。[网关](../../../scripts/serve-guide-h5-qa.py) · [页面与逐帧测量](../../../scripts/verify-immersive-guide.py)

```powershell
python scripts/serve-guide-h5-qa.py --web http://127.0.0.1:7763 --api http://127.0.0.1:5264 --port 7764
python scripts/verify-immersive-guide.py --web http://127.0.0.1:7764 --api http://127.0.0.1:7764 --engine webkit --out $env:TEMP/guide-nav-origin-webkit
```

为验证错误分支，测试单独建立新浏览器上下文，在打包的 DCloud 公共 API 调用处对 hideTabBar、switchTab 各注入一次失败；之后恢复正常调用。其余布局与语音数据取自完整生产页面。合成测试音只替代麦克风硬件输入，MediaRecorder、实际分析器、WAV、上传、暂停与离页清理都走现有实现。Windows WebKit 的录音 API 缺失，保留它实际触发的文字降级；系统软键盘和刘海安全区、iPhone 与商业供应商会话需各自宿主观察。
