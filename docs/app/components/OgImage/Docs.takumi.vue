<script setup lang="ts">
const { title, description } = defineProps<{
    title?: string
    description?: string
}>()
</script>

<template>
    <div class="flex size-full flex-col items-start justify-center gap-6 bg-black p-32 font-[Geist] text-zinc-50">
        <div v-if="title" class="text-[32px] font-semibold text-zinc-300">Nuxt Files SDK</div>
        <div class="text-[72px] font-bold">
            {{ title }}
        </div>
        <p class="text-[36px] text-zinc-400">
            {{ description }}
        </p>
    </div>
</template>
