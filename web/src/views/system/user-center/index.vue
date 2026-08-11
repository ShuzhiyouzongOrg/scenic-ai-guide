<!-- 个人中心页面 -->
<template>
  <div class="user-center-page">
    <section class="profile-card art-card-sm">
      <img class="profile-cover" src="@imgs/user/bg.webp" alt="" />
      <button
        class="profile-avatar-button"
        type="button"
        :aria-label="t('app.profileChooseAvatar')"
        @click="avatarDialogVisible = true"
      >
        <img class="profile-avatar" :src="form.avatar || defaultAvatar" :alt="t('app.avatarAlt')" />
        <span class="avatar-edit-badge"><ArtSvgIcon icon="ri:camera-line" /></span>
      </button>
      <h2>{{ userInfo.userName || t('app.profileVisitor') }}</h2>
      <p class="profile-summary">{{ t('app.profileSummary') }}</p>

      <div class="profile-facts">
        <div
          ><ArtSvgIcon icon="ri:mail-line" /><span>{{
            form.email || t('app.profileUnset')
          }}</span></div
        >
        <div
          ><ArtSvgIcon icon="ri:user-3-line" /><span>{{ t('app.profileGuideRole') }}</span></div
        >
        <div
          ><ArtSvgIcon icon="ri:map-pin-line" /><span>{{ t('app.profileLocation') }}</span></div
        >
        <div
          ><ArtSvgIcon icon="ri:compass-3-line" /><span>{{ t('app.profileTeam') }}</span></div
        >
      </div>

      <h3>{{ t('app.profileTags') }}</h3>
      <div class="profile-tags">
        <ElTag v-for="tag in profileTags" :key="tag" effect="plain">{{ tag }}</ElTag>
      </div>
    </section>

    <div class="profile-forms">
      <section class="art-card-sm">
        <h1>{{ t('app.profileBasicSettings') }}</h1>
        <ElForm :model="form" :rules="rules" label-position="top" class="profile-form">
          <div class="form-grid">
            <ElFormItem :label="t('app.profileRealName')" prop="realName">
              <ElInput v-model="form.realName" :disabled="!editingProfile" />
            </ElFormItem>
            <ElFormItem :label="t('app.profileGender')" prop="gender">
              <ElSelect v-model="form.gender" :disabled="!editingProfile" class="w-full">
                <ElOption :label="t('app.profileMale')" value="male" />
                <ElOption :label="t('app.profileFemale')" value="female" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem :label="t('app.profileNickname')" prop="nickname">
              <ElInput v-model="form.nickname" :disabled="!editingProfile" />
            </ElFormItem>
            <ElFormItem :label="t('app.profileEmail')" prop="email">
              <ElInput v-model="form.email" :disabled="!editingProfile" />
            </ElFormItem>
            <ElFormItem :label="t('app.profilePhone')" prop="phone">
              <ElInput v-model="form.phone" :disabled="!editingProfile" />
            </ElFormItem>
            <ElFormItem :label="t('app.profileAddress')" prop="address">
              <ElInput v-model="form.address" :disabled="!editingProfile" />
            </ElFormItem>
          </div>
          <ElFormItem :label="t('app.profileBio')" prop="bio">
            <ElInput v-model="form.bio" type="textarea" :rows="4" :disabled="!editingProfile" />
          </ElFormItem>
          <div class="form-actions">
            <ElButton type="primary" :loading="profileSaving" @click="saveProfile">
              {{ editingProfile ? t('app.save') : t('app.edit') }}
            </ElButton>
          </div>
        </ElForm>
      </section>

      <section class="art-card-sm password-card">
        <h1>{{ t('app.profileChangePassword') }}</h1>
        <ElForm :model="passwordForm" label-position="top" class="password-form">
          <ElFormItem :label="t('app.profileCurrentPassword')">
            <ElInput
              v-model="passwordForm.currentPassword"
              type="password"
              show-password
              :disabled="!editingPassword"
            />
          </ElFormItem>
          <ElFormItem :label="t('app.profileNewPassword')">
            <ElInput
              v-model="passwordForm.newPassword"
              type="password"
              show-password
              :disabled="!editingPassword"
            />
          </ElFormItem>
          <ElFormItem :label="t('app.profileConfirmPassword')">
            <ElInput
              v-model="passwordForm.confirmPassword"
              type="password"
              show-password
              :disabled="!editingPassword"
            />
          </ElFormItem>
          <div class="form-actions">
            <ElButton type="primary" :loading="passwordSaving" @click="savePassword">
              {{ editingPassword ? t('app.save') : t('app.edit') }}
            </ElButton>
          </div>
        </ElForm>
      </section>
    </div>

    <ElDialog v-model="avatarDialogVisible" :title="t('app.profileChooseAvatar')" width="420px">
      <div class="dialog-avatar-grid">
        <button
          v-for="(avatar, index) in avatarOptions"
          :key="avatar"
          type="button"
          class="dialog-avatar-option"
          :class="{ selected: form.avatar === avatar }"
          :aria-label="t('register.avatarOption', { index: index + 1 })"
          @click="chooseAvatar(avatar)"
        >
          <img :src="avatar" :alt="t('app.avatarAlt')" />
          <span>{{ t('app.profileAvatarOption', { index: index + 1 }) }}</span>
        </button>
      </div>
      <template #footer>
        <ElButton @click="avatarDialogVisible = false">{{ t('app.cancel') }}</ElButton>
        <ElButton type="primary" @click="saveProfile">{{ t('app.save') }}</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { computed, reactive, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { ElMessage } from 'element-plus'
  import { updateUserPassword, updateUserProfile } from '@/api/auth'
  import { useUserStore } from '@/store/modules/user'
  import defaultAvatar from '@/assets/images/avatar/ling-avatar-1.webp'
  import avatar2 from '@/assets/images/avatar/ling-avatar-2.webp'
  import avatar3 from '@/assets/images/avatar/ling-avatar-3.webp'
  import avatar4 from '@/assets/images/avatar/ling-avatar-4.webp'
  import avatar5 from '@/assets/images/avatar/ling-avatar-5.webp'
  import avatar6 from '@/assets/images/avatar/ling-avatar-6.webp'

  defineOptions({ name: 'UserCenter' })

  const { t } = useI18n()
  const userStore = useUserStore()
  const userInfo = computed(() => userStore.getUserInfo)
  const avatarOptions = [defaultAvatar, avatar2, avatar3, avatar4, avatar5, avatar6]
  const profileTags = computed(() => [
    t('app.profileTagGuide'),
    t('app.profileTagCulture'),
    t('app.profileTagService')
  ])
  const editingProfile = ref(false)
  const editingPassword = ref(false)
  const profileSaving = ref(false)
  const passwordSaving = ref(false)
  const avatarDialogVisible = ref(false)

  const form = reactive({
    avatar: userInfo.value.avatar || defaultAvatar,
    realName: userInfo.value.realName || userInfo.value.userName || '',
    gender: userInfo.value.gender || 'female',
    nickname: userInfo.value.nickname || userInfo.value.userName || '',
    email: userInfo.value.email || '',
    phone: userInfo.value.phone || '',
    address: userInfo.value.address || '',
    bio: userInfo.value.bio || t('app.profileBioDefault')
  })
  const passwordForm = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const rules = computed(() => ({
    realName: [{ required: true, message: t('app.profileRealNameRequired'), trigger: 'blur' }],
    nickname: [{ required: true, message: t('app.profileNicknameRequired'), trigger: 'blur' }],
    email: [{ required: true, message: t('app.profileEmailRequired'), trigger: 'blur' }]
  }))

  function chooseAvatar(avatar: string) {
    form.avatar = avatar
  }

  async function saveProfile() {
    if (!editingProfile.value && !avatarDialogVisible.value) {
      editingProfile.value = true
      return
    }
    profileSaving.value = true
    try {
      const updated = await updateUserProfile(form)
      userStore.setUserInfo(updated)
      Object.assign(form, {
        avatar: updated.avatar || form.avatar,
        realName: updated.realName || form.realName,
        gender: updated.gender || form.gender,
        nickname: updated.nickname || form.nickname,
        email: updated.email || form.email,
        phone: updated.phone || form.phone,
        address: updated.address || form.address,
        bio: updated.bio || form.bio
      })
      editingProfile.value = false
      avatarDialogVisible.value = false
      ElMessage.success(t('app.profileSaved'))
    } catch {
      ElMessage.error(t('app.profileSaveFailed'))
    } finally {
      profileSaving.value = false
    }
  }

  async function savePassword() {
    if (!editingPassword.value) {
      editingPassword.value = true
      return
    }
    if (!passwordForm.currentPassword || passwordForm.newPassword.length < 6) {
      ElMessage.warning(t('app.profilePasswordRequired'))
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      ElMessage.warning(t('app.profilePasswordMismatch'))
      return
    }
    passwordSaving.value = true
    try {
      await updateUserPassword(passwordForm)
      Object.assign(passwordForm, { currentPassword: '', newPassword: '', confirmPassword: '' })
      editingPassword.value = false
      ElMessage.success(t('app.profilePasswordSaved'))
    } catch {
      ElMessage.error(t('app.profilePasswordFailed'))
    } finally {
      passwordSaving.value = false
    }
  }
</script>

<style scoped lang="scss">
  .user-center-page {
    display: grid;
    grid-template-columns: minmax(270px, 360px) minmax(0, 1fr);
    gap: 20px;
    padding: 12px 0 24px;
  }

  .profile-card {
    position: relative;
    min-height: 680px;
    padding: 0 28px 28px;
    overflow: hidden;
    text-align: center;
  }

  .profile-cover {
    width: calc(100% + 56px);
    height: 150px;
    margin-left: -28px;
    object-fit: cover;
  }

  .profile-avatar-button {
    position: relative;
    display: block;
    width: 96px;
    height: 96px;
    padding: 0;
    margin: -48px auto 0;
    cursor: pointer;
    background: #fff;
    border: 3px solid #fff;
    border-radius: 50%;
    box-shadow: 0 5px 16px rgb(31 70 65 / 18%);
  }

  .profile-avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .avatar-edit-badge {
    position: absolute;
    right: -2px;
    bottom: 0;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    color: #fff;
    background: var(--theme-color);
    border: 2px solid #fff;
    border-radius: 50%;
  }

  .profile-card h2 {
    margin: 18px 0 8px;
    font-size: 24px;
    font-weight: 500;
  }

  .profile-summary {
    color: var(--el-text-color-secondary);
  }

  .profile-facts {
    display: grid;
    gap: 13px;
    margin: 34px auto 28px;
    text-align: left;
  }

  .profile-facts div {
    display: flex;
    gap: 10px;
    align-items: center;
    color: var(--el-text-color-regular);
  }

  .profile-facts .art-svg-icon {
    color: var(--theme-color);
  }

  .profile-card h3 {
    margin: 28px 0 14px;
    font-size: 15px;
    font-weight: 600;
  }

  .profile-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }

  .profile-forms {
    display: grid;
    gap: 20px;
    min-width: 0;
  }

  .profile-forms > section {
    padding: 0 26px 22px;
  }

  .profile-forms h1 {
    padding: 20px 26px;
    margin: 0 -26px 22px;
    font-size: 22px;
    font-weight: 500;
    border-bottom: 1px solid var(--art-card-border);
  }

  .profile-form,
  .password-form {
    padding-top: 4px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 22px;
  }

  .w-full {
    width: 100%;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
  }

  .dialog-avatar-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .dialog-avatar-option {
    padding: 6px;
    color: var(--el-text-color-regular);
    cursor: pointer;
    background: transparent;
    border: 2px solid transparent;
    border-radius: 14px;
  }

  .dialog-avatar-option.selected {
    color: var(--theme-color);
    background: var(--el-color-primary-light-9);
    border-color: var(--theme-color);
  }

  .dialog-avatar-option img {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 50%;
  }

  .dialog-avatar-option span {
    display: block;
    margin-top: 6px;
    font-size: 12px;
  }

  @media (width <= 900px) {
    .user-center-page {
      grid-template-columns: 1fr;
    }

    .profile-card {
      min-height: auto;
    }
  }

  @media (width <= 600px) {
    .form-grid {
      grid-template-columns: 1fr;
    }

    .profile-forms > section {
      padding-inline: 16px;
    }

    .profile-forms h1 {
      padding-inline: 16px;
      margin-inline: -16px;
    }
  }
</style>
