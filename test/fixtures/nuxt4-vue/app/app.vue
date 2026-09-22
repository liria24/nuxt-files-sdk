<script setup lang="ts">
const files = useFiles()
const list = useList({ prefix: 'uploads/' })
const file = useFile('uploads/example.txt')
const search = useSearch('uploads/**')
const selected = shallowRef()
const uploads = ref<File[]>([])
void files
void list
void file
void search
</script>

<template>
    <main>
        <p>Files composables</p>
        <ClientOnly>
            <UTheme
                :props="{ filesDropzone: { color: 'secondary', size: 'sm' } }"
                :ui="{ filesDropzone: { root: 'ring-2 ring-secondary' } }"
            >
                <section class="ui-contract">
                    <FilesDropzone :files="files" />
                    <FilesList :files="files" @select="selected = $event" />
                    <FilesUploadProgress :files="files" />
                    <FilesMultipartUploader v-model="uploads" :files="files" />
                    <FilesPreview :file="selected ?? 'uploads/example.txt'" :files="files" />
                    <FilesBrowser v-model:selected="selected" :files="files" />
                    <FilesSearch :files="files" @select="selected = $event" />
                    <FilesShareDialog file-key="uploads/example.txt" :files="files" />
                    <FilesActions file-key="uploads/example.txt" :files="files" />
                    <FilesCapabilities :files="files" />
                    <FilesVersionHistory file-key="uploads/example.txt" :files="files" />
                    <FilesTrashBin :files="files" />
                </section>
            </UTheme>
        </ClientOnly>
    </main>
</template>

<style>
.ui-contract {
    display: grid;
    gap: 1rem;
}
</style>
