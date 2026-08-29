/**
 * @fileoverview 状态消息使用的文本表情映射。
 * @description 为成功、请求错误和服务错误提示提供不依赖图标资源的文本前缀。
 *
 * 用法
 * ElMessage.success(`${EmojiText[200]} 图片上传成功`)
 * ElMessage.error(`${EmojiText[400]} 图片上传失败`)
 * ElMessage.error(`${EmojiText[500]} 图片上传失败`)
 *
 * @module utils/ui/emojo
 */

/**
 * @description 按状态码或默认键索引的文本表情集合。
 * @type {Record<string, string>}
 * @example
 * ElMessage.success(`${EmojiText[200]} 图片上传成功`)
 */
const EmojiText: { [key: string]: string } = {
  '0': 'O_O', // 空
  '200': '^_^', // 成功
  '400': 'T_T', // 错误请求
  '500': 'X_X' // 服务器内部错误，无法完成请求
}

// const EmojiIcon = ['🟢', '🔴', '🟡 ', '🚀', '✨', '💡', '🛠️', '🔥', '🎉', '🌟', '🌈']

/**
 * @description 导出按状态码索引的文本表情集合。
 * @type {Record<string, string>}
 */
export default EmojiText
