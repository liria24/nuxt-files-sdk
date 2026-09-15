<script setup lang="ts">
import type { NavigationItem } from 'comark-content'

definePageMeta({
    layout: 'docs',
    path: '/:slug(.+)',
})

const { docs } = useAppConfig()
const route = useRoute()
const path = computed(() => `/${Array.isArray(route.params.slug) ? route.params.slug.join('/') : route.params.slug}`)

const navigation = inject<Ref<NavigationItem[] | undefined>>('docs-navigation')
const client = useDocsContent()

const { data: page, error } = await useAsyncData(
    () => `docs-page:${path.value}`,
    () => client.get(path.value),
    { watch: [() => path.value] },
)

if (error.value) throw error.value

if (!page.value) {
    const target = firstPage(navigation?.value, path.value)
    if (target) await navigateTo(target, { redirectCode: 302 })
    else throw createError({ statusCode: 404, statusMessage: 'Documentation page not found.', fatal: true })
}

const frontmatter = computed<Record<string, unknown>>(() => (page.value?.data ?? {}) as Record<string, unknown>)
const title = computed(() => String(frontmatter.value.title ?? 'Nuxt Files SDK'))
const description = computed(() => String(frontmatter.value.description ?? ''))
const toc = computed(() => (page.value?.meta as { toc?: { links?: [] } } | undefined)?.toc?.links ?? [])
const surround = computed(() => surroundingPages(navigation?.value ?? [], path.value))
const siteUrl = useRuntimeConfig().public.siteUrl.replace(/\/$/u, '')
const canonical = computed(() => `${siteUrl}${path.value}`)
const rawPath = computed(() => `/raw${path.value === '/' ? '/index' : path.value}.md`)

defineOgImage('Docs.takumi', { title, description })
useSeoMeta({
    title,
    titleTemplate: `%s | ${docs.title}`,
    description,
    ogTitle: title,
    ogDescription: description,
    ogUrl: canonical,
})
useHead({
    link: [
        { rel: 'canonical', href: canonical },
        { rel: 'alternate', type: 'text/markdown', href: computed(() => `${siteUrl}${rawPath.value}`) },
    ],
})
</script>

<template>
    <div v-if="page" class="grid w-full grid-cols-[minmax(0,1fr)_14rem] gap-16 max-xl:block">
        <article class="min-w-0">
            <UPageHeader :title :description>
                <template #links>
                    <DocsPageHeaderLinks />
                </template>
            </UPageHeader>

            <UPageBody class="docs-prose">
                <MarkdownDocument :value="page" />

                <div v-if="surround.length" class="mt-16 grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                    <NuxtLink
                        v-for="item in surround"
                        :key="item.path"
                        :to="item.path"
                        class="border-default hover:bg-elevated flex flex-col rounded-(--ui-radius) border p-4"
                    >
                        <span class="text-muted text-xs">Documentation</span>
                        <span class="text-highlighted font-medium">{{ item.title }}</span>
                    </NuxtLink>
                </div>
            </UPageBody>
        </article>

        <aside class="hidden xl:block">
            <DocsToc :links="toc" />
        </aside>
    </div>
</template>
