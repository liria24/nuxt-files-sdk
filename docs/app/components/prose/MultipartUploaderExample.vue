<script setup lang="ts">
import type { UseFilesReturn } from 'files-sdk/vue'

const files = useDemoFiles()

const uploads = ref<File[]>([])
const uploadFiles = {
    ...files,
    isUploading: ref(false),
    uploads: ref([]),
    progress: ref({ loaded: 0, total: 0, fraction: 0 }),
    error: ref(),
    reset: () => {},
    abort: () => {},
} satisfies UseFilesReturn
</script>

<template>
    <ClientOnly>
        <div class="border-default bg-default my-6 rounded-lg border p-4">
            <FilesMultipartUploader v-model="uploads" :files="uploadFiles" prefix="uploads/" />
        </div>
        <template #fallback><div class="bg-muted my-6 h-24 animate-pulse rounded-lg" /></template>
    </ClientOnly>
</template>
