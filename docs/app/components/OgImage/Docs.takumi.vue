<script setup lang="ts">
const { title, description } = defineProps<{
    title?: string
    description?: string
}>()
</script>

<template>
    <div
        :style="{
            display: 'flex',
            width: '100%',
            height: '100%',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '72px',
            background: '#020617',
            color: '#f8fafc',
            fontFamily: 'Geist',
        }"
    >
        <div v-if="title" :style="{ display: 'flex', color: '#22c55e', fontSize: '30px', fontWeight: 600 }">
            Nuxt Files SDK
        </div>
        <div :style="{ display: 'flex', marginTop: '28px', fontSize: '64px', fontWeight: 700, lineHeight: 1.05 }">
            {{ title }}
        </div>
        <div :style="{ display: 'flex', marginTop: '28px', color: '#cbd5e1', fontSize: '28px', lineHeight: 1.4 }">
            {{ description }}
        </div>
    </div>
</template>
