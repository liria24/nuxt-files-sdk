<script setup lang="ts">
const files = useDemoFiles()
</script>

<template>
    <ClientOnly>
        <div class="border-default bg-default my-6 rounded-lg border p-4">
            <FilesDropzone :files="files" prefix="uploads/" />
        </div>
        <template #fallback><div class="bg-muted my-6 h-24 animate-pulse rounded-lg" /></template>
    </ClientOnly>
</template>
