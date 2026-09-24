<script setup lang="ts">
import type { TreeItem, TabsItem } from '@nuxt/ui'
import { highlightText } from 'rangi'

const { docs } = useAppConfig()
const { copied, copy } = useClipboard()

type packageManager = 'npm' | 'pnpm' | 'bun' | 'yarn'
const packageManagers: Record<packageManager, { label: string; icon: string; install: string }> = {
    npm: { label: 'npm', icon: 'simple-icons:npm', install: 'npm i' },
    pnpm: { label: 'pnpm', icon: 'simple-icons:pnpm', install: 'pnpm add' },
    bun: { label: 'Bun', icon: 'simple-icons:bun', install: 'bun add' },
    yarn: { label: 'yarn', icon: 'simple-icons:yarn', install: 'yarn add' },
}
const selectPM = useCookie<packageManager>('package-manager', { default: () => 'npm' })
const displayCommand = computed(() => `${packageManagers[selectPM.value].install} nuxt-files-sdk`)

const siteUrl = useRuntimeConfig().public.siteUrl.replace(/\/$/u, '')

type PreviewFile = TreeItem & { id?: string; code?: string; children?: PreviewFile[] }

const findPreviewFile = (files: PreviewFile[], id: string): PreviewFile | undefined => {
    for (const file of files) {
        if (file.id === id) return file

        const nested = file.children && findPreviewFile(file.children, id)
        if (nested) return nested
    }
}

const nuxtFilesConfig = `export default defineFilesConfig({
    storage: {
        adapter: 's3',
        config: {
            bucket: "uploads",
            region: "us-east-1",
        },
    },
    $development: {
        storage: {
            adapter: 'fs',
            config: { root: '.data/files' },
        }
    },
})`

const nitroFilesConfig = `import { defineFilesConfig } from 'nuxt-files-sdk/config'

${nuxtFilesConfig}`

interface ExampleItem extends TabsItem {
    files: PreviewFile[]
}

const examples: ExampleItem[] = [
    {
        label: 'Nuxt 4',
        value: 'nuxt4',
        icon: 'devicon:nuxt',
        files: [
            {
                id: 'framework-config',
                label: 'nuxt.config.ts',
                code: `export default defineNuxtConfig({
    modules: ['nuxt-files-sdk'],
})`,
            },
            {
                id: 'files-config',
                label: 'files.config.ts',
                code: nuxtFilesConfig,
            },
            {
                label: 'server',
                defaultExpanded: true,
                children: [
                    {
                        label: 'api',
                        defaultExpanded: true,
                        children: [
                            {
                                id: 'api',
                                label: 'hello.get.ts',
                                code: `export default defineEventHandler(async () => {
    const files = useServerFiles()
    await files.upload('hello.txt', 'Hello from Nuxt 4')
    return (await files.download('hello.txt')).text()
})`,
                            },
                        ],
                    },
                ],
            },
        ],
    },
    {
        label: 'Nuxt 5',
        value: 'nuxt5',
        icon: 'devicon:nuxt',
        files: [
            {
                id: 'framework-config',
                label: 'nuxt.config.ts',
                code: `export default defineNuxtConfig({
    modules: ['nuxt-files-sdk'],
})`,
            },
            {
                id: 'files-config',
                label: 'files.config.ts',
                code: nuxtFilesConfig,
            },
            {
                label: 'server',
                defaultExpanded: true,
                children: [
                    {
                        label: 'api',
                        defaultExpanded: true,
                        children: [
                            {
                                id: 'api',
                                label: 'hello.get.ts',
                                code: `export default defineHandler(async () => {
    const files = useServerFiles()
    await files.upload('hello.txt', 'Hello from Nuxt 5')
    return (await files.download('hello.txt')).text()
})`,
                            },
                        ],
                    },
                ],
            },
        ],
    },
    {
        label: 'Nitro 2',
        value: 'nitro2',
        icon: 'unjs:nitro',
        files: [
            {
                id: 'framework-config',
                label: 'nitro.config.ts',
                code: `export default defineNitroConfig({
    modules: ['nuxt-files-sdk/nitro'],
})`,
            },
            {
                id: 'files-config',
                label: 'files.config.ts',
                code: nitroFilesConfig,
            },
            {
                label: 'routes',
                defaultExpanded: true,
                children: [
                    {
                        id: 'api',
                        label: 'hello.ts',
                        code: `import { useServerFiles } from 'nuxt-files-sdk/runtime'

export default defineEventHandler(async () => {
    const files = useServerFiles()
    await files.upload('hello.txt', 'Hello from Nitro 2')
    return (await files.download('hello.txt')).text()
})`,
                    },
                ],
            },
        ],
    },
    {
        label: 'Nitro 3',
        value: 'nitro3',
        icon: 'unjs:nitro',
        files: [
            {
                id: 'framework-config',
                label: 'nitro.config.ts',
                code: `import { defineNitroConfig } from 'nitro/config'

export default defineNitroConfig({
    modules: ['nuxt-files-sdk/nitro'],
    serverDir: './',
})`,
            },
            {
                id: 'files-config',
                label: 'files.config.ts',
                code: nitroFilesConfig,
            },
            {
                label: 'routes',
                defaultExpanded: true,
                children: [
                    {
                        id: 'api',
                        label: 'hello.ts',
                        code: `import { defineHandler } from 'nitro'
import { useServerFiles } from 'nuxt-files-sdk/runtime'

export default defineHandler(async () => {
    const files = useServerFiles()
    await files.upload('hello.txt', 'Hello from Nitro 3')
    return (await files.download('hello.txt')).text()
})`,
                    },
                ],
            },
        ],
    },
]

const selectedExample = ref('nuxt4')
const selectedFile = ref<PreviewFile>(examples[0]!.files[1]!)
watch(selectedExample, (value) => {
    const fileId = selectedFile.value?.id ?? 'files-config'
    const example = examples.find((e) => e.value === value)!
    selectedFile.value = findPreviewFile(example.files, fileId) ?? findPreviewFile(example.files, 'files-config')!
})
const highlightedCode = computed(() => highlightText(selectedFile.value.code ?? '', { lang: 'ts' }))

defineOgImage('Docs.takumi')
useSeoMeta({
    title: docs.title,
    description: docs.description,
    ogTitle: docs.title,
    ogDescription: docs.description,
    ogUrl: siteUrl,
})
</script>

<template>
    <UPage :ui="{ center: 'flex flex-col items-center pb-24' }">
        <UPageHero
            headline="Unofficial Nuxt Integration"
            title="Set up Files SDK easily"
            description="Native-first Files SDK integration for Nuxt and Nitro."
            :ui="{ container: 'pb-24 sm:pb-24 lg:pb-24' }"
        >
            <template #links>
                <div class="group relative">
                    <UButton
                        :label="displayCommand"
                        :trailing-icon="copied ? 'mingcute:check-line' : 'mingcute:copy-2-line'"
                        variant="outline"
                        color="neutral"
                        size="lg"
                        :ui="{
                            label: 'text-ellipsis [text-box:trim-both_cap_alphabetic]',
                            trailingIcon: 'size-4',
                        }"
                        class="gap-3 rounded-full py-2.5 pr-5.5 pl-6 font-mono"
                        @click="copy(displayCommand)"
                    />

                    <div class="absolute inset-x-0 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <UButton
                            v-for="(pm, key) in packageManagers"
                            :icon="pm.icon"
                            variant="link"
                            color="neutral"
                            size="sm"
                            @click="selectPM = key"
                        />
                    </div>
                </div>

                <UButton
                    to="/getting-started/installation"
                    label="Get started"
                    trailing-icon="mingcute:arrow-right-line"
                    color="neutral"
                    size="lg"
                    :ui="{
                        label: 'text-ellipsis [text-box:trim-both_cap_alphabetic]',
                        trailingIcon: 'size-4',
                    }"
                    class="gap-3 rounded-full py-2.5 pr-5 pl-6"
                />
            </template>
        </UPageHero>

        <UTabs
            v-model="selectedExample"
            :items="examples"
            size="xs"
            :ui="{ list: 'bg-transparent max-w-sm' }"
            class="w-full max-w-3xl"
        >
            <template #content="{ item }">
                <div class="border-muted grid min-h-85 overflow-hidden rounded-md border lg:h-85 lg:grid-cols-4">
                    <UTree
                        v-model="selectedFile"
                        :items="item.files"
                        :get-key="(file) => file.label ?? ''"
                        class="border-muted max-h-40 overflow-y-auto border-b p-2 lg:max-h-none lg:border-e lg:border-b-0"
                        @select="
                            (event, file) => {
                                if (file.children?.length) event.preventDefault()
                            }
                        "
                    >
                        <template #item-leading="{ item: file, expanded }">
                            <UIcon
                                v-if="file.children?.length"
                                :name="expanded ? 'lucide:folder-open' : 'lucide:folder'"
                                class="size-4"
                            />
                            <ProseCodeIcon v-else :filename="file.label" class="size-4" />
                        </template>
                    </UTree>
                    <div class="min-h-64 min-w-0 overflow-auto lg:col-span-3 lg:min-h-0">
                        <div class="border-muted text-muted border-b px-4 py-2 font-mono text-xs">
                            {{ selectedFile.label }}
                        </div>
                        <div
                            class="overflow-auto p-4 font-mono text-xs leading-6 whitespace-pre scheme-light dark:scheme-dark"
                            v-html="highlightedCode"
                        />
                    </div>
                </div>
            </template>
        </UTabs>

        <UButton
            :to="docs.filesSdk"
            target="_blank"
            label="View Files SDK Docs"
            trailing-icon="mingcute:arrow-right-up-line"
            variant="soft"
            color="neutral"
            class="mt-10 gap-2.5 rounded-full py-2.5 pr-4.5 pl-6"
        />
    </UPage>
</template>
