# Home、Trip、Profile 交互复测

2026-11-22（上海时间），Windows 上的 HBuilderX Web 开发构建，Playwright Chromium，H5 原生 Tab 入口。390×844 浅色、触屏事件和 320×700 深色失败场景各使用独立浏览器环境。测试代理将移动端 API 转向本机 5178 演示服务，按用例注入 503；使用隔离的游客 session，保存写入演示库。照片和插画由本地构建提供。

| 场景 | 操作与观察 | 结果 |
| --- | --- | --- |
| HOME-01/03/04 | 首次进入读到灵山七佛通偈；切拈花湾出现林溪禅径，点开详情，URL 带 area=nianhuawan，正文显示同一站点。返回再切灵山后出现灵山景点。 | 通过 |
| HOME-03 网络 | 拦截景点返回 503，显示加载失败；恢复后页面内“重新加载”进入真实列表。 | 通过 |
| TRIP-01/02 | 灵山按默认半日及历史文化生成 9 站。点第二站把手，选择“下移一站”。等待系统操作菜单关闭后，用 Chrome DevTools Protocol 向同一把手注入 touchStart、连续 touchMove 与 touchEnd，把该站拖回第二位。再次点按下移。 | 两种方式均改变真实数组。见[拖动中截图](evidence/trip-timeline-drag.png)。 |
| TRIP-03 | 保存后按钮显示已保存，本机 GET /api/routes/saved 返回一条。routeId 为 classic_150，前三个 nodeIds 顺序为 gate_south、wuming_bridge、zhaobi。随后切拈花湾生成并保存，返回第二条 nianhuawan-official-81。打开灵山已保存行程，进入地图。 | 通过。两条保存对应不同景区。 |
| TRIP-04 网络 | 首次读取存档返回 503；恢复重试，出现真正空状态。生成失败再试仍保留条件。第一次保存返回 503 后显示错误，恢复服务再保存成功。 | 通过 |
| PROFILE-03 | 点击减少动态；简体切 English，进入 Saved trips，看到英文行程操作。再切繁体，看到「導覽偏好」，切 English 打开 Privacy and permissions。 | 通过。服务端地名和既有推荐解释保留服务提供的语言。 |
| 运行时 | 上述通过的两组脚本均采集浏览器 pageerror。 | 未捕获页面异常为 0。故障注入的 503 作为预期网络错误单独处理。 |

对应实现覆盖五处页面入口（Home、Trip、Profile 及联动详情/收藏）、spot-card、sg-editorial-card、sg-service-row、共享 session 与导航存储、design/scenic-media.uts 和本地摄影资产。基础样式与组件契约见[设计系统](../README.md)。此表验证浏览器输入、存储及服务协议。原生手势、读屏、键盘、上传权限和发布产物以[发布核对表](release-checklist.md)中的各端实测为准。
