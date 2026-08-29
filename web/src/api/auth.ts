/**
 * @fileoverview 认证与账号 API 客户端。
 * @description 封装登录、注册、用户资料读取与更新、密码修改等账号请求。
 */
import request from '@/utils/http'

/**
 * @description 使用账号、密码和角色登录。
 * @param {Api.Auth.LoginParams} params 登录参数。
 * @returns {Promise<Api.Auth.LoginResponse>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function fetchLogin(params: Api.Auth.LoginParams) {
  // 后端登录接口字段为 username / password
  return request.post<Api.Auth.LoginResponse>({
    url: '/api/auth/login',
    data: {
      username: params.userName,
      password: params.password,
      role: params.role
    }
  })
}

/**
 * @description 获取当前登录用户信息。
 * @returns {Promise<Api.Auth.UserInfo>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 * @example
 * const result = await fetchGetUserInfo()
 */
export function fetchGetUserInfo() {
  return request.get<Api.Auth.UserInfo>({
    url: '/api/auth/me',
    showUnauthorizedMessage: false
  })
}

/**
 * @description 描述允许用户更新的个人资料字段。
 * @typedef {object} UserProfilePayload
 * @property {string} [avatar] 头像地址。
 * @property {string} [realName] 真实姓名。
 * @property {string} [gender] 性别。
 * @property {string} [nickname] 昵称。
 * @property {string} [email] 电子邮箱。
 * @property {string} [phone] 手机号码。
 * @property {string} [address] 联系地址。
 * @property {string} [bio] 个人简介。
 */
export interface UserProfilePayload {
  avatar?: string
  realName?: string
  gender?: string
  nickname?: string
  email?: string
  phone?: string
  address?: string
  bio?: string
}

/**
 * @description 更新当前用户资料。
 * @param {UserProfilePayload} data 待更新的个人资料。
 * @returns {Promise<Api.Auth.UserInfo>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function updateUserProfile(data: UserProfilePayload) {
  return request.put<Api.Auth.UserInfo>({
    url: '/api/auth/profile',
    data
  })
}

/**
 * @description 注册新用户账号。
 * @param {{ username: string; password: string; avatar: string }} data 注册账号、密码和头像。
 * @param {string} data.username 登录用户名。
 * @param {string} data.password 登录密码。
 * @param {string} data.avatar 头像地址。
 * @returns {Promise<Api.Auth.RegisterResponse>} 接口请求结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function fetchRegister(data: { username: string; password: string; avatar: string }) {
  return request.post<Api.Auth.RegisterResponse>({
    url: '/api/auth/register',
    data,
    showErrorMessage: false
  })
}

/**
 * @description 修改当前用户密码。
 * @param {{ currentPassword: string; newPassword: string }} data 当前密码与新密码。
 * @param {string} data.currentPassword 当前密码。
 * @param {string} data.newPassword 新密码。
 * @returns {Promise<unknown>} 后端返回的密码修改结果。
 * @throws {Error} 网络异常、请求取消或后端返回错误时由请求层抛出。
 */
export function updateUserPassword(data: { currentPassword: string; newPassword: string }) {
  return request.put({
    url: '/api/auth/password',
    data
  })
}
