/**
 * @fileoverview 通用组件类型定义。
 * @description 声明搜索、表格列、分页、表单规则和对话框配置类型。
 */

// 搜索组件类型
/**
 * @description 定义搜索表单支持的组件类型。
 * @typedef {| 'input' | 'select' | 'radio' | 'checkbox' | 'date' | 'datetime' | 'daterange' | 'datetimerange' | 'month' | 'monthrange' | 'year' | 'yearrange' | 'week' | 'time' | 'timerange'} SearchComponentType
 */
export type SearchComponentType =
  | 'input'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'datetime'
  | 'daterange'
  | 'datetimerange'
  | 'month'
  | 'monthrange'
  | 'year'
  | 'yearrange'
  | 'week'
  | 'time'
  | 'timerange'

// 搜索框值变化参数
/**
 * @description 描述搜索字段和值变化事件。
 * @typedef {object} SearchChangeParams
 * @property {string} prop 字段名。
 * @property {unknown} val 变化后的值。
 */
export interface SearchChangeParams {
  prop: string
  val: unknown
}

// 表格列配置接口
/**
 * @description 描述表格列的类型、尺寸、排序、筛选、插槽和渲染配置。
 * @typedef {object} ColumnOption
 * @property {'selection' | 'expand' | 'index' | 'globalIndex'} [type] 类型。
 * @property {string} [prop] 字段名。
 * @property {string} [label] 显示名称或分类标签。
 * @property {string | number} [width] 宽度。
 * @property {string | number} [minWidth] 显示所需最小宽度。
 * @property {boolean | 'left' | 'right'} [fixed] 是否固定列以及固定方向。
 * @property {boolean | 'custom'} [sortable] 是否启用默认排序或自定义排序。
 * @property {any[]} [filters] 当前筛选条件。
 * @property {(value: any, row: any) => boolean} [filterMethod] 判断数据行是否匹配筛选值的函数。
 * @property {string} [filterPlacement] 筛选弹层的显示位置。
 * @property {boolean} [disabled] 是否禁用当前列交互。
 * @property {boolean} [visible] 是否可见。
 * @property {boolean} [checked] 列设置面板中是否选中当前列。
 * @property {(row: T) => any} [formatter] 将数据行转换为单元格显示内容的函数。
 * @property {boolean} [useSlot] 是否使用具名插槽渲染单元格。
 * @property {string} [slotName] 单元格插槽名称，默认可使用字段名。
 * @property {boolean} [useHeaderSlot] 是否使用具名插槽渲染表头。
 * @property {string} [headerSlotName] 表头插槽名称。
 * @property {*} [key] 动态扩展字段。
 */
export interface ColumnOption<T = any> {
  // 列类型
  type?: 'selection' | 'expand' | 'index' | 'globalIndex'
  // 列属性名
  prop?: string
  // 列标题
  label?: string
  // 列宽度
  width?: string | number
  // 最小列宽度
  minWidth?: string | number
  // 固定列
  fixed?: boolean | 'left' | 'right'
  // 是否可排序
  sortable?: boolean | 'custom'
  // 过滤器选项
  filters?: any[]
  // 过滤方法
  filterMethod?: (value: any, row: any) => boolean
  // 过滤器位置
  filterPlacement?: string
  // 是否禁用
  disabled?: boolean
  // 是否显示列
  visible?: boolean
  // 是否选中显示
  checked?: boolean
  // 自定义渲染函数
  formatter?: (row: T) => any
  // 插槽相关配置
  // 是否使用插槽渲染内容
  useSlot?: boolean
  // 插槽名称（默认为 prop 值）
  slotName?: string
  // 是否使用表头插槽
  useHeaderSlot?: boolean
  // 表头插槽名称（默认为 `${prop}-header`）
  headerSlotName?: string
  // 其他属性
  [key: string]: any
}

// 分页配置
/**
 * @description 描述分页组件的页码、页容量、总数和布局。
 * @typedef {object} PaginationConfig
 * @property {number} currentPage 当前页码。
 * @property {number} pageSize 每页条数。
 * @property {number} total 总数量。
 * @property {number[]} [pageSizes] 可选每页条数。
 * @property {string} [layout] 组件布局。
 * @property {boolean} [small] 是否使用小尺寸。
 */
export interface PaginationConfig {
  // 当前页
  currentPage: number
  // 每页条数
  pageSize: number
  // 总条数
  total: number
  // 每页显示个数选择器的选项
  pageSizes?: number[]
  // 组件布局
  layout?: string
  // 是否为小型分页
  small?: boolean
}

// 表单规则
/**
 * @description 描述表单字段的校验规则。
 * @typedef {object} FormRule
 * @property {boolean} [required] 是否必填。
 * @property {string} [message] 提示或错误消息。
 * @property {string | string[]} [trigger] 校验触发方式。
 * @property {number} [min] 最小值或最小长度。
 * @property {number} [max] 最大值或最大长度。
 * @property {RegExp} [pattern] 校验正则表达式。
 * @property {(rule: any, value: any, callback: any) => void} [validator] 自定义校验函数。
 */
export interface FormRule {
  // 是否必填
  required?: boolean
  // 错误提示信息
  message?: string
  // 触发方式
  trigger?: string | string[]
  // 最小长度
  min?: number
  // 最大长度
  max?: number
  // 正则表达式
  pattern?: RegExp
  // 自定义验证函数
  validator?: (rule: any, value: any, callback: any) => void
}

// 对话框配置
/**
 * @description 描述对话框标题、可见状态、尺寸和关闭行为。
 * @typedef {object} DialogConfig
 * @property {string} title 标题。
 * @property {boolean} visible 是否可见。
 * @property {string | number} [width] 宽度。
 * @property {boolean} [closeOnClickModal] 点击遮罩是否关闭。
 * @property {boolean} [closeOnPressEscape] 按 Esc 是否关闭。
 * @property {boolean} [showClose] 是否显示关闭按钮。
 * @property {boolean} [lockScroll] 是否锁定页面滚动。
 * @property {boolean} [modal] 是否显示遮罩。
 * @property {string} [customClass] 自定义样式类名。
 */
export interface DialogConfig {
  // 标题
  title: string
  // 是否显示
  visible: boolean
  // 宽度
  width?: string | number
  // 是否可以通过点击 modal 关闭
  closeOnClickModal?: boolean
  // 是否可以通过按下 ESC 关闭
  closeOnPressEscape?: boolean
  // 是否显示关闭按钮
  showClose?: boolean
  // 是否在 Dialog 出现时将 body 滚动锁定
  lockScroll?: boolean
  // 是否显示遮罩层
  modal?: boolean
  // 自定义类名
  customClass?: string
}
