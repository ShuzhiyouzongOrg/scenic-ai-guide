/**
 * @fileoverview 路由前置守卫模块。
 * @description 编排登录校验、菜单加载、动态路由注册、权限判断、页面标题和异常跳转。
 */
import type { Router, RouteLocationNormalized, NavigationGuardNext } from 'vue-router'
import { nextTick } from 'vue'
import NProgress from 'nprogress'
import { useSettingStore } from '@/store/modules/setting'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setWorktab } from '@/utils/navigation'
import { setPageTitle } from '@/utils/router'
import { RoutesAlias } from '../routesAlias'
import { staticRoutes } from '../routes/staticRoutes'
import { loadingService } from '@/utils/ui'
import { useCommon } from '@/hooks/core/useCommon'
import { useWorktabStore } from '@/store/modules/worktab'
import { fetchGetUserInfo } from '@/api/auth'
import { ApiStatus } from '@/utils/http/status'
import { isHttpError } from '@/utils/http/error'
import { RouteRegistry, MenuProcessor, IframeRouteManager, RoutePermissionValidator } from '../core'

// 路由注册器实例
let routeRegistry: RouteRegistry | null = null

// 菜单处理器实例
const menuProcessor = new MenuProcessor()

// 跟踪是否需要关闭 loading
let pendingLoading = false

// 路由初始化失败标记，防止死循环
// 一旦设置为 true，只有刷新页面或重新登录才能重置
let routeInitFailed = false

// 路由初始化进行中标记，防止并发请求
let routeInitInProgress = false

/**
 * @description 读取当前导航是否仍有待关闭的加载状态。
 * @returns {boolean} 当前导航仍在等待关闭全局加载遮罩时返回 `true`。
 * @example
 * const result = getPendingLoading()
 */
export function getPendingLoading(): boolean {
  return pendingLoading
}

/**
 * @description 清除待关闭的加载状态。
 * @returns {void} 加载状态重置完成后不返回值。
 * @example
 * resetPendingLoading()
 */
export function resetPendingLoading(): void {
  pendingLoading = false
}

/**
 * @description 读取动态路由初始化是否失败。
 * @returns {boolean} 当前会话中的动态路由初始化曾失败时返回 `true`。
 * @example
 * const result = getRouteInitFailed()
 */
export function getRouteInitFailed(): boolean {
  return routeInitFailed
}

/**
 * @description 重置动态路由初始化失败与进行中状态。
 * @returns {void} 两个初始化状态复位完成后不返回值。
 * @example
 * resetRouteInitState()
 */
export function resetRouteInitState(): void {
  routeInitFailed = false
  routeInitInProgress = false
}

/**
 * @description 安装登录、动态路由和权限检查前置守卫。
 * @param {Router} router 需要注册全局前置守卫的 Vue Router 实例。
 * @returns {void} 前置守卫注册完成后不返回值。
 */
export function setupBeforeEachGuard(router: Router): void {
  // 初始化路由注册器
  routeRegistry = new RouteRegistry(router)

  router.beforeEach(
    async (
      to: RouteLocationNormalized,
      from: RouteLocationNormalized,
      next: NavigationGuardNext
    ) => {
      try {
        await handleRouteGuard(to, from, next, router)
      } catch (error) {
        console.error('[RouteGuard] 路由守卫处理失败:', error)
        closeLoading()
        next({ name: 'Exception500' })
      }
    }
  )
}

/**
 * @description 在 Vue 下一次 DOM 更新后关闭当前待处理的全局加载遮罩。
 * @returns {void} 加载遮罩关闭任务注册完成后不返回值。
 */
function closeLoading(): void {
  if (pendingLoading) {
    nextTick(() => {
      loadingService.hideLoading()
      pendingLoading = false
    })
  }
}

/**
 * @description 按登录状态、动态路由初始化、根路径重定向和路由匹配顺序处理导航。
 * @param {RouteLocationNormalized} to 即将进入的目标路由。
 * @param {RouteLocationNormalized} from 当前离开的来源路由。
 * @param {NavigationGuardNext} next 用于放行、重定向或取消导航的回调。
 * @param {Router} router 当前 Vue Router 实例。
 * @returns {Promise<void>} 路由守卫流程完成后不返回数据。
 */
async function handleRouteGuard(
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
  next: NavigationGuardNext,
  router: Router
): Promise<void> {
  const settingStore = useSettingStore()
  const userStore = useUserStore()

  // 启动进度条
  if (settingStore.showNprogress) {
    NProgress.start()
  }

  // 1. 检查登录状态
  if (!handleLoginStatus(to, userStore, next)) {
    return
  }

  // 2. 检查路由初始化是否已失败（防止死循环）
  if (routeInitFailed) {
    // 已经失败过，直接放行到错误页面，不再重试
    if (to.matched.length > 0) {
      next()
    } else {
      // 未匹配到路由，跳转到 500 页面
      next({ name: 'Exception500', replace: true })
    }
    return
  }

  // 3. 处理动态路由注册
  if (!routeRegistry?.isRegistered() && userStore.isLogin) {
    // 防止并发请求（快速连续导航场景）
    if (routeInitInProgress) {
      // 正在初始化中，等待完成后重新导航
      next(false)
      return
    }
    await handleDynamicRoutes(to, next, router)
    return
  }

  // 4. 处理根路径重定向
  if (handleRootPathRedirect(to, next)) {
    return
  }

  // 5. 处理已匹配的路由
  if (to.matched.length > 0) {
    setWorktab(to)
    setPageTitle(to)
    next()
    return
  }

  // 6. 未匹配到路由，跳转到 404
  next({ name: 'Exception404' })
}

/**
 * @description 放行已登录用户和匿名静态页面，并将其他匿名访问重定向至登录页。
 * @param {RouteLocationNormalized} to 即将进入的目标路由。
 * @param {ReturnType<typeof useUserStore>} userStore 当前用户状态仓库。
 * @param {NavigationGuardNext} next 用于执行登录页重定向的导航回调。
 * @returns {boolean} `true` 表示可以继续，`false` 表示已处理跳转。
 */
function handleLoginStatus(
  to: RouteLocationNormalized,
  userStore: ReturnType<typeof useUserStore>,
  next: NavigationGuardNext
): boolean {
  // 已登录或访问登录页或静态路由，直接放行
  if (userStore.isLogin || to.path === RoutesAlias.Login || isStaticRoute(to.path)) {
    return true
  }

  // 未登录且访问需要权限的页面，跳转到登录页并携带 redirect 参数
  userStore.logOut()
  next({
    name: 'Login',
    query: { redirect: to.fullPath }
  })
  return false
}

/**
 * @description 递归检查路径是否匹配允许匿名访问的静态路由，并排除兜底 404 路由。
 * @param {string} path 待匹配的目标路径。
 * @returns {boolean} 路径匹配静态路由时返回 `true`。
 */
function isStaticRoute(path: string): boolean {
  const checkRoute = (routes: any[], targetPath: string): boolean => {
    return routes.some((route) => {
      // 404 catch-all 路由不应视为可匿名访问的静态页，
      // 否则未登录时手动输入任意地址会直接落到 404，无法跳转登录页。
      if (route.name === 'Exception404') {
        return false
      }

      // 处理动态路由参数匹配
      const routePath = route.path
      const pattern = routePath.replace(/:[^/]+/g, '[^/]+').replace(/\*/g, '.*')
      const regex = new RegExp(`^${pattern}$`)

      if (regex.test(targetPath)) {
        return true
      }
      if (route.children && route.children.length > 0) {
        return checkRoute(route.children, targetPath)
      }
      return false
    })
  }

  return checkRoute(staticRoutes, path)
}

/**
 * @description 获取用户与菜单信息、注册动态路由并恢复本次目标导航。
 * @param {RouteLocationNormalized} to 即将进入的目标路由。
 * @param {NavigationGuardNext} next 用于恢复、重定向或取消导航的回调。
 * @param {Router} router 当前 Vue Router 实例。
 * @returns {Promise<void>} 动态路由初始化和导航处理完成后不返回数据。
 */
async function handleDynamicRoutes(
  to: RouteLocationNormalized,
  next: NavigationGuardNext,
  router: Router
): Promise<void> {
  // 标记初始化进行中
  routeInitInProgress = true

  // 显示 loading
  pendingLoading = true
  loadingService.showLoading()

  try {
    // 1. 获取用户信息
    await fetchUserInfo()

    // 2. 获取菜单数据
    const menuList = await menuProcessor.getMenuList()

    // 3. 验证菜单数据
    if (!menuProcessor.validateMenuList(menuList)) {
      throw new Error('获取菜单列表失败，请重新登录')
    }

    // 4. 注册动态路由
    routeRegistry?.register(menuList)

    // 5. 保存菜单数据到 store
    const menuStore = useMenuStore()
    menuStore.setMenuList(menuList)
    menuStore.addRemoveRouteFns(routeRegistry?.getRemoveRouteFns() || [])

    // 6. 保存 iframe 路由
    IframeRouteManager.getInstance().save()

    // 7. 验证工作标签页
    useWorktabStore().validateWorktabs(router)

    // 8. 静态路由不依赖菜单权限，初始化后直接恢复目标地址。
    if (isStaticRoute(to.path)) {
      routeInitInProgress = false
      next({
        path: to.path,
        query: to.query,
        hash: to.hash,
        replace: true
      })
      return
    }

    // 8. 验证目标路径权限
    const { homePath } = useCommon()
    const { path: validatedPath, hasPermission } = RoutePermissionValidator.validatePath(
      to.path,
      menuList,
      homePath.value || '/'
    )

    // 初始化成功，重置进行中标记
    routeInitInProgress = false

    // 9. 重新导航到目标路由
    if (!hasPermission) {
      // 无权限访问，跳转到首页
      closeLoading()

      // 输出警告信息
      console.warn(`[RouteGuard] 用户无权限访问路径: ${to.path}，已跳转到首页`)

      // 直接跳转到首页
      next({
        path: validatedPath,
        replace: true
      })
    } else {
      // 有权限，正常导航
      next({
        path: to.path,
        query: to.query,
        hash: to.hash,
        replace: true
      })
    }
  } catch (error) {
    console.error('[RouteGuard] 动态路由注册失败:', error)

    // 关闭 loading
    closeLoading()

    // 401 错误：axios 拦截器已处理退出登录，取消当前导航
    if (isUnauthorizedError(error)) {
      // 重置状态，允许重新登录后再次初始化
      routeInitInProgress = false
      next(false)
      return
    }

    // 标记初始化失败，防止死循环
    routeInitFailed = true
    routeInitInProgress = false

    // 输出详细错误信息，便于排查
    if (isHttpError(error)) {
      console.error(`[RouteGuard] 错误码: ${error.code}, 消息: ${error.message}`)
    }

    // 跳转到 500 页面，使用 replace 避免产生历史记录
    next({ name: 'Exception500', replace: true })
  }
}

/**
 * @description 获取当前登录用户资料，写入用户仓库并清理其他账号遗留的工作标签页。
 * @returns {Promise<void>} 用户资料同步完成后不返回数据。
 * @throws {Error} 用户资料接口请求失败时由请求层向上传递。
 */
async function fetchUserInfo(): Promise<void> {
  const userStore = useUserStore()
  const data = await fetchGetUserInfo()
  userStore.setUserInfo(data)
  // 检查并清理工作台标签页（如果是不同用户登录）
  userStore.checkAndClearWorktabs()
}

/**
 * @description 延迟注销动态路由并清空相关菜单状态。
 * @param {number} delay 执行路由与菜单状态清理前等待的毫秒数。
 * @returns {void} 延迟清理任务注册完成后不返回值。
 */
export function resetRouterState(delay: number): void {
  setTimeout(() => {
    routeRegistry?.unregister()
    IframeRouteManager.getInstance().clear()

    const menuStore = useMenuStore()
    menuStore.removeAllDynamicRoutes()
    menuStore.setMenuList([])

    // 重置路由初始化状态，允许重新登录后再次初始化
    resetRouteInitState()
  }, delay)
}

/**
 * @description 在目标为根路径且配置了其他首页时执行替换式重定向。
 * @param {RouteLocationNormalized} to 即将进入的目标路由。
 * @param {NavigationGuardNext} next 用于执行首页重定向的导航回调。
 * @returns {boolean} `true` 表示已处理跳转，`false` 表示无需跳转。
 */
function handleRootPathRedirect(to: RouteLocationNormalized, next: NavigationGuardNext): boolean {
  if (to.path !== '/') {
    return false
  }

  const { homePath } = useCommon()
  if (homePath.value && homePath.value !== '/') {
    next({ path: homePath.value, replace: true })
    return true
  }

  return false
}

/**
 * @description 判断未知异常是否为请求层标准化的 HTTP 401 未授权错误。
 * @param {unknown} error 待识别的异常值。
 * @returns {boolean} 异常为未授权 HTTP 错误时返回 `true`。
 */
function isUnauthorizedError(error: unknown): boolean {
  return isHttpError(error) && error.code === ApiStatus.unauthorized
}
