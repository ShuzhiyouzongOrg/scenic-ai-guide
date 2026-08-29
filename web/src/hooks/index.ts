/**
 * @fileoverview 统一导出 Web 应用的核心组合式函数。
 * @description 为页面与组件提供稳定的 Hook 聚合入口，避免依赖具体文件路径。
 */

/**
 * @description 重导出页面刷新、路径和滚动工具。
 * @see useCommon
 */
export { useCommon } from './core/useCommon'

/**
 * @description 重导出应用权限模式判定工具。
 * @see useAppMode
 */
export { useAppMode } from './core/useAppMode'

/**
 * @description 重导出按钮权限检查工具。
 * @see useAuth
 */
export { useAuth } from './core/useAuth'

/**
 * @description 重导出表格数据管理工具。
 * @see useTable
 */
export { useTable } from './core/useTable'

/**
 * @description 重导出动态表格列管理工具。
 * @see useTableColumns
 */
export { useTableColumns } from './core/useTableColumns'

/**
 * @description 重导出主题切换工具。
 * @see useTheme
 */
export { useTheme } from './core/useTheme'

/**
 * @description 重导出节庆烟花与祝福文本控制工具。
 * @see useCeremony
 */
export { useCeremony } from './core/useCeremony'

/**
 * @description 重导出顶部快速入口配置工具。
 * @see useFastEnter
 */
export { useFastEnter } from './core/useFastEnter'

/**
 * @description 重导出顶部栏功能显示与查询工具。
 * @see useHeaderBar
 */
export { useHeaderBar } from './core/useHeaderBar'

/**
 * @description 重导出基础图表、组件图表和默认主题配置工具。
 * @see useChart
 * @see useChartComponent
 * @see useChartOps
 */
export { useChart, useChartComponent, useChartOps } from './core/useChart'

/**
 * @description 重导出直接绑定和按 ID 绑定的布局高度工具。
 * @see useLayoutHeight
 * @see useAutoLayoutHeight
 */
export { useLayoutHeight, useAutoLayoutHeight } from './core/useLayoutHeight'
