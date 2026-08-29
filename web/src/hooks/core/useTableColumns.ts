/**
 * @fileoverview 提供表格列显示、增删、更新与重排能力。
 * @description 统一处理普通列和特殊列标识，并维护响应式动态列配置。
 */

/**
 * @description useTableColumns - 表格列配置管理
 *
 * 提供动态的表格列配置管理能力，支持运行时灵活控制列的显示、隐藏、排序等操作。
 * 通常与 useTable 配合使用，为表格提供完整的列管理功能。
 *
 * ## 主要功能
 *
 * 1. 列显示控制 - 动态显示/隐藏列，支持批量操作
 * 2. 列排序 - 拖拽或编程方式重新排列列顺序
 * 3. 列配置管理 - 新增、删除、更新列配置
 * 4. 特殊列支持 - 自动处理 selection、expand、index 等特殊列
 * 5. 状态持久化 - 保持列的显示状态，支持重置到初始状态
 *
 * ## 使用示例
 *
 * ```typescript
 * const { columns, columnChecks, toggleColumn, reorderColumns } = useTableColumns(() => [
 *   { prop: 'name', label: '姓名', visible: true },
 *   { prop: 'email', label: '邮箱', visible: true },
 *   { prop: 'status', label: '状态', visible: false }
 * ])
 *
 * // 切换列显示
 * toggleColumn('email', false)
 *
 * // 重新排序
 * reorderColumns(0, 2)
 * ```
 *
 * @module useTableColumns
 *
 */

import { ref, computed, watch } from 'vue'
import { $t } from '@/locales'
import type { ColumnOption } from '@/types/component'

/**
 * @description 特殊列类型
 */
const SPECIAL_COLUMNS: Record<string, { prop: string; label: string }> = {
  selection: { prop: '__selection__', label: $t('table.column.selection') },
  expand: { prop: '__expand__', label: $t('table.column.expand') },
  index: { prop: '__index__', label: $t('table.column.index') }
}

/**
 * @description 返回普通列的 `prop`，或将选择、展开和序号列映射为稳定的内部标识。
 * @template T 表格行记录类型。
 * @param {ColumnOption<T>} col 待解析的列配置。
 * @returns {string} 可用于查找、更新和排序的列唯一标识。
 */
export const getColumnKey = <T>(col: ColumnOption<T>) =>
  SPECIAL_COLUMNS[col.type as keyof typeof SPECIAL_COLUMNS]?.prop ?? (col.prop as string)

/**
 * @description 获取列的显示状态
 * 优先使用 visible 字段，如果不存在则使用 checked 字段
 * @template T 表格行记录类型。
 * @param {ColumnOption<T>} col 待判断的列配置。
 * @returns {boolean} `visible`、`checked` 或默认值 true 对应的显示状态。
 */
export const getColumnVisibility = <T>(col: ColumnOption<T>): boolean => {
  // visible 优先级高于 checked
  if (col.visible !== undefined) {
    return col.visible
  }
  // 如果 visible 未定义，使用 checked，默认为 true
  return col.checked ?? true
}

/**
 * @description 将原始列配置转换为列设置面板使用的勾选状态，并固定特殊列为显示。
 * @template T 表格行记录类型。
 * @param {ColumnOption<T>[]} columns 原始列配置数组。
 * @returns {Array<ColumnOption<T> & {checked: boolean, visible: boolean}>} 补齐 `checked`、`visible` 及特殊列标识后的新数组。
 */
export const getColumnChecks = <T>(columns: ColumnOption<T>[]) =>
  columns.map((col) => {
    const special = col.type && SPECIAL_COLUMNS[col.type]
    const visibility = getColumnVisibility(col)

    if (special) {
      return { ...col, prop: special.prop, label: special.label, checked: true, visible: true }
    }
    return { ...col, checked: visibility, visible: visibility }
  })

/**
 * @description 定义动态表格列的增删、显隐、更新、排序和查询方法。
 * @interface DynamicColumnConfig
 * @template T 表格行记录类型。
 * @property {(column: ColumnOption<T> | ColumnOption<T>[], index?: number) => void} addColumn 新增一个或多个列。
 * @property {(prop: string | string[]) => void} removeColumn 删除一个或多个列。
 * @property {(prop: string | string[], visible?: boolean) => void} toggleColumn 切换一个或多个列的显示状态。
 * @property {(prop: string | Array<{prop: string, updates: Partial<ColumnOption<T>>}>, updates?: Partial<ColumnOption<T>>) => void} updateColumn 更新一个或多个列配置。
 * @property {(updates: Array<{prop: string, updates: Partial<ColumnOption<T>>}>) => void} batchUpdateColumns 批量更新列配置。
 * @property {(fromIndex: number, toIndex: number) => void} reorderColumns 调整列的显示顺序。
 * @property {(prop: string) => ColumnOption<T> | undefined} getColumnConfig 获取指定列配置。
 * @property {() => ColumnOption<T>[]} getAllColumns 获取全部列配置。
 * @property {() => void} resetColumns 恢复初始列配置。
 */
export interface DynamicColumnConfig<T = any> {
  /**
   * @description 新增列（支持单个或批量）
   * @param {ColumnOption<T> | ColumnOption<T>[]} column 列配置或列配置数组。
   * @param {number} [index] 可选的插入位置，默认末尾；批量添加时表示首列位置。
   * @returns {void} 无返回值。
   */
  addColumn: (column: ColumnOption<T> | ColumnOption<T>[], index?: number) => void
  /**
   * @description 删除列（支持单个或批量）
   * @param {string | string[]} prop 列的唯一标识或标识数组。
   * @returns {void} 无返回值。
   */
  removeColumn: (prop: string | string[]) => void
  /**
   * @description 切换列显示状态（支持单个或批量）
   * @param {string | string[]} prop 列的唯一标识或标识数组。
   * @param {boolean} [visible] 指定显示状态；省略时切换当前状态。
   * @returns {void} 无返回值。
   */
  toggleColumn: (prop: string | string[], visible?: boolean) => void

  /**
   * @description 更新列（支持单个或批量）
   * @param {string | Array<{prop: string, updates: Partial<ColumnOption<T>>}>} prop 列的唯一标识或批量更新配置。
   * @param {Partial<ColumnOption<T>>} [updates] 单列更新内容，仅在 `prop` 为字符串时使用。
   * @returns {void} 无返回值。
   */
  updateColumn: (
    prop: string | Array<{ prop: string; updates: Partial<ColumnOption<T>> }>,
    updates?: Partial<ColumnOption<T>>
  ) => void
  /**
   * @description 批量更新列（兼容旧版本，推荐使用 updateColumn 的数组模式）
   * @param {Array<{prop: string, updates: Partial<ColumnOption<T>>}>} updates 列更新配置。
   * @returns {void} 无返回值。
   * @deprecated 推荐使用 updateColumn 的数组模式
   */
  batchUpdateColumns: (updates: Array<{ prop: string; updates: Partial<ColumnOption<T>> }>) => void
  /**
   * @description 重新排序列
   * @param {number} fromIndex 源索引。
   * @param {number} toIndex 目标索引。
   * @returns {void} 无返回值。
   */
  reorderColumns: (fromIndex: number, toIndex: number) => void
  /**
   * @description 获取列配置
   * @param {string} prop 列的唯一标识。
   * @returns {ColumnOption<T> | undefined} 匹配的列配置；不存在时返回 `undefined`。
   */
  getColumnConfig: (prop: string) => ColumnOption<T> | undefined
  /**
   * @description 获取所有列配置
   * @returns {ColumnOption<T>[]} 所有列配置。
   */
  getAllColumns: () => ColumnOption<T>[]
  /**
   * @description 重置所有列
   * @returns {void} 无返回值。
   */
  resetColumns: () => void
}

/**
 * @description 根据列工厂创建响应式列列表，并提供增删、显隐、更新、重排和查询接口。
 * @template T 表格行记录类型。
 * @param {() => ColumnOption<T>[]} columnsFactory 返回初始列配置数组的工厂函数。
 * @returns {{columns: import('vue').ComputedRef<ColumnOption<T>[]>, columnChecks: import('vue').Ref<ColumnOption<T>[]>} & DynamicColumnConfig<T>} 响应式列、列勾选状态及完整动态列控制方法。
 * @example
 * const columns = useTableColumns(() => [{ prop: 'name', label: '名称' }])
 * columns.toggleColumn('name', false)
 */
export function useTableColumns<T = any>(
  columnsFactory: () => ColumnOption<T>[]
): {
  columns: any
  columnChecks: any
} & DynamicColumnConfig<T> {
  const dynamicColumns = ref<ColumnOption<T>[]>(columnsFactory())
  const columnChecks = ref<ColumnOption<T>[]>(getColumnChecks(dynamicColumns.value))

  // 当 dynamicColumns 变动时，重新生成 columnChecks 且保留已存在的显示状态
  watch(
    dynamicColumns,
    (newCols) => {
      const visibilityMap = new Map(
        columnChecks.value.map((c) => [getColumnKey(c), getColumnVisibility(c)])
      )
      const newChecks = getColumnChecks(newCols).map((c) => {
        const key = getColumnKey(c)
        const visibility = visibilityMap.has(key) ? visibilityMap.get(key) : getColumnVisibility(c)
        return {
          ...c,
          checked: visibility,
          visible: visibility
        }
      })
      columnChecks.value = newChecks
    },
    { deep: true }
  )

  // 当前显示列（基于 columnChecks 的 checked 或 visible）
  const columns = computed(() => {
    const colMap = new Map(dynamicColumns.value.map((c) => [getColumnKey(c), c]))
    return columnChecks.value
      .filter((c) => getColumnVisibility(c))
      .map((c) => colMap.get(getColumnKey(c)))
      .filter(Boolean) as ColumnOption<T>[]
  })

  // 支持 updater 返回新数组或直接在传入数组上 mutate
  const setDynamicColumns = (updater: (cols: ColumnOption<T>[]) => void | ColumnOption<T>[]) => {
    const copy = [...dynamicColumns.value]
    const result = updater(copy)
    dynamicColumns.value = Array.isArray(result) ? result : copy
  }

  return {
    columns,
    columnChecks,

    /**
     * @description 新增列（支持单个或批量）
     */
    addColumn: (column: ColumnOption<T> | ColumnOption<T>[], index?: number) =>
      setDynamicColumns((cols) => {
        const next = [...cols]
        const columnsToAdd = Array.isArray(column) ? column : [column]
        const insertIndex =
          typeof index === 'number' && index >= 0 && index <= next.length ? index : next.length

        // 批量插入
        next.splice(insertIndex, 0, ...columnsToAdd)
        return next
      }),

    /**
     * @description 删除列（支持单个或批量）
     */
    removeColumn: (prop: string | string[]) =>
      setDynamicColumns((cols) => {
        const propsToRemove = Array.isArray(prop) ? prop : [prop]
        return cols.filter((c) => !propsToRemove.includes(getColumnKey(c)))
      }),

    /**
     * @description 更新列（支持单个或批量）
     */
    updateColumn: (
      prop: string | Array<{ prop: string; updates: Partial<ColumnOption<T>> }>,
      updates?: Partial<ColumnOption<T>>
    ) => {
      // 批量模式：prop 是数组
      if (Array.isArray(prop)) {
        setDynamicColumns((cols) => {
          const map = new Map(prop.map((u) => [u.prop, u.updates]))
          return cols.map((c) => {
            const key = getColumnKey(c)
            const upd = map.get(key)
            return upd ? { ...c, ...upd } : c
          })
        })
      }
      // 单个模式：prop 是字符串
      else if (updates) {
        setDynamicColumns((cols) =>
          cols.map((c) => (getColumnKey(c) === prop ? { ...c, ...updates } : c))
        )
      }
    },

    /**
     * @description 切换列显示状态（支持单个或批量）
     */
    toggleColumn: (prop: string | string[], visible?: boolean) => {
      const propsToToggle = Array.isArray(prop) ? prop : [prop]
      const next = [...columnChecks.value]

      propsToToggle.forEach((p) => {
        const i = next.findIndex((c) => getColumnKey(c) === p)
        if (i > -1) {
          const currentVisibility = getColumnVisibility(next[i])
          const newVisibility = visible ?? !currentVisibility
          // 同时更新 checked 和 visible 以保持兼容性
          next[i] = { ...next[i], checked: newVisibility, visible: newVisibility }
        }
      })

      columnChecks.value = next
    },

    /**
     * @description 重置所有列
     */
    resetColumns: () => {
      dynamicColumns.value = columnsFactory()
    },

    /**
     * @description 批量更新列（兼容旧版本）
     * @deprecated 推荐使用 updateColumn 的数组模式
     */
    batchUpdateColumns: (updates) =>
      setDynamicColumns((cols) => {
        const map = new Map(updates.map((u) => [u.prop, u.updates]))
        return cols.map((c) => {
          const key = getColumnKey(c)
          const upd = map.get(key)
          return upd ? { ...c, ...upd } : c
        })
      }),

    /**
     * @description 重新排序列
     */
    reorderColumns: (fromIndex: number, toIndex: number) =>
      setDynamicColumns((cols) => {
        if (
          fromIndex < 0 ||
          fromIndex >= cols.length ||
          toIndex < 0 ||
          toIndex >= cols.length ||
          fromIndex === toIndex
        ) {
          return cols
        }
        const next = [...cols]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)
        return next
      }),

    /**
     * @description 获取列配置
     */
    getColumnConfig: (prop: string) => dynamicColumns.value.find((c) => getColumnKey(c) === prop),

    /**
     * @description 获取所有列配置
     */
    getAllColumns: () => [...dynamicColumns.value]
  }
}
