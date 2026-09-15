<script setup lang="ts">
import { joinURL } from 'ufo'

const route = useRoute()
const runtimeConfig = useRuntimeConfig()
const appBaseURL = runtimeConfig.app?.baseURL || '/'
const rawPrefix = (runtimeConfig.public.agentDiscovery as { rawPrefix?: string } | undefined)?.rawPrefix || '/raw'

const { copy, copied } = useClipboard()

const rawPath = computed(() => `${joinURL(rawPrefix, route.path)}.md`)
const markdownLink = computed(() => `${window?.location?.origin}${joinURL(appBaseURL, rawPath.value)}`)
const items = computed(() => [
    {
        label: 'Copy Markdown page',
        icon: 'i-lucide-link',
        onSelect() {
            copy(markdownLink.value)
        },
    },
    {
        label: 'View as Markdown',
        icon: 'i-simple-icons:markdown',
        target: '_blank',
        to: markdownLink.value,
    },
])

const copyPage = async () => {
    const page = await $fetch<string>(rawPath.value)
    copy(page)
}
</script>

<template>
    <UFieldGroup size="sm">
        <UButton
            label="Copy page"
            :icon="copied ? 'mingcute:check-line' : 'mingcute:copy-2-fill'"
            color="neutral"
            variant="soft"
            :ui="{
                leadingIcon: 'text-neutral size-3.5',
            }"
            @click="copyPage"
        />

        <UDropdownMenu
            size="sm"
            :items="items"
            :content="{
                align: 'end',
                side: 'bottom',
                sideOffset: 8,
            }"
        >
            <UButton icon="mingcute:down-line" color="neutral" variant="soft" class="border-muted border-l" />
        </UDropdownMenu>
    </UFieldGroup>
</template>
