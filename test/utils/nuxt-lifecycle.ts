/** Test-only public lifecycle observations; never log hook arguments or runtime configuration. */
export const nuxtLifecycleModule = `function filesCliLifecycle(_options, nuxt) {
    const { writeSync } = process.getBuiltinModule('node:fs')
    const log = data => writeSync(2, '[Files CLI lifecycle] ' + JSON.stringify(data) + '\\n')
    const started = performance.now()
    process.on('exit', code => log({ phase: 'process-exit', atMs: Number(process.hrtime.bigint() / 1000000n), pid: process.pid, ms: performance.now() - started, code }))
    const observe = (scope, hooks) => {
      const emit = (phase, event) => {
        if (['close', 'restart', 'ready', 'nitro:init', 'nitro:config', 'build:before', 'build:done', 'dev:reload'].includes(event.name))
          log({ scope, phase, hook: event.name, pid: process.pid, ms: performance.now() - started })
      }
      hooks.beforeEach(event => emit('before', event))
      hooks.afterEach(event => emit('after', event))
    }
    observe('nuxt', nuxt.hooks)
    nuxt.hook('nitro:init', nitro => observe('nitro', nitro.hooks))
  }`
