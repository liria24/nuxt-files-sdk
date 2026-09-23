<script setup lang="ts">
const files = useFiles()
const list = useList({ prefix: 'uploads/' })
const file = useFile('uploads/example.txt')
const search = useSearch('uploads/**')
const selected = shallowRef()
const uploads = ref<File[]>([])
const dark = ref(false)
const samples = [
    { label: 'XS solid', color: 'primary', size: 'xs', variant: 'solid' },
    { label: 'SM outline', color: 'secondary', size: 'sm', variant: 'outline' },
    { label: 'MD soft', color: 'success', size: 'md', variant: 'soft' },
    { label: 'LG subtle', color: 'warning', size: 'lg', variant: 'subtle' },
    { label: 'XL ghost', color: 'error', size: 'xl', variant: 'ghost' },
] as const
void files
void list
void file
void search
</script>

<template>
    <main :class="{ dark }">
        <p>Files composables</p>
        <button type="button" @click="dark = !dark">Toggle dark</button>
        <ClientOnly>
            <UTheme
                :props="{ filesDropzone: { trigger: { color: 'secondary', size: 'sm' } } }"
                :ui="{ filesDropzone: { root: 'ring-2 ring-secondary' } }"
            >
                <section class="ui-contract">
                    <FilesDropzone :files="files" :trigger="{ color: 'secondary', size: 'sm', variant: 'outline' }" />
                    <FilesList
                        :files="files"
                        :refresh="{ size: 'sm' }"
                        :file-actions="{ trigger: { variant: 'ghost' } }"
                        @select="selected = $event"
                    />
                    <FilesUploadProgress :files="files" :aggregate="{ color: 'primary' }" :item="{ size: 'sm' }" />
                    <FilesMultipartUploader
                        v-model="uploads"
                        :files="files"
                        :choose="{ variant: 'outline' }"
                        :upload="{ size: 'md' }"
                        :cancel="{ color: 'neutral' }"
                    />
                    <FilesPreview :file="selected ?? 'uploads/example.txt'" :files="files" />
                    <FilesBrowser
                        v-model:selected="selected"
                        :files="files"
                        :home="{ variant: 'ghost' }"
                        :folder="{ size: 'sm' }"
                        :file-actions="{ trigger: { color: 'neutral' } }"
                    />
                    <FilesSearch
                        :files="files"
                        :query="{ variant: 'outline' }"
                        :match="{ size: 'md' }"
                        :case-insensitive="{ color: 'primary' }"
                        :result="{ variant: 'ghost' }"
                        @select="selected = $event"
                    />
                    <FilesShareDialog
                        file-key="uploads/example.txt"
                        :files="files"
                        :expiry-input="{ size: 'md' }"
                        :disposition-select="{ variant: 'outline' }"
                        :copy="{ icon: 'i-lucide-copy' }"
                        :cancel="{ color: 'neutral' }"
                    />
                    <FilesActions
                        file-key="uploads/example.txt"
                        :files="files"
                        :items="{ copy: { label: 'Copy file' } }"
                        :input="{ size: 'md' }"
                        :confirm="{ variant: 'solid' }"
                    />
                    <FilesCapabilities :files="files" />
                    <FilesVersionHistory
                        file-key="uploads/example.txt"
                        :files="files"
                        :restore="{ variant: 'outline' }"
                    />
                    <FilesTrashBin
                        :files="files"
                        :purge-all="{ color: 'error' }"
                        :restore="{ color: 'neutral' }"
                        :confirm="{ size: 'md' }"
                    />
                    <div class="variants">
                        <FilesShareDialog
                            v-for="sample in samples"
                            :key="sample.label"
                            file-key="uploads/example.txt"
                            :files="files"
                            :trigger="{ ...sample, label: sample.label }"
                        />
                    </div>
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
.variants {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 1rem;
}
main.dark {
    background: #09090b;
    color: #d4d4d8;
}
</style>
