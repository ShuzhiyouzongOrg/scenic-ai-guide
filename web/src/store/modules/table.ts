/**
 * @fileoverview 表格状态管理模块。
 * @description 维护表格尺寸并提供设置、切换和重置操作。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { TableSizeEnum } from '@/enums/formEnum'

// 表格
/**
 * @description 表格显示偏好 Store 定义。
 * @type {import('pinia').StoreDefinition}
 */
export const useTableStore = defineStore(
  'tableStore',
  () => {
    // 表格大小
    const tableSize = ref(TableSizeEnum.DEFAULT)
    // 斑马纹
    const isZebra = ref(false)
    // 边框
    const isBorder = ref(false)
    // 表头背景
    const isHeaderBackground = ref(false)

    // 是否全屏
    const isFullScreen = ref(false)

    /**
     * @description 设置表格大小。
     * @param {TableSizeEnum} size 表格大小枚举值。
     */
    const setTableSize = (size: TableSizeEnum) => (tableSize.value = size)

    /**
     * @description 设置斑马纹显示状态。
     * @param {boolean} value 是否显示斑马纹。
     */
    const setIsZebra = (value: boolean) => (isZebra.value = value)

    /**
     * @description 设置表格边框显示状态。
     * @param {boolean} value 是否显示边框。
     */
    const setIsBorder = (value: boolean) => (isBorder.value = value)

    /**
     * @description 设置表头背景显示状态。
     * @param {boolean} value 是否显示表头背景。
     */
    const setIsHeaderBackground = (value: boolean) => (isHeaderBackground.value = value)

    /**
     * @description 设置是否全屏。
     * @param {boolean} value 是否全屏。
     */
    const setIsFullScreen = (value: boolean) => (isFullScreen.value = value)

    return {
      tableSize,
      isZebra,
      isBorder,
      isHeaderBackground,
      setTableSize,
      setIsZebra,
      setIsBorder,
      setIsHeaderBackground,
      isFullScreen,
      setIsFullScreen
    }
  },
  {
    persist: {
      key: 'table',
      storage: localStorage
    }
  }
)
