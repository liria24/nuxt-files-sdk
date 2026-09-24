<script setup lang="ts">
import type { StoredFile } from 'files-sdk'

const files = useDemoFiles()

const selected = shallowRef<StoredFile>()
</script>

<template>
    <ClientOnly>
        <div class="border-default bg-default my-6 rounded-lg border p-4">
            <FilesBrowser v-model:selected="selected" :files="files" :thumbnails="false" />
        </div>
        <template #fallback><div class="bg-muted my-6 h-24 animate-pulse rounded-lg" /></template>
    </ClientOnly>
</template>
