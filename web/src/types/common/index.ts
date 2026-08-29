/**
 * @fileoverview 通用类型定义入口。
 * @description 声明状态、性别、排序、键值、时间、文件、坐标、主题、语言和环境类型。
 */

// 导出响应类型
export * from './response'

// 状态类型
/**
 * @description 定义通用启用与禁用状态。
 * @typedef {0 | 1} Status
 */
export type Status = 0 | 1 // 0: 禁用, 1: 启用

// 性别类型
/**
 * @description 定义用户性别取值。
 * @typedef {'male' | 'female' | 'unknown'} Gender
 */
export type Gender = 'male' | 'female' | 'unknown'

// 排序方向
/**
 * @description 定义表格排序方向。
 * @typedef {'ascending' | 'descending'} SortOrder
 */
export type SortOrder = 'ascending' | 'descending'

// 操作类型
/**
 * @description 定义数据操作类型。
 * @typedef {'create' | 'update' | 'delete' | 'view'} ActionType
 */
export type ActionType = 'create' | 'update' | 'delete' | 'view'

// 可选的记录类型
/**
 * @description 定义字符串键到指定值类型的通用记录。
 * @typedef {Record<string, T>} Recordable
 */
export type Recordable<T = any> = Record<string, T>

// 键值对类型
/**
 * @description 描述带可选标签的通用键值项。
 * @typedef {{ key: string value: T label?: string }} KeyValue
 * @property {string} key 配置键。
 * @property {T} value 数据值。
 * @property {string} [label] 显示名称或分类标签。
 */
export type KeyValue<T = any> = {
  key: string
  value: T
  label?: string
}

// 时间范围类型
/**
 * @description 描述开始与结束时间组成的筛选范围。
 * @typedef {object} TimeRange
 * @property {string} startTime 开始时间。
 * @property {string} endTime 结束时间。
 */
export interface TimeRange {
  startTime: string
  endTime: string
}

// 文件类型
/**
 * @description 描述文件名称、地址、大小、类型和修改时间。
 * @typedef {object} FileInfo
 * @property {string} name 名称。
 * @property {string} url 资源地址。
 * @property {number} size 文件字节数。
 * @property {string} type 类型。
 * @property {number} [lastModified] 最后修改时间戳。
 */
export interface FileInfo {
  name: string
  url: string
  size: number
  type: string
  lastModified?: number
}

// 坐标类型
/**
 * @description 描述二维平面坐标。
 * @typedef {object} Position
 * @property {number} x 横坐标。
 * @property {number} y 纵坐标。
 */
export interface Position {
  x: number
  y: number
}

// 尺寸类型
/**
 * @description 描述二维尺寸。
 * @typedef {object} Size
 * @property {number} width 宽度。
 * @property {number} height 高度。
 */
export interface Size {
  width: number
  height: number
}

// 响应式断点类型
/**
 * @description 定义响应式布局断点。
 * @typedef {'xs' | 'sm' | 'md' | 'lg' | 'xl'} Breakpoint
 */
export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

// 主题类型
/**
 * @description 定义界面主题模式。
 * @typedef {'light' | 'dark' | 'auto'} ThemeMode
 */
export type ThemeMode = 'light' | 'dark' | 'auto'

// 语言类型
/**
 * @description 定义界面支持的完整语言区域代码。
 * @typedef {'zh-CN' | 'en-US' | 'ko-KR' | 'zh-TW' | 'ja-JP' | 'th-TH'} Language
 */
export type Language = 'zh-CN' | 'en-US' | 'ko-KR' | 'zh-TW' | 'ja-JP' | 'th-TH'

// 环境类型
/**
 * @description 定义应用运行环境。
 * @typedef {'development' | 'production' | 'test'} Environment
 */
export type Environment = 'development' | 'production' | 'test'

// 弹窗类型
/**
 * @description 定义对话框的新增与编辑用途。
 * @typedef {'add' | 'edit'} DialogType
 */
export type DialogType = 'add' | 'edit'
