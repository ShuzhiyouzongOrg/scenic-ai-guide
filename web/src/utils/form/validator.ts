/**
 * @fileoverview 常用表单字段校验工具。
 * @description 校验中国大陆电话、账号、密码、IPv4、邮箱、URL、身份证与银行卡格式，并评估密码强度。
 */

/**
 * @description 表单密码强度的中文展示级别。
 * @enum {string}
 * @example
 * PasswordStrength.STRONG
 */
export enum PasswordStrength {
  WEAK = '弱',
  MEDIUM = '中',
  STRONG = '强'
}

/**
 * @description 去除字符串首尾空白；运行时收到非字符串时返回空字符串。
 * @param {string} value 待清理的表单文本。
 * @returns {string} 去除首尾空白后的文本。
 * @example
 * trimSpaces('  灵山胜境  ')
 */
export function trimSpaces(value: string): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

/**
 * @description 校验以 1 开头、第二位为 3 至 9 且共 11 位的中国大陆手机号。
 * @param {string} value 待校验的手机号码。
 * @returns {boolean} 去除首尾空白后的号码符合规则时返回 `true`。
 * @example
 * validatePhone('13800138000')
 */
export function validatePhone(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  // 中国大陆手机号码：1开头，第二位为3-9，共11位数字
  const phoneRegex = /^1[3-9]\d{9}$/
  return phoneRegex.test(value.trim())
}

/**
 * @description 校验包含三至四位区号和七至八位本地号码的中国大陆固定电话，可带连字符。
 * @param {string} value 待校验的固定电话号码。
 * @returns {boolean} 删除空白后的号码符合固定电话规则时返回 `true`。
 * @example
 * validateTelPhone('0510-12345678')
 */
export function validateTelPhone(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  // 支持格式：区号-号码，如：010-12345678、0755-1234567
  const telRegex = /^0\d{2,3}-?\d{7,8}$/
  return telRegex.test(value.trim().replace(/\s+/g, ''))
}

/**
 * @description 校验以字母开头、总长 5 至 20 位且仅含字母、数字和下划线的用户账号。
 * @param {string} value 待校验的账号文本。
 * @returns {boolean} 去除首尾空白后的账号符合规则时返回 `true`。
 * @example
 * validateAccount('guide_admin')
 */
export function validateAccount(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  // 字母开头，5-20位，支持字母、数字、下划线
  const accountRegex = /^[a-zA-Z][a-zA-Z0-9_]{4,19}$/
  return accountRegex.test(value.trim())
}

/**
 * @description 校验长度为 6 至 20 位且同时包含字母与数字的基础密码。
 * @param {string} value 待校验的密码文本。
 * @returns {boolean} 去除首尾空白后的密码满足长度与字符组合要求时返回 `true`。
 * @example
 * validatePassword('guide2026')
 */
export function validatePassword(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  const trimmedValue = value.trim()

  // 长度检查
  if (trimmedValue.length < 6 || trimmedValue.length > 20) {
    return false
  }

  // 必须包含字母和数字
  const hasLetter = /[a-zA-Z]/.test(trimmedValue)
  const hasNumber = /\d/.test(trimmedValue)

  return hasLetter && hasNumber
}

/**
 * @description 校验长度为 8 至 20 位且包含大小写字母、数字和指定特殊字符的强密码。
 * @param {string} value 待校验的密码文本。
 * @returns {boolean} 去除首尾空白后的密码满足全部强度条件时返回 `true`。
 * @example
 * validateStrongPassword('Guide@2026')
 */
export function validateStrongPassword(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  const trimmedValue = value.trim()

  // 长度检查
  if (trimmedValue.length < 8 || trimmedValue.length > 20) {
    return false
  }

  // 必须包含：大写字母、小写字母、数字、特殊字符
  const hasUpperCase = /[A-Z]/.test(trimmedValue)
  const hasLowerCase = /[a-z]/.test(trimmedValue)
  const hasNumber = /\d/.test(trimmedValue)
  const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(trimmedValue)

  return hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar
}

/**
 * @description 按大写字母、小写字母、数字和特殊字符的种类数评估密码强度。
 * @param {string} value 待评估的密码文本。
 * @returns {PasswordStrength} 少于六位或仅一种字符为弱，两种为中，三种及以上为强。
 * @example
 * getPasswordStrength('Guide@2026')
 */
export function getPasswordStrength(value: string): PasswordStrength {
  if (!value || typeof value !== 'string') {
    return PasswordStrength.WEAK
  }

  const trimmedValue = value.trim()

  if (trimmedValue.length < 6) {
    return PasswordStrength.WEAK
  }

  const hasUpperCase = /[A-Z]/.test(trimmedValue)
  const hasLowerCase = /[a-z]/.test(trimmedValue)
  const hasNumber = /\d/.test(trimmedValue)
  const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(trimmedValue)

  const typeCount = [hasUpperCase, hasLowerCase, hasNumber, hasSpecialChar].filter(Boolean).length

  if (typeCount >= 3) {
    return PasswordStrength.STRONG
  } else if (typeCount >= 2) {
    return PasswordStrength.MEDIUM
  } else {
    return PasswordStrength.WEAK
  }
}

/**
 * @description 校验四段十进制 IPv4 地址，并确保每段数值位于 0 至 255。
 * @param {string} value 待校验的 IPv4 地址文本。
 * @returns {boolean} 地址格式及每个数值段均有效时返回 `true`。
 * @example
 * validateIPv4Address('192.168.1.10')
 */
export function validateIPv4Address(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  const trimmedValue = value.trim()
  const ipRegex = /^((25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(25[0-5]|2[0-4]\d|[01]?\d{1,2})$/

  if (!ipRegex.test(trimmedValue)) {
    return false
  }

  // 额外检查每个段是否在有效范围内
  const segments = trimmedValue.split('.')
  return segments.every((segment) => {
    const num = parseInt(segment, 10)
    return num >= 0 && num <= 255
  })
}

/**
 * @description 使用简化 RFC 5322 规则校验不超过 254 个字符的邮箱地址。
 * @param {string} value 待校验的邮箱地址。
 * @returns {boolean} 去除首尾空白后的邮箱格式与长度均有效时返回 `true`。
 * @example
 * validateEmail('guide@example.com')
 */
export function validateEmail(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  const trimmedValue = value.trim()

  // RFC 5322 标准的简化版邮箱正则
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

  return emailRegex.test(trimmedValue) && trimmedValue.length <= 254
}

/**
 * @description 使用浏览器 `URL` 构造器校验绝对 URL 文本。
 * @param {string} value 待校验的 URL。
 * @returns {boolean} 去除首尾空白后能够构造 URL 时返回 `true`。
 * @example
 * validateURL('https://www.shuzhiyouzong.cn/')
 */
export function validateURL(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  try {
    new URL(value.trim())
    return true
  } catch {
    return false
  }
}

/**
 * @description 校验中国大陆 18 位身份证的行政区、出生日期格式及加权校验码。
 * @param {string} value 待校验的身份证号码。
 * @returns {boolean} 基础格式与第 18 位校验码均正确时返回 `true`。
 * @example
 * validateChineseIDCard('11010519491231002X')
 */
export function validateChineseIDCard(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  const trimmedValue = value.trim()

  // 18位身份证号码正则
  const idCardRegex =
    /^[1-9]\d{5}(18|19|20)\d{2}((0[1-9])|(1[0-2]))(([0-2][1-9])|10|20|30|31)\d{3}[0-9Xx]$/

  if (!idCardRegex.test(trimmedValue)) {
    return false
  }

  // 验证校验码
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

  let sum = 0
  for (let i = 0; i < 17; i++) {
    sum += parseInt(trimmedValue[i]) * weights[i]
  }

  const checkCode = checkCodes[sum % 11]
  return trimmedValue[17].toUpperCase() === checkCode
}

/**
 * @description 删除空白后校验 13 至 19 位数字银行卡号，并执行 Luhn 校验。
 * @param {string} value 待校验的银行卡号。
 * @returns {boolean} 长度、数字格式与 Luhn 校验均通过时返回 `true`。
 * @example
 * validateBankCard('4532015112830366')
 */
export function validateBankCard(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  const trimmedValue = value.trim().replace(/\s+/g, '')

  // 银行卡号通常为13-19位数字
  if (!/^\d{13,19}$/.test(trimmedValue)) {
    return false
  }

  // Luhn算法验证
  let sum = 0
  let shouldDouble = false

  for (let i = trimmedValue.length - 1; i >= 0; i--) {
    let digit = parseInt(trimmedValue[i])

    if (shouldDouble) {
      digit *= 2
      if (digit > 9) {
        digit = (digit % 10) + 1
      }
    }

    sum += digit
    shouldDouble = !shouldDouble
  }

  return sum % 10 === 0
}
