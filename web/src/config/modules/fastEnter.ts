/**
 * 快速入口配置
 * 包含：应用列表、快速链接等配置
 */
import type { FastEnterConfig } from '@/types/config'
import { WEB_LINKS } from '@/utils/constants'

const fastEnterConfig: FastEnterConfig = {
  // 显示条件（屏幕宽度）
  minWidth: 1200,
  // 应用列表
  applications: [
    {
      name: '官方文档',
      nameI18nKey: 'app.officialDocsName',
      description: '使用指南与开发文档',
      descriptionI18nKey: 'app.officialDocsDescription',
      icon: 'ri:bill-line',
      iconColor: '#ffb100',
      enabled: true,
      order: 1,
      link: WEB_LINKS.DOCS
    },
    {
      name: '更新日志',
      nameI18nKey: 'app.changeLogName',
      description: '版本更新与变更记录',
      descriptionI18nKey: 'app.changeLogDescription',
      icon: 'ri:gamepad-line',
      iconColor: '#38C0FC',
      enabled: true,
      order: 2,
      routeName: 'ChangeLog'
    },
    {
      name: '测试数据',
      nameI18nKey: 'app.demoDataName',
      description: '随机生成全量演示数据',
      descriptionI18nKey: 'app.demoDataDescription',
      icon: 'ri:database-2-line',
      iconColor: '#a855f7',
      enabled: true,
      order: 3,
      action: 'generateDemoData'
    }
  ],
  // 快速链接
  quickLinks: [
    {
      name: '登录',
      nameI18nKey: 'app.loginLink',
      enabled: true,
      order: 1,
      routeName: 'Login'
    },
    {
      name: '注册',
      nameI18nKey: 'app.registerLink',
      enabled: true,
      order: 2,
      routeName: 'Register'
    },
    {
      name: '忘记密码',
      nameI18nKey: 'app.forgotPasswordLink',
      enabled: true,
      order: 3,
      routeName: 'ForgetPassword'
    },
    {
      name: '个人中心',
      nameI18nKey: 'app.userCenterLink',
      enabled: true,
      order: 4,
      routeName: 'UserCenter'
    }
  ]
}

export default Object.freeze(fastEnterConfig)
