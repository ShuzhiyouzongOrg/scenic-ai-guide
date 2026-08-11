<!-- 用户管理页面 -->
<template>
  <div class="system-list-page">
    <ElCard class="search-card" shadow="never">
      <ElForm :model="filters" inline>
        <ElFormItem :label="t('app.usersLoginName')">
          <ElInput v-model="filters.username" clearable :placeholder="t('app.usersUsernamePlaceholder')" />
        </ElFormItem>
        <ElFormItem :label="t('app.usersRole')">
          <ElSelect v-model="filters.role" clearable :placeholder="t('app.roleSelectPlaceholder')" style="width: 160px">
            <ElOption v-for="role in roles" :key="role.roleCode" :label="role.roleName" :value="role.roleCode" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem :label="t('app.status')">
          <ElSelect v-model="filters.status" clearable :placeholder="t('app.statusSelectPlaceholder')" style="width: 140px">
            <ElOption :label="t('app.usersActive')" value="active" />
            <ElOption :label="t('app.disable')" value="disabled" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" @click="page = 1">{{ t('app.search') }}</ElButton>
          <ElButton @click="resetFilters">{{ t('app.reset') }}</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <ElCard class="table-card" shadow="never">
      <div class="table-toolbar">
        <ElButton type="primary" @click="openCreate">{{ t('app.usersAdd') }}</ElButton>
        <ElButton :loading="loading" @click="load">{{ t('app.refresh') }}</ElButton>
      </div>
      <ElTable :data="pagedUsers" v-loading="loading" stripe>
        <ElTableColumn type="index" :label="t('app.sequence')" width="70" />
        <ElTableColumn :label="t('app.usersDisplayName')" min-width="220">
          <template #default="{ row }">
            <div class="user-cell">
              <ElAvatar :size="40" :src="row.avatar || defaultAvatar" />
              <div><strong>{{ row.displayName || row.username }}</strong><small>{{ row.username }}</small></div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="role" :label="t('app.usersRole')" width="150">
          <template #default="{ row }"><ElTag>{{ roleName(row.role) }}</ElTag></template>
        </ElTableColumn>
        <ElTableColumn :label="t('app.status')" width="120">
          <template #default="{ row }"><ElTag :type="row.status === 'active' ? 'success' : 'info'">{{ statusName(row.status) }}</ElTag></template>
        </ElTableColumn>
        <ElTableColumn prop="createdAt" :label="t('app.createdAt')" min-width="190">
          <template #default="{ row }">{{ formatDateTime(row.createdAt, locale) }}</template>
        </ElTableColumn>
        <ElTableColumn :label="t('app.actions')" width="260" fixed="right">
          <template #default="{ row }">
            <ElButton link type="primary" @click="openEdit(row)">{{ t('app.edit') }}</ElButton>
            <ElButton link :type="row.status === 'active' ? 'warning' : 'success'" @click="toggleStatus(row)">{{ row.status === 'active' ? t('app.disable') : t('app.enabled') }}</ElButton>
            <ElPopconfirm :title="t('app.usersDeleteConfirm')" @confirm="remove(row)">
              <template #reference><ElButton link type="danger" :disabled="row.username === 'admin'">{{ t('app.usersDelete') }}</ElButton></template>
            </ElPopconfirm>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElEmpty v-if="!loading && !filteredUsers.length" :description="t('app.noData')" />
      <div class="pagination-wrap">
        <span>{{ t('app.totalItems', { count: filteredUsers.length }) }}</span>
        <ElPagination v-model:current-page="page" v-model:page-size="pageSize" :total="filteredUsers.length" :page-sizes="[10, 20, 50]" layout="sizes, prev, pager, next" />
      </div>
    </ElCard>

    <ElDialog v-model="dialogVisible" :title="editing ? t('app.usersEdit') : t('app.usersAdd')" width="520px">
      <ElForm :model="form" label-position="top">
        <ElFormItem :label="t('app.usersLoginName')" required><ElInput v-model="form.username" :disabled="editing" /></ElFormItem>
        <ElFormItem :label="t('app.usersDisplayName')"><ElInput v-model="form.displayName" /></ElFormItem>
        <ElFormItem :label="editing ? t('app.usersResetPassword') : t('app.usersPassword')" :required="!editing"><ElInput v-model="form.password" type="password" show-password :placeholder="editing ? t('app.usersKeepPassword') : t('app.usersPasswordPlaceholder')" /></ElFormItem>
        <ElFormItem :label="t('app.usersRole')"><ElSelect v-model="form.role" class="w-full"><ElOption v-for="role in roles" :key="role.roleCode" :label="role.roleName" :value="role.roleCode" /></ElSelect></ElFormItem>
      </ElForm>
      <template #footer><ElButton @click="dialogVisible = false">{{ t('app.cancel') }}</ElButton><ElButton type="primary" :loading="saving" @click="save">{{ t('app.save') }}</ElButton></template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { ElMessage } from 'element-plus'
  import { formatDateTime } from '@/utils/date'
  import { createAdminUser2, getAdminRoles, getAdminUsers, updateAdminUser, deleteAdminUser, type AdminRole, type AdminUser } from '@/api/admin'
  import defaultAvatar from '@/assets/images/avatar/ling-avatar-1.webp'

  defineOptions({ name: 'SystemUser' })
  const { t, locale } = useI18n()
  const users = ref<AdminUser[]>([])
  const roles = ref<AdminRole[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const dialogVisible = ref(false)
  const editing = ref(false)
  const editingId = ref('')
  const page = ref(1)
  const pageSize = ref(20)
  const filters = reactive({ username: '', role: '', status: '' })
  const form = reactive({ username: '', displayName: '', password: '', role: 'operator' })

  const filteredUsers = computed(() => users.value.filter((item) =>
    (!filters.username || item.username.toLowerCase().includes(filters.username.toLowerCase()) || item.displayName.toLowerCase().includes(filters.username.toLowerCase())) &&
    (!filters.role || item.role === filters.role) && (!filters.status || item.status === filters.status)
  ))
  const pagedUsers = computed(() => filteredUsers.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
  const roleName = (code: string) => roles.value.find((role) => role.roleCode === code)?.roleName || code
  const statusName = (status: string) => status === 'active' ? t('app.usersActive') : t('app.disable')

  async function load() {
    loading.value = true
    try {
      const [userRows, roleRows] = await Promise.all([getAdminUsers(), getAdminRoles()])
      users.value = userRows
      roles.value = roleRows
      if (!roles.value.some((role) => role.roleCode === form.role)) form.role = roles.value[0]?.roleCode || 'operator'
    } catch {
      ElMessage.error(t('app.usersListFailed'))
    } finally { loading.value = false }
  }
  function resetFilters() { Object.assign(filters, { username: '', role: '', status: '' }); page.value = 1 }
  function openCreate() { Object.assign(form, { username: '', displayName: '', password: '', role: roles.value[0]?.roleCode || 'operator' }); editing.value = false; editingId.value = ''; dialogVisible.value = true }
  function openEdit(row: AdminUser) { Object.assign(form, { username: row.username, displayName: row.displayName, password: '', role: row.role }); editing.value = true; editingId.value = row.id; dialogVisible.value = true }
  async function save() {
    if (!form.username.trim() || (!editing.value && !form.password)) { ElMessage.warning(t('app.usersRequired')); return }
    saving.value = true
    try {
      if (editing.value) await updateAdminUser(editingId.value, { displayName: form.displayName, role: form.role, ...(form.password ? { password: form.password } : {}) })
      else await createAdminUser2({ ...form })
      dialogVisible.value = false
      ElMessage.success(t('app.usersSaved'))
      await load()
    } catch (error: any) { ElMessage.error(error?.message || t('app.usersActionFailed')) }
    finally { saving.value = false }
  }
  async function toggleStatus(row: AdminUser) { try { await updateAdminUser(row.id, { status: row.status === 'active' ? 'disabled' : 'active' }); await load() } catch { ElMessage.error(t('app.usersActionFailed')) } }
  async function remove(row: AdminUser) { try { await deleteAdminUser(row.id); ElMessage.success(t('app.usersDeleted')); await load() } catch (error: any) { ElMessage.error(error?.message || t('app.usersDeleteFailed')) } }
  onMounted(load)
</script>

<style scoped lang="scss">
  .system-list-page { display: grid; gap: 16px; padding: 12px 0 24px; }
  .search-card, .table-card { border: 1px solid var(--art-card-border); }
  .table-toolbar { display: flex; gap: 10px; margin-bottom: 18px; }
  .user-cell { display: flex; gap: 10px; align-items: center; }
  .user-cell div { display: grid; gap: 3px; }
  .user-cell small { color: var(--el-text-color-secondary); }
  .pagination-wrap { display: flex; align-items: center; justify-content: space-between; padding-top: 18px; }
  .w-full { width: 100%; }
  @media (max-width: 700px) { .pagination-wrap { display: grid; gap: 10px; justify-content: center; } }
</style>
