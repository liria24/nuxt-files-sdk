<script setup lang="ts">
const adapter = import.meta.server ? (await import('nuxt-files-sdk/runtime')).useServerFiles().adapter.name : 'client'
</script>
<template>
    <p id="files-ssr">Files SSR: {{ adapter }}</p>
</template>
