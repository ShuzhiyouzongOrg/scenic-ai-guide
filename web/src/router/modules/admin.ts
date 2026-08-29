/**
 * @fileoverview 管理端路由配置。
 * @description 声明知识库、数字人、运营分析、系统管理和运营闭环页面路由树。
 */
import { AppRouteRecord } from '@/types/router'

/**
 * @description 知识库管理模块路由树。
 * @type {AppRouteRecord}
 */
export const knowledgeRoutes: AppRouteRecord = {
  name: 'Knowledge',
  path: '/admin/knowledge',
  component: '/index/index',
  meta: {
    title: 'app.navKnowledge',
    icon: 'ri:book-open-line',
    roles: ['R_SUPER', 'R_OPERATOR']
  },
  children: [
    {
      path: 'documents',
      name: 'KnowledgeDocuments',
      component: '/admin/knowledge/documents',
      meta: { title: 'app.navDocuments', icon: 'ri:file-text-line', keepAlive: true }
    },
    {
      path: 'spots',
      name: 'KnowledgeSpots',
      component: '/admin/knowledge/spots',
      meta: { title: 'app.navSpots', icon: 'ri:map-pin-line', keepAlive: true }
    },
    {
      path: 'faq',
      name: 'KnowledgeFaq',
      component: '/admin/knowledge/faq',
      meta: { title: 'app.navFaq', icon: 'ri:question-answer-line', keepAlive: true }
    },
    {
      path: 'search-test',
      name: 'KnowledgeSearchTest',
      component: '/admin/knowledge/search-test',
      meta: { title: 'app.navSearchTest', icon: 'ri:search-eye-line', keepAlive: false }
    }
  ]
}

/**
 * @description 数字人配置模块路由树。
 * @type {AppRouteRecord}
 */
export const digitalHumanRoutes: AppRouteRecord = {
  name: 'DigitalHumanAdmin',
  path: '/admin/digital-human',
  component: '/index/index',
  meta: { title: 'app.navDigitalHuman', icon: 'ri:robot-2-line', roles: ['R_SUPER'] },
  children: [
    {
      path: 'config',
      name: 'DigitalHumanConfig',
      component: '/admin/digital-human/config',
      meta: { title: 'app.navAppearanceVoice', icon: 'ri:voiceprint-line', keepAlive: true }
    }
  ]
}

/**
 * @description 运营分析模块路由树。
 * @type {AppRouteRecord}
 */
export const analyticsRoutes: AppRouteRecord = {
  name: 'Analytics',
  path: '/admin/analytics',
  component: '/index/index',
  meta: { title: 'app.navAnalytics', icon: 'ri:bar-chart-box-line', roles: ['R_SUPER'] },
  children: [
    {
      path: 'dashboard',
      name: 'AnalyticsDashboard',
      component: '/admin/analytics/dashboard',
      meta: { title: 'app.navDashboard', icon: 'ri:dashboard-line', keepAlive: false }
    }
  ]
}

/**
 * @description 系统用户与角色管理模块路由树。
 * @type {AppRouteRecord}
 */
export const systemRoutes: AppRouteRecord = {
  name: 'System',
  path: '/system',
  component: '/index/index',
  meta: { title: 'app.navSystem', icon: 'ri:settings-3-line', roles: ['R_SUPER'] },
  children: [
    {
      path: 'user',
      name: 'SystemUser',
      component: '/system/user',
      meta: {
        title: 'menus.system.user',
        icon: 'ri:user-line',
        keepAlive: true,
        roles: ['R_SUPER']
      }
    },
    {
      path: 'role',
      name: 'SystemRole',
      component: '/system/role',
      meta: {
        title: 'menus.system.role',
        icon: 'ri:user-settings-line',
        keepAlive: true,
        roles: ['R_SUPER']
      }
    },
    {
      path: 'user-center',
      name: 'UserCenter',
      component: '/system/user-center',
      meta: {
        title: 'menus.system.userCenter',
        icon: 'ri:user-line',
        isHide: true,
        isHideTab: true,
        keepAlive: true
      }
    }
  ]
}

/**
 * @description 会话反馈与服务质量模块路由树。
 * @type {AppRouteRecord}
 */
export const operationRoutes: AppRouteRecord = {
  name: 'Operation',
  path: '/admin/operation',
  component: '/index/index',
  meta: {
    title: 'app.navOperation',
    icon: 'ri:chat-check-line',
    roles: ['R_SUPER', 'R_OPERATOR']
  },
  children: [
    {
      path: 'conversations',
      name: 'OperationConversations',
      component: '/admin/operation/conversations',
      meta: { title: 'app.navConversations', icon: 'ri:chat-history-line', keepAlive: true }
    },
    {
      path: 'feedback',
      name: 'OperationFeedback',
      component: '/admin/operation/feedback',
      meta: { title: 'app.navFeedback', icon: 'ri:feedback-line', keepAlive: true }
    },
    {
      path: 'service-quality',
      name: 'OperationServiceQuality',
      component: '/admin/operation/service-quality',
      meta: { title: 'app.navServiceQuality', icon: 'ri:file-chart-line', keepAlive: false }
    }
  ]
}
