<script setup lang="ts">
const files = useFiles()
</script>

<template>
    <FilesDropzone :files="files" />
</template>
