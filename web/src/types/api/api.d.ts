/**
 * @fileoverview 后端 API 全局类型声明。
 * @description 通过 Api 命名空间声明分页、认证、用户和角色管理请求响应类型。
 */
/**
 * @description API 接口类型定义模块
 *
 * 提供所有后端接口的类型定义
 *
 * ## 主要功能
 *
 * - 通用类型（分页参数、响应结构等）
 * - 认证类型（登录、用户信息等）
 * - 系统管理类型（用户、角色等）
 * - 全局命名空间声明
 *
 * ## 使用场景
 *
 * - API 请求参数类型约束
 * - API 响应数据类型定义
 * - 接口文档类型同步
 *
 * ## 注意事项
 *
 * - 在 .vue 文件使用需要在 eslint.config.mjs 中配置 globals: { Api: 'readonly' }
 * - 使用全局命名空间，无需导入即可使用
 *
 * ## 使用方式
 *
 * ```typescript
 * const params: Api.Auth.LoginParams = { userName: 'admin', password: '123456', role: 'admin' }
 * const response: Api.Auth.UserInfo = await fetchUserInfo()
 * ```
 *
 * @module types/api/api
 * @author Scenic AI Guide Team
 */

declare namespace Api {
  /**
   * @description 通用类型
   */
  namespace Common {
    /**
     * @description 分页参数
     */
    interface PaginationParams {
      /**
       * @description 当前页码
       */
      current: number
      /**
       * @description 每页条数
       */
      size: number
      /**
       * @description 总条数
       */
      total: number
    }

    /**
     * @description 通用搜索参数
     */
    type CommonSearchParams = Pick<PaginationParams, 'current' | 'size'>

    /**
     * @description 分页响应基础结构
     */
    interface PaginatedResponse<T = any> {
      records: T[]
      current: number
      size: number
      total: number
    }

    /**
     * @description 启用状态
     */
    type EnableStatus = '1' | '2'
  }

  /**
   * @description 认证类型
   */
  namespace Auth {
    /**
     * @description 登录参数
     */
    interface LoginParams {
      userName: string
      password: string
      role: 'admin' | 'operator' | 'visitor'
    }

    /**
     * @description 登录响应
     */
    interface LoginResponse {
      token: string
      refreshToken: string
    }

    interface RegisterResponse {
      userId: number | string
      userName: string
      avatar: string
      role: string
    }

    /**
     * @description 用户信息
     */
    interface UserInfo {
      buttons: string[]
      roles: string[]
      permissions: string[]
      userId: number | string
      userName: string
      email: string
      avatar?: string
      realName?: string
      gender?: string
      nickname?: string
      phone?: string
      address?: string
      bio?: string
    }
  }

  /**
   * @description 系统管理类型
   */
  namespace SystemManage {
    /**
     * @description 用户列表
     */
    type UserList = Api.Common.PaginatedResponse<UserListItem>

    /**
     * @description 用户列表项
     */
    interface UserListItem {
      id: number
      avatar: string
      status: string
      userName: string
      userGender: string
      nickName: string
      userPhone: string
      userEmail: string
      userRoles: string[]
      createBy: string
      createTime: string
      updateBy: string
      updateTime: string
    }

    /**
     * @description 用户搜索参数
     */
    type UserSearchParams = Partial<
      Pick<UserListItem, 'id' | 'userName' | 'userGender' | 'userPhone' | 'userEmail' | 'status'> &
        Api.Common.CommonSearchParams
    >

    /**
     * @description 角色列表
     */
    type RoleList = Api.Common.PaginatedResponse<RoleListItem>

    /**
     * @description 角色列表项
     */
    interface RoleListItem {
      roleId: number
      roleName: string
      roleCode: string
      description: string
      enabled: boolean
      createTime: string
    }

    /**
     * @description 角色搜索参数
     */
    type RoleSearchParams = Partial<
      Pick<RoleListItem, 'roleId' | 'roleName' | 'roleCode' | 'description' | 'enabled'> &
        Api.Common.CommonSearchParams & {
          startTime: string | null
          endTime: string | null
        }
    >
  }
}
