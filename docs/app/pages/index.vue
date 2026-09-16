<script setup lang="ts">
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

const codeTree = `::code-tree{defaultValue="files.config.ts", expandAll=true, class="lg:h-[340px]"}

\`\`\`ts [nuxt.config.ts]
export default defineNuxtConfig({
    modules: ['nuxt-files-sdk'],
})
\`\`\`

\`\`\`ts [files.config.ts]
export default defineFilesConfig({
    storage: {
        adapter: 'fs',
        config: { root: '.data/files' },
    },
})
\`\`\`

\`\`\`ts [server/api/hello.get.ts]
export default defineEventHandler(async () => {
    const files = useServerFiles()

    await files.upload('hello.txt', 'Hello from Nuxt')
    const file = await files.download('hello.txt')

    return {
        key: file.key,
        text: await file.text(),
    }
})
\`\`\`

::
`

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
            :ui="{ container: 'pb-8 sm:pb-8 lg:pb-8' }"
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

        <Markdown class="w-full max-w-4xl">
            {{ codeTree }}
        </Markdown>

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
