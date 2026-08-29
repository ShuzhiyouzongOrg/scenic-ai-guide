/**
 * @fileoverview 颜色格式转换、混合和 Element Plus 主题变量工具。
 * @description 校验 Hex 与 RGB 值，生成明暗色阶，并同步更新页面主题 CSS 变量。
 *
 * 提供完整的颜色格式转换和处理功能
 *
 * ## 主要功能
 *
 * - Hex 与 RGB/RGBA 格式互转
 * - 颜色混合计算
 * - 颜色变浅/变深处理
 * - Element Plus 主题色自动生成
 * - 颜色格式验证
 * - CSS 变量读取
 * - 暗黑模式颜色适配
 *
 * ## 使用场景
 *
 * - 主题色动态切换
 * - Element Plus 组件主题定制
 * - 颜色渐变生成
 * - 明暗主题颜色计算
 * - 颜色格式标准化
 *
 * ## 核心功能
 *
 * - hexToRgba: Hex 转 RGBA（支持透明度）
 * - hexToRgb: Hex 转 RGB 数组
 * - rgbToHex: RGB 转 Hex
 * - colourBlend: 两种颜色混合
 * - getLightColor: 生成变浅的颜色
 * - getDarkColor: 生成变深的颜色
 * - handleElementThemeColor: 处理 Element Plus 主题色
 * - setElementThemeColor: 设置完整的主题色系统
 *
 * ## 支持格式
 *
 * - Hex: #FFF, #FFFFFF
 * - RGB: rgb(255, 255, 255)
 * - RGBA: rgba(255, 255, 255, 0.5)
 *
 * @module utils/ui/colors
 */
import { useSettingStore } from '@/store/modules/setting'

/**
 * @typedef RgbaResult
 * @description Hex 颜色转换后的 RGB 分量与 RGBA 文本。
 * @property {number} red 红色通道值。
 * @property {number} green 绿色通道值。
 * @property {number} blue 蓝色通道值。
 * @property {string} rgba CSS rgba 颜色字符串。
 */
interface RgbaResult {
  red: number
  green: number
  blue: number
  rgba: string
}

/**
 * @description 读取根元素上指定 CSS 自定义属性的计算值。
 * @param {string} name CSS 变量名。
 * @returns {string} CSS 变量的计算值。
 * @example
 * getCssVar('--el-color-primary')
 */
export function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name)
}

/**
 * @description 判断字符串是否为三位或六位 Hex 颜色。
 * @param {string} hex 待验证的 Hex 颜色。
 * @returns {boolean} 格式有效时返回 true。
 */
function isValidHexColor(hex: string): boolean {
  const cleanHex = hex.trim().replace(/^#/, '')
  return /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(cleanHex)
}

/**
 * @description 判断三个通道是否均为 0 至 255 的整数。
 * @param {number} r 红色通道值。
 * @param {number} g 绿色通道值。
 * @param {number} b 蓝色通道值。
 * @returns {boolean} 三个通道均有效时返回 true。
 */
function isValidRgbValue(r: number, g: number, b: number): boolean {
  const isValid = (value: number) => Number.isInteger(value) && value >= 0 && value <= 255
  return isValid(r) && isValid(g) && isValid(b)
}

/**
 * @description 将三位或六位 Hex 颜色转换为 RGB 分量和 RGBA 字符串，透明度会限制在 0 至 1。
 * @param {string} hex Hex 颜色，支持 #FFF 和 #FFFFFF 格式。
 * @param {number} opacity 目标透明度。
 * @returns {RgbaResult} RGB 分量和 RGBA 字符串。
 * @throws {Error} Hex 颜色格式无效时抛出。
 * @example
 * hexToRgba('#16a085', 0.5)
 */
export function hexToRgba(hex: string, opacity: number): RgbaResult {
  if (!isValidHexColor(hex)) {
    throw new Error('Invalid hex color format')
  }

  // 移除可能存在的 # 前缀并转换为大写
  let cleanHex = hex.trim().replace(/^#/, '').toUpperCase()

  // 如果是缩写形式（如 FFF），转换为完整形式
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map((char) => char.repeat(2))
      .join('')
  }

  // 解析 RGB 值
  const [red, green, blue] = cleanHex.match(/\w\w/g)!.map((x) => parseInt(x, 16))

  // 确保 opacity 在有效范围内
  const validOpacity = Math.max(0, Math.min(1, opacity))

  // 构建 RGBA 字符串
  const rgba = `rgba(${red}, ${green}, ${blue}, ${validOpacity.toFixed(2)})`

  return { red, green, blue, rgba }
}

/**
 * @description 将三位或六位 Hex 颜色转换为 RGB 数组。
 * @param {string} hexColor Hex 颜色。
 * @returns {number[]} 按红、绿、蓝顺序排列的通道数组。
 * @throws {Error} Hex 颜色格式无效或无法拆分通道时抛出。
 * @example
 * hexToRgb('#ffffff')
 */
export function hexToRgb(hexColor: string): number[] {
  if (!isValidHexColor(hexColor)) {
    ElMessage.warning('输入错误的hex颜色值')
    throw new Error('Invalid hex color format')
  }

  const cleanHex = hexColor.replace(/^#/, '')
  let hex = cleanHex

  // 处理缩写形式
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char.repeat(2))
      .join('')
  }

  const hexPairs = hex.match(/../g)
  if (!hexPairs) {
    throw new Error('Invalid hex color format')
  }

  return hexPairs.map((hexPair) => parseInt(hexPair, 16))
}

/**
 * @description 将三个 RGB 整数通道转换为六位 Hex 颜色。
 * @param {number} r 0 至 255 的红色通道值。
 * @param {number} g 0 至 255 的绿色通道值。
 * @param {number} b 0 至 255 的蓝色通道值。
 * @returns {string} 六位 Hex 颜色。
 * @throws {Error} 任一通道不是有效整数时抛出。
 * @example
 * rgbToHex(255, 255, 255)
 */
export function rgbToHex(r: number, g: number, b: number): string {
  if (!isValidRgbValue(r, g, b)) {
    ElMessage.warning('输入错误的RGB颜色值')
    throw new Error('Invalid RGB color values')
  }

  const toHex = (value: number) => {
    const hex = value.toString(16)
    return hex.length === 1 ? `0${hex}` : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * @description 按指定比例线性混合两种 Hex 颜色。
 * @param {string} color1 比例为 0 时使用的颜色。
 * @param {string} color2 比例为 1 时使用的颜色。
 * @param {number} ratio 混合比例，超出范围时限制在 0 至 1。
 * @returns {string} 混合后的 Hex 颜色。
 * @throws {Error} 任一输入颜色格式无效时抛出。
 */
export function colourBlend(color1: string, color2: string, ratio: number): string {
  const validRatio = Math.max(0, Math.min(1, Number(ratio)))

  const rgb1 = hexToRgb(color1)
  const rgb2 = hexToRgb(color2)

  const blendedRgb = rgb1.map((value1, index) => {
    const value2 = rgb2[index]
    return Math.round(value1 * (1 - validRatio) + value2 * validRatio)
  })

  return rgbToHex(blendedRgb[0], blendedRgb[1], blendedRgb[2])
}

/**
 * @description 根据层级将 Hex 颜色向白色方向提亮；暗色主题下改为调用压暗逻辑。
 * @param {string} color 原始 Hex 颜色。
 * @param {number} level 明暗变化比例。
 * @param {boolean} [isDark=false] 是否按暗色主题规则处理。
 * @returns {string} 调整后的 Hex 颜色。
 * @throws {Error} 输入颜色格式无效时抛出。
 */
export function getLightColor(color: string, level: number, isDark: boolean = false): string {
  if (!isValidHexColor(color)) {
    ElMessage.warning('输入错误的hex颜色值')
    throw new Error('Invalid hex color format')
  }

  if (isDark) {
    return getDarkColor(color, level)
  }

  const rgb = hexToRgb(color)
  const lightRgb = rgb.map((value) => Math.floor((255 - value) * level + value))

  return rgbToHex(lightRgb[0], lightRgb[1], lightRgb[2])
}

/**
 * @description 根据层级降低 Hex 颜色各 RGB 通道值。
 * @param {string} color 原始 Hex 颜色。
 * @param {number} level 变暗比例。
 * @returns {string} 调整后的 Hex 颜色。
 * @throws {Error} 输入颜色格式无效时抛出。
 */
export function getDarkColor(color: string, level: number): string {
  if (!isValidHexColor(color)) {
    ElMessage.warning('输入错误的hex颜色值')
    throw new Error('Invalid hex color format')
  }

  const rgb = hexToRgb(color)
  const darkRgb = rgb.map((value) => Math.floor(value * (1 - level)))

  return rgbToHex(darkRgb[0], darkRgb[1], darkRgb[2])
}

/**
 * @description 设置 Element Plus 主色，并生成九级亮色与暗色变量。
 * @param {string} theme 主题 Hex 颜色。
 * @param {boolean} [isDark=false] 是否使用暗色主题的色阶规则。
 * @returns {void} 无返回值。
 * @throws {Error} 主题颜色格式无效时抛出。
 */
export function handleElementThemeColor(theme: string, isDark: boolean = false): void {
  document.documentElement.style.setProperty('--el-color-primary', theme)

  for (let i = 1; i <= 9; i++) {
    document.documentElement.style.setProperty(
      `--el-color-primary-light-${i}`,
      getLightColor(theme, i / 10, isDark)
    )
  }

  for (let i = 1; i <= 9; i++) {
    document.documentElement.style.setProperty(
      `--el-color-primary-dark-${i}`,
      getDarkColor(theme, i / 10)
    )
  }
}

/**
 * @description 设置完整 Element Plus 主色体系，并生成额外十五级自定义浅色变量。
 * @param {string} color 主题 Hex 颜色。
 * @returns {void} 无返回值。
 * @throws {Error} 主题颜色格式无效时抛出。
 * @example
 * setElementThemeColor('#16a085')
 */
export function setElementThemeColor(color: string): void {
  const mixColor = '#ffffff'
  const elStyle = document.documentElement.style

  elStyle.setProperty('--el-color-primary', color)
  handleElementThemeColor(color, useSettingStore().isDark)

  // 生成更淡一点的颜色
  for (let i = 1; i < 16; i++) {
    const itemColor = colourBlend(color, mixColor, i / 16)
    elStyle.setProperty(`--el-color-primary-custom-${i}`, itemColor)
  }
}
