import { AppRouteRecord } from '@/types/router'
import { WEB_LINKS } from '@/utils/constants'

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
