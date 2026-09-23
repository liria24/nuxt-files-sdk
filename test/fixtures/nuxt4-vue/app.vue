<script setup lang="ts">
const files = useFiles()
const list = useList({ prefix: 'uploads/' })
const file = useFile('uploads/example.txt')
const search = useSearch('uploads/**')
void files
void list
void file
void search
</script>

<template>
    <main>
        <p>Files composables</p>
    </main>
</template>
