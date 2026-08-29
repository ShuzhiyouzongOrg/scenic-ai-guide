/**
 * @fileoverview 帮助与更新日志路由配置。
 * @description 声明官方文档外链和项目更新日志页面路由。
 */
import { AppRouteRecord } from '@/types/router'
import { WEB_LINKS } from '@/utils/constants'

/**
 * @description 官方文档与更新日志路由列表。
 * @type {AppRouteRecord[]}
 */
export const helpRoutes: AppRouteRecord[] = [
  {
    path: '/help/docs',
    name: 'OfficialDocs',
    component: '/help/docs',
    beforeEnter: () => {
      window.location.assign(WEB_LINKS.DOCS)
      return false
    },
    meta: {
      title: 'menus.help.document',
      icon: 'ri:book-2-line',
      keepAlive: true,
      link: WEB_LINKS.DOCS
    }
  },
  {
    path: '/change/log',
    name: 'ChangeLog',
    component: '/change/log',
    meta: {
      title: 'menus.plan.log',
      icon: 'ri:history-line',
      keepAlive: true
    }
  }
]
