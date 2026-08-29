/**
 * @fileoverview 菜单状态管理模块。
 * @description 维护菜单列表、首页路径、加载状态和动态路由注销函数。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { AppRouteRecord } from '@/types/router'
import { getFirstMenuPath } from '@/utils'
import { HOME_PAGE_PATH } from '@/router'

/**
 * @description 菜单状态 Store 定义。
 * @type {import('pinia').StoreDefinition}
 */
export const useMenuStore = defineStore('menuStore', () => {
  /**
   * @description 首页路径。
   */
  const homePath = ref(HOME_PAGE_PATH)
  /**
   * @description 菜单列表。
   */
  const menuList = ref<AppRouteRecord[]>([])
  /**
   * @description 菜单宽度。
   */
  const menuWidth = ref('')
  /**
   * @description 存储路由移除函数的数组。
   */
  const removeRouteFns = ref<(() => void)[]>([])

  /**
   * @description 设置菜单列表。
   * @param {AppRouteRecord[]} list 菜单路由记录数组。
   */
  const setMenuList = (list: AppRouteRecord[]) => {
    menuList.value = list
    setHomePath(HOME_PAGE_PATH || getFirstMenuPath(list))
  }

  /**
   * @description 获取首页路径。
   * @returns {string} 首页路径字符串。
   */
  const getHomePath = () => homePath.value

  /**
   * @description 设置主页路径。
   * @param {string} path 主页路径。
   */
  const setHomePath = (path: string) => {
    homePath.value = path
  }

  /**
   * @description 添加路由移除函数。
   * @param {Array<() => void>} fns 要添加的路由移除函数数组。
   */
  const addRemoveRouteFns = (fns: (() => void)[]) => {
    removeRouteFns.value.push(...fns)
  }

  /**
   * @description 移除所有动态路由。
   * 执行所有存储的路由移除函数并清空数组
   */
  const removeAllDynamicRoutes = () => {
    removeRouteFns.value.forEach((fn) => fn())
    removeRouteFns.value = []
  }

  /**
   * @description 清空路由移除函数数组。
   */
  const clearRemoveRouteFns = () => {
    removeRouteFns.value = []
  }

  return {
    menuList,
    menuWidth,
    removeRouteFns,
    setMenuList,
    getHomePath,
    setHomePath,
    addRemoveRouteFns,
    removeAllDynamicRoutes,
    clearRemoveRouteFns
  }
})
