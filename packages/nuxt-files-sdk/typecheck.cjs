const { run } = require('vue-tsc')

run(require.resolve('typescriptVue/lib/tsc', { paths: [__dirname] }))
