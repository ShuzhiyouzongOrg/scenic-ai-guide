/**
 * @fileoverview 表单与表格枚举模块。
 * @description 定义页面编辑模式和表格尺寸枚举。
 */

// 页面类型
/**
 * @description 定义表单页面的新增与编辑模式。
 * @enum {string}
 */
export enum PageModeEnum {
  Add, // 新增
  Edit // 编辑
}

// 表格大小
/**
 * @description 定义表格组件支持的尺寸。
 * @enum {string}
 */
export enum TableSizeEnum {
  DEFAULT = 'default',
  SMALL = 'small',
  LARGE = 'large'
}
