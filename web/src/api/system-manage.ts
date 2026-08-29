/**
 * @fileoverview 系统菜单 API 客户端。
 * @description 封装当前用户可访问菜单列表的查询请求。
 */
import request from '@/utils/http'
import { AppRouteRecord } from '@/types/router'

/**
 * @description 获取当前用户可访问的菜单路由。
 * @returns {Promise<AppRouteRecord[]>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await fetchGetMenuList()
 */
export function fetchGetMenuList() {
  return request.get<AppRouteRecord[]>({
    url: '/api/menu/list'
  })
}
