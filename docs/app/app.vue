<script setup lang="ts">
import * as locales from '@nuxt/ui/locale'

const { locale } = useI18n()

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
