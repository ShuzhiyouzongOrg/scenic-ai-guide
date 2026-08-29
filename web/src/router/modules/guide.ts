/**
 * @fileoverview 游客导览路由配置。
 * @description 声明 AI 数字人导览和景区地图导览页面路由。
 */
import { AppRouteRecord } from '@/types/router'

/**
 * @description 游客 AI 导览与地图导览路由树。
 * @type {AppRouteRecord}
 */
export const guideRoutes: AppRouteRecord = {
  name: 'Guide',
  path: '/guide',
  component: '/index/index',
  meta: {
    title: 'app.navGuide',
    icon: 'ri:guide-line'
  },
  children: [
    {
      path: 'experience',
      name: 'GuideExperience',
      component: '/guide/experience',
      meta: {
        title: 'app.navGuideExperience',
        icon: 'ri:robot-2-line',
        keepAlive: false,
        fixedTab: true
      }
    },
    {
      path: 'map',
      name: 'GuideMap',
      component: '/guide/map/index',
      meta: {
        title: 'app.navGuideMap',
        icon: 'ri:road-map-line',
        keepAlive: false
      }
    }
  ]
}
