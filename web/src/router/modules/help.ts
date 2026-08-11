import { AppRouteRecord } from '@/types/router'

export const helpRoutes: AppRouteRecord[] = [
  {
    path: '/help/docs',
    name: 'OfficialDocs',
    component: '/help/docs',
    meta: {
      title: 'menus.help.document',
      icon: 'ri:book-2-line',
      keepAlive: true
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
