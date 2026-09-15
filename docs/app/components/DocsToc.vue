<script setup lang="ts">
interface TocLink {
    id: string
    text: string
    depth: number
    children?: TocLink[]
}

defineProps<{ links: TocLink[] }>()
</script>

<template>
    <nav v-if="links.length" aria-label="On this page" class="sticky top-22 max-h-[calc(100dvh-7rem)] overflow-y-auto">
        <p class="text-highlighted mb-3 text-sm font-semibold">On this page</p>
        <ul class="space-y-2 text-sm">
            <li v-for="link in links" :key="link.id">
                <a :href="`#${link.id}`" class="text-muted hover:text-highlighted">{{ link.text }}</a>
                <ul v-if="link.children?.length" class="border-default mt-2 ml-3 space-y-2 border-l pl-3">
                    <li v-for="child in link.children" :key="child.id">
                        <a :href="`#${child.id}`" class="text-muted hover:text-highlighted">{{ child.text }}</a>
                    </li>
                </ul>
            </li>
        </ul>
    </nav>
</template>
