<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const query = ref('')
const sections = ref<SearchSection[]>()
const loading = ref(false)

const results = computed(() => {
    const terms = query.value.toLowerCase().trim().split(/\s+/u).filter(Boolean)
    if (!terms.length) return sections.value?.slice(0, 12) ?? []
    return (sections.value ?? [])
        .map((section) => {
            const title = [section.title, ...section.titles].join(' ').toLowerCase()
            const content = section.content.toLowerCase()
            const score = terms.reduce(
                (total, term) => total + (title.includes(term) ? 3 : 0) + (content.includes(term) ? 1 : 0),
                0,
            )
            return { section, score }
        })
        .filter(({ score }) => score > 0)
        .toSorted((left, right) => right.score - left.score)
        .slice(0, 12)
        .map(({ section }) => section)
})

watch(open, async (value) => {
    await nextTick()
    if (value) {
        dialog.value?.showModal()
        if (!sections.value && !loading.value) {
            loading.value = true
            try {
                sections.value = await useDocsContent().searchSections()
            } finally {
                loading.value = false
            }
        }
    } else {
        dialog.value?.close()
    }
})

function close() {
    open.value = false
    query.value = ''
}

function onShortcut(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        open.value = !open.value
    }
}

onMounted(() => window.addEventListener('keydown', onShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', onShortcut))
</script>

<template>
    <dialog
        ref="dialog"
        aria-labelledby="docs-search-title"
        class="border-default bg-default text-default mx-auto mt-[10dvh] max-h-[min(42rem,calc(100dvh-4rem))] w-[min(42rem,calc(100%-2rem))] overflow-hidden rounded-(--ui-radius) border p-0 shadow-xl backdrop:bg-black/55 backdrop:backdrop-blur-[2px]"
        @close="open = false"
        @click.self="close"
    >
        <div>
            <div class="border-default flex gap-2 border-b p-3">
                <h2 id="docs-search-title" class="sr-only">Search documentation</h2>
                <UInput
                    v-model="query"
                    autofocus
                    icon="i-lucide-search"
                    placeholder="Search documentation"
                    size="xl"
                    class="w-full"
                />
                <UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Close search" @click="close" />
            </div>

            <div class="max-h-120 overflow-y-auto p-2">
                <p v-if="loading" class="text-muted p-4 text-sm">Loading search index…</p>
                <NuxtLink
                    v-for="result in results"
                    :key="result.id"
                    :to="result.id"
                    class="hover:bg-elevated focus-visible:bg-elevated flex flex-col gap-0.5 rounded-(--ui-radius) p-3 focus-visible:outline-none"
                    @click="close"
                >
                    <span class="text-highlighted font-medium">{{ result.title }}</span>
                    <span v-if="result.titles.length" class="text-muted text-xs">{{ result.titles.join(' › ') }}</span>
                    <span class="text-muted line-clamp-2 text-sm">{{ result.content }}</span>
                </NuxtLink>
                <p v-if="!loading && sections && !results.length" class="text-muted p-4 text-sm">
                    No matching documentation found.
                </p>
            </div>
        </div>
    </dialog>
</template>
