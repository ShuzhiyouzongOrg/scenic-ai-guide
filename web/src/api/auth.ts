import request from '@/utils/http'

/**
 * 登录
 * @param params 登录参数
 * @returns 登录响应
 */
export function fetchLogin(params: Api.Auth.LoginParams) {
  // 后端登录接口字段为 username / password
  return request.post<Api.Auth.LoginResponse>({
    url: '/api/auth/login',
    data: {
      username: params.userName,
      password: params.password
    }
  })
}

/**
 * 获取用户信息
 * @returns 用户信息
 */
export function fetchGetUserInfo() {
  return request.get<Api.Auth.UserInfo>({
    url: '/api/auth/me'
  })
}

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

export function updateUserProfile(data: UserProfilePayload) {
  return request.put<Api.Auth.UserInfo>({
    url: '/api/auth/profile',
    data
  })
}

export function fetchRegister(data: { username: string; password: string; avatar: string }) {
  return request.post<Api.Auth.RegisterResponse>({
    url: '/api/auth/register',
    data,
    showErrorMessage: false
  })
}

export function updateUserPassword(data: { currentPassword: string; newPassword: string }) {
  return request.put({
    url: '/api/auth/password',
    data
  })
}
