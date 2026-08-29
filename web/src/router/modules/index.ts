/**
 * @fileoverview 动态路由模块聚合入口。
 * @description 汇总游客导览、管理运营、系统管理和帮助路由。
 */
import { AppRouteRecord } from '@/types/router'
import { guideRoutes } from './guide'
import {
  knowledgeRoutes,
  digitalHumanRoutes,
  analyticsRoutes,
  operationRoutes,
  systemRoutes
} from './admin'
import { helpRoutes } from './help'

/**
 * @description 参与动态注册的业务路由列表。
 * @type {AppRouteRecord[]}
 */
export const routeModules: AppRouteRecord[] = [
  guideRoutes,
  knowledgeRoutes,
  digitalHumanRoutes,
  analyticsRoutes,
  operationRoutes,
  systemRoutes,
  ...helpRoutes
]
