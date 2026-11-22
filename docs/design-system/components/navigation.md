# 五个根页面的导航

游客从首页、地图、行程或我的进入 AI 导游时，先点击系统导航的第三项。进入后，第三格给已经在导游页的人一个可直接讲话的位置。其余四个目的地保留原图、文字、顺序和点击位置。Apple 推荐将页面操作放在独立工具栏；本项目仅在已经选中的导游目的地使用这个产品例外。[Apple Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) · [Apple Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)

| 规则 | 实现约定 | 验收 |
| --- | --- | --- |
| GUIDE-NAV-01 | 五个目标由 pages.json 注册。首页、地图、行程、我的使用系统栏。导游页成功隐藏系统栏后挂载五格等宽的替代栏；请求失败时保留系统目的地，在正文显示单个语音操作。进入其他根页恢复系统栏。 | 从四个系统目的地分别进入导游，再从导游返回。每次稳定后仅有一个可交互导航和一个当前麦克风。更新或切换根页均沿用 switchTab。[DCloud tabBar](https://doc.dcloud.net.cn/uni-app-x/api/set-tab-bar.html) · [DCloud 路由](https://doc.dcloud.net.cn/uni-app-x/api/navigator.html) |
| GUIDE-NAV-02 | 普通四个目的地复用静态导航资源和 tabLabels。五格在窗口宽的 10%、30%、50%、70%、90% 处居中。轨道高取 tabBar Token，底部安全区单独追加。中央上方留出的触控区域不挤低其他图标。 | 逐端测量普通项图标、文案及有色底栏的位置。H5 同视口中心和轨道始点差不超过 1px，图标、文字上边差不超过 2px，暗色及英文同样复测。换端使用该端系统栏作基线。[工程 Token](../../../visitor-app/design/tokens.json) · [DCloud tabBar](https://doc.dcloud.net.cn/uni-app-x/api/set-tab-bar.html) |
| GUIDE-NAV-03 | 中心的语音控件有随状态变化的可读名称。普通目的地仍可用键盘激活。历史放入页头，打字放入字幕标题行，录音或播报时在字幕附近出现取消、停止或暂停/继续。语音控制器拥有录音、音源和请求的生命周期。 | 操作键盘、短点、长按、上滑取消和录音中切走，检查上传次数、已释放音轨、焦点返回及当前字幕。检查中心格内只出现一个可读按钮。[导游交互](../interaction/ai-guide-interaction.md) · [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) |
| GUIDE-NAV-04 | 进入时在中心格内交叉淡化原 AI 图标与语音控件；离开时反向过渡后切换目标。冻结连续导航请求，切换失败时恢复当前中心操作。减少动态时立即切换，普通四格保持静止。 | 标准和减少动态分别完成地图、行程往返；快速重复点和面板打开时检查录音防重、背景焦点及错误恢复。[Apple Motion](https://developer.apple.com/design/human-interface-guidelines/motion) · [导游底栏实现](../../../visitor-app/components/guide-bottom-navigation/guide-bottom-navigation.uvue) |

页面维护入口见[导游组件](ai-guide-components.md)、[平台间距及导航恢复](../../../visitor-app/design/layout.uts)和[QA 脚本](../../../scripts/verify-immersive-guide.py)。

当前系统几何基线为 H5 / App 54px 轨道、24px 图标，微信 50px 轨道、27px 图标。微信普通项的内容上内边距为 8px。中央按钮的 56px 触区独立于这些图标尺寸。修改数值前，取同一模拟器倍率、同一主题下两个页面的截图，比较同一非活动目的地的图标和文字。[微信实拍测量](../quality/evidence/guide-navigation/wechat-alignment.json) · [H5 逐项测量](../quality/guide-navigation-web-verification.md)
