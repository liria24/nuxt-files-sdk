<script setup lang="ts">
const files = useDemoFiles()
</script>

<template>
    <ClientOnly>
        <div class="border-default bg-default my-6 rounded-lg border p-4">
            <FilesActions
                :actions="['copy', 'rename', 'move', 'delete']"
                file-key="documents/readme.txt"
                :files="files"
            />
        </div>
        <template #fallback><div class="bg-muted my-6 h-24 animate-pulse rounded-lg" /></template>
    </ClientOnly>
</template>
