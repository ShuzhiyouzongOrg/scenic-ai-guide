<!-- 角色管理页面 -->
<template>
  <div class="system-list-page">
    <ElCard class="search-card" shadow="never">
      <ElForm :model="filters" inline>
        <ElFormItem :label="t('app.roleName')"
          ><ElInput
            v-model="filters.roleName"
            clearable
            :placeholder="t('app.roleNamePlaceholder')"
        /></ElFormItem>
        <ElFormItem :label="t('app.roleCode')"
          ><ElInput
            v-model="filters.roleCode"
            clearable
            :placeholder="t('app.roleCodePlaceholder')"
        /></ElFormItem>
        <ElFormItem :label="t('app.status')"
          ><ElSelect
            v-model="filters.enabled"
            clearable
            :placeholder="t('app.statusSelectPlaceholder')"
            style="width: 140px"
            ><ElOption :label="t('app.enabled')" :value="true" /><ElOption
              :label="t('app.disable')"
              :value="false" /></ElSelect
        ></ElFormItem>
        <ElFormItem
          ><ElButton type="primary" @click="page = 1">{{ t('app.search') }}</ElButton
          ><ElButton @click="resetFilters">{{ t('app.reset') }}</ElButton></ElFormItem
        >
      </ElForm>
    </ElCard>

    <ElCard class="table-card" shadow="never">
      <div class="table-toolbar"
        ><ElButton type="primary" @click="openCreate">{{ t('app.roleAdd') }}</ElButton
        ><ElButton :loading="loading" @click="load">{{ t('app.refresh') }}</ElButton></div
      >
      <ElTable :data="pagedRoles" v-loading="loading" stripe>
        <ElTableColumn prop="roleId" :label="t('app.roleId')" width="90" />
        <ElTableColumn prop="roleName" :label="t('app.roleName')" min-width="150" />
        <ElTableColumn prop="roleCode" :label="t('app.roleCode')" min-width="150" />
        <ElTableColumn
          prop="description"
          :label="t('app.roleDescription')"
          min-width="230"
          show-overflow-tooltip
        />
        <ElTableColumn :label="t('app.status')" width="120"
          ><template #default="{ row }"
            ><ElTag :type="row.enabled ? 'success' : 'warning'">{{
              row.enabled ? t('app.enabled') : t('app.disable')
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn prop="createTime" :label="t('app.createdAt')" min-width="190"
          ><template #default="{ row }">{{
            formatDateTime(row.createTime, locale)
          }}</template></ElTableColumn
        >
        <ElTableColumn :label="t('app.actions')" width="250" fixed="right"
          ><template #default="{ row }"
            ><ElButton link type="primary" @click="openPermission(row)">{{
              t('app.rolePermissions')
            }}</ElButton
            ><ElButton link type="primary" @click="openEdit(row)">{{ t('app.edit') }}</ElButton
            ><ElButton link type="danger" :disabled="isBuiltIn(row)" @click="remove(row)">{{
              t('app.usersDelete')
            }}</ElButton></template
          ></ElTableColumn
        >
      </ElTable>
      <ElEmpty v-if="!loading && !filteredRoles.length" :description="t('app.noData')" />
      <div class="pagination-wrap"
        ><span>{{ t('app.totalItems', { count: filteredRoles.length }) }}</span
        ><ElPagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="filteredRoles.length"
          :page-sizes="[10, 20, 50]"
          layout="sizes, prev, pager, next"
      /></div>
    </ElCard>

    <ElDialog
      v-model="dialogVisible"
      :title="editing ? t('app.roleEdit') : t('app.roleAdd')"
      width="520px"
    >
      <ElForm :model="form" label-position="top">
        <ElFormItem :label="t('app.roleName')" required
          ><ElInput v-model="form.roleName"
        /></ElFormItem>
        <ElFormItem :label="t('app.roleCode')" required
          ><ElInput v-model="form.roleCode" :disabled="editing"
        /></ElFormItem>
        <ElFormItem :label="t('app.roleDescription')"
          ><ElInput v-model="form.description" type="textarea" :rows="3"
        /></ElFormItem>
        <ElFormItem :label="t('app.status')"
          ><ElSwitch
            v-model="form.enabled"
            :active-text="t('app.enabled')"
            :inactive-text="t('app.disable')"
        /></ElFormItem>
      </ElForm>
      <template #footer
        ><ElButton @click="dialogVisible = false">{{ t('app.cancel') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="save">{{
          t('app.save')
        }}</ElButton></template
      >
    </ElDialog>

    <ElDialog v-model="permissionVisible" :title="t('app.rolePermissions')" width="560px">
      <p class="permission-hint">{{ t('app.rolePermissionHint') }}</p>
      <ElTree
        ref="treeRef"
        :data="permissionOptions"
        node-key="id"
        show-checkbox
        default-expand-all
        :default-checked-keys="selectedPermissions"
      />
      <template #footer
        ><ElButton @click="permissionVisible = false">{{ t('app.cancel') }}</ElButton
        ><ElButton type="primary" :loading="permissionSaving" @click="savePermissions">{{
          t('app.save')
        }}</ElButton></template
      >
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import {
    createAdminRole,
    deleteAdminRole,
    getAdminRoles,
    updateAdminRole,
    updateAdminRolePermissions,
    type AdminRole
  } from '@/api/admin'
  import { formatDateTime } from '@/utils/date'

  defineOptions({ name: 'SystemRole' })
  const { t, locale } = useI18n()
  const roles = ref<AdminRole[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const permissionSaving = ref(false)
  const dialogVisible = ref(false)
  const permissionVisible = ref(false)
  const editing = ref(false)
  const editingId = ref(0)
  const permissionRoleId = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const treeRef = ref<any>()
  const filters = reactive<{ roleName: string; roleCode: string; enabled: boolean | undefined }>({
    roleName: '',
    roleCode: '',
    enabled: undefined
  })
  const form = reactive({ roleName: '', roleCode: '', description: '', enabled: true })
  const selectedPermissions = ref<string[]>([])
  const permissionOptions = computed(() => [
    {
      id: '/guide',
      label: t('app.navGuide'),
      children: [
        { id: '/guide/experience', label: t('app.navGuideExperience') },
        { id: '/guide/map', label: t('app.navGuideMap') }
      ]
    },
    { id: '/admin/knowledge', label: t('app.navKnowledge') },
    { id: '/admin/operation', label: t('app.navOperation') },
    { id: '/system/user', label: t('menus.system.user') },
    { id: '/system/role', label: t('menus.system.role') },
    { id: '/help/docs', label: t('menus.help.document') },
    { id: '/change/log', label: t('menus.plan.log') }
  ])
  const filteredRoles = computed(() =>
    roles.value.filter(
      (item) =>
        (!filters.roleName || item.roleName.includes(filters.roleName)) &&
        (!filters.roleCode || item.roleCode.includes(filters.roleCode)) &&
        (filters.enabled === undefined || item.enabled === filters.enabled)
    )
  )
  const pagedRoles = computed(() =>
    filteredRoles.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  )

  async function load() {
    loading.value = true
    try {
      roles.value = await getAdminRoles()
    } catch {
      ElMessage.error(t('app.roleListFailed'))
    } finally {
      loading.value = false
    }
  }
  function resetFilters() {
    Object.assign(filters, { roleName: '', roleCode: '', enabled: undefined })
    page.value = 1
  }
  function openCreate() {
    Object.assign(form, { roleName: '', roleCode: '', description: '', enabled: true })
    editing.value = false
    editingId.value = 0
    dialogVisible.value = true
  }
  function openEdit(row: AdminRole) {
    Object.assign(form, {
      roleName: row.roleName,
      roleCode: row.roleCode,
      description: row.description,
      enabled: row.enabled
    })
    editing.value = true
    editingId.value = row.roleId
    dialogVisible.value = true
  }
  function isBuiltIn(row: AdminRole) {
    return ['admin', 'operator', 'visitor'].includes(row.roleCode)
  }
  async function save() {
    if (!form.roleName.trim() || !form.roleCode.trim()) {
      ElMessage.warning(t('app.roleRequired'))
      return
    }
    saving.value = true
    try {
      if (editing.value) await updateAdminRole(editingId.value, form)
      else await createAdminRole(form)
      dialogVisible.value = false
      ElMessage.success(t('app.roleSaved'))
      await load()
    } catch (error: any) {
      ElMessage.error(error?.message || t('app.roleSaveFailed'))
    } finally {
      saving.value = false
    }
  }
  function openPermission(row: AdminRole) {
    permissionRoleId.value = row.roleId
    selectedPermissions.value = row.permissions || []
    permissionVisible.value = true
  }
  async function savePermissions() {
    permissionSaving.value = true
    try {
      const keys = (treeRef.value?.getCheckedKeys?.() || []) as string[]
      await updateAdminRolePermissions(permissionRoleId.value, keys)
      permissionVisible.value = false
      ElMessage.success(t('app.rolePermissionsSaved'))
      await load()
    } catch {
      ElMessage.error(t('app.roleSaveFailed'))
    } finally {
      permissionSaving.value = false
    }
  }
  async function remove(row: AdminRole) {
    try {
      await ElMessageBox.confirm(t('app.roleDeleteConfirm'), t('app.roleDeleteTitle'), {
        type: 'warning',
        confirmButtonText: t('app.confirm'),
        cancelButtonText: t('app.cancel')
      })
      await deleteAdminRole(row.roleId)
      ElMessage.success(t('app.usersDeleted'))
      await load()
    } catch {
      /* cancelled */
    }
  }
  onMounted(load)
</script>

<style scoped lang="scss">
  .system-list-page {
    display: grid;
    gap: 16px;
    padding: 12px 0 24px;
  }

  .search-card,
  .table-card {
    border: 1px solid var(--art-card-border);
  }

  .table-toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 18px;
  }

  .pagination-wrap {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 18px;
  }

  .permission-hint {
    margin: 0 0 14px;
    color: var(--el-text-color-secondary);
  }

  @media (width <= 700px) {
    .pagination-wrap {
      display: grid;
      gap: 10px;
      justify-content: center;
    }
  }
</style>
