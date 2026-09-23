import NuxtIcon from '@nuxt/icon/runtime/components/index.js'
import { defineNuxtPlugin, useAppConfig } from 'nuxt/app'
import { computed } from 'vue'

import { createFilesUi } from './context'
import type { FilesAppConfig } from './theme'

export default defineNuxtPlugin((nuxtApp) => {
    const appConfig = useAppConfig() as FilesAppConfig
    nuxtApp.vueApp.use(createFilesUi({ config: computed(() => appConfig), icon: NuxtIcon }))
})
