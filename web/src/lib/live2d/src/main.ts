// @ts-nocheck -- 移植自 awesome-digital-human-live2d 的第三方 Live2D(Cubism SDK)代码，不纳入本项目严格类型检查
/*
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * @fileoverview 浏览器端 Live2D 应用入口。
 * @description 初始化浏览器端 Live2D 应用，并在页面卸载前释放 Cubism 运行时实例。
 */

import { LAppDelegate } from './lappdelegate';
import * as LAppDefine from './lappdefine';

/**
 * @description 页面加载完成后初始化 WebGL，并启动 Live2D 应用主循环。
 */
window.addEventListener(
  'load',
  (): void => {
    // Initialize WebGL and create the application instance
    if (!LAppDelegate.getInstance().initialize()) {
      return;
    }

    LAppDelegate.getInstance().run();
  },
  { passive: true }
);

/**
 * @description 页面关闭前释放 Live2D 应用单例及其关联资源。
 */
window.addEventListener(
  'beforeunload',
  (): void => LAppDelegate.releaseInstance(),
  { passive: true }
);
