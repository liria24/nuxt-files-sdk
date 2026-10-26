export default defineNitroConfig({
    compatibilityDate: '2026-09-04',
    modules: ['nuxt-files-sdk/nitro'],
    minify: true,
    // Keep deployment-size measurements independent of debug sourcemap generation.
    sourceMap: false,
    esbuild: { options: { target: 'esnext' } },
})
