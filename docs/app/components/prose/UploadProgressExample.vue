<script setup lang="ts">
import type { UseFilesReturn } from 'files-sdk/vue'

const files = useDemoFiles()

const demoFile = new Blob(['demo upload'], { type: 'text/plain' })
const progressFiles = {
    ...files,
    isUploading: ref(true),
    uploads: ref([
        {
            file: demoFile,
            name: 'demo.txt',
            size: demoFile.size,
            type: demoFile.type,
            status: 'uploading' as const,
            loaded: 7,
            total: demoFile.size,
            progress: 0.64,
        },
    ]),
    progress: ref({ loaded: 7, total: demoFile.size, fraction: 0.64 }),
    error: ref(),
    reset: () => {},
    abort: () => {},
} satisfies UseFilesReturn
</script>

<template>
    <ClientOnly>
        <div class="border-default bg-default my-6 rounded-lg border p-4">
            <FilesUploadProgress :files="progressFiles" />
        </div>
        <template #fallback><div class="bg-muted my-6 h-24 animate-pulse rounded-lg" /></template>
    </ClientOnly>
</template>
