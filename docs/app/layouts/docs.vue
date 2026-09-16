<script setup lang="ts">
import type { NavigationItem } from 'comark-content'

const { docs } = useAppConfig()
const client = useDocsContent()
const searchOpen = ref(false)
const { data: navigation, error } = await useAsyncData<NavigationItem[]>('docs-navigation', () => client.navigation())
if (error.value) throw error.value
const menuItems = computed(() => toMenuItems(navigation.value ?? []))

provide('docs-navigation', navigation)
</script>

<template>
    <div class="flex min-h-dvh flex-col">
        <UHeader :title="docs.title" to="/" :ui="{ center: 'flex-1' }">
            <template #left>
                <NuxtLink to="/" class="text-highlighted font-semibold">
                    {{ docs.title }}
                </NuxtLink>
            </template>

            <UButton
                icon="i-lucide-search"
                label="Search"
                color="neutral"
                variant="soft"
                class="mr-2 w-full"
                @click="searchOpen = true"
            >
                <template #trailing>
                    <UKbd value="meta" class="ml-auto">⌘</UKbd>
                    <UKbd>K</UKbd>
                </template>
            </UButton>

            <template #right>
                <UColorModeButton color="neutral" variant="ghost" />
                <UButton
                    icon="i-simple-icons-github"
                    :to="docs.repository"
                    target="_blank"
                    color="neutral"
                    variant="ghost"
                    aria-label="GitHub repository"
                />
            </template>

            <template #body>
                <UButton
                    icon="i-lucide-search"
                    label="Search documentation"
                    color="neutral"
                    variant="outline"
                    block
                    @click="searchOpen = true"
                />
                <UNavigationMenu
                    :items="menuItems"
                    orientation="vertical"
                    color="neutral"
                    variant="link"
                    class="mt-4"
                />
            </template>
        </UHeader>

        <UContainer as="main">
            <UPage :ui="{ left: 'hidden lg:flex' }">
                <template #left>
                    <UNavigationMenu
                        :items="menuItems"
                        orientation="vertical"
                        color="neutral"
                        variant="link"
                        :ui="{ root: 'w-full', list: 'gap-1' }"
                        class="pt-8"
                    />
                </template>

                <div class="min-w-0">
                    <slot />
                </div>
            </UPage>
        </UContainer>

        <USeparator />

        <UFooter>
            <template #left>
                <UButton :to="docs.repository" label="MIT License." color="neutral" variant="link" />
            </template>
            <template #right>
                <UTheme :props="{ button: { color: 'neutral', variant: 'link' } }">
                    <UButton to="/getting-started/installation" label="Docs" />
                    <UButton to="/llms.txt" label="llms.txt" />
                    <UButton :to="docs.filesSdk" target="_blank" label="Files SDK" />
                </UTheme>
            </template>
        </UFooter>

        <DocsSearch v-model:open="searchOpen" />
    </div>
</template>
