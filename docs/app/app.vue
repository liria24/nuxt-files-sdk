<script setup lang="ts">
import * as uiLocales from '@nuxt/ui/locale'
import { withFilesLocales } from 'nuxt-files-sdk/ui/locale'

const { locale } = useI18n()
const locales = withFilesLocales(uiLocales)

useHead({
    htmlAttrs: {
        lang: () => locale.value,
        class: 'scrollbar-thin scrollbar-thumb-(--ui-bg-accented) scrollbar-track-transparent',
    },
})
</script>

<template>
    <UApp :locale="locales[locale]">
        <NuxtLoadingIndicator color="var(--ui-primary)" />
        <NuxtRouteAnnouncer />
        <NuxtLayout>
            <NuxtPage />
        </NuxtLayout>
    </UApp>
</template>
