/** Test-only public lifecycle observations; never log hook arguments or runtime configuration. */
export const nuxtLifecycleModule = `function filesCliLifecycle(_options, nuxt) {
    const started = Date.now()
    const observe = (scope, hooks) => {
      const emit = (phase, event) => {
        if (['close', 'restart', 'ready', 'nitro:init', 'nitro:config', 'build:before', 'build:done', 'dev:reload'].includes(event.name))
          console.info('[Files CLI lifecycle] ' + JSON.stringify({ scope, phase, hook: event.name, pid: process.pid, ms: Date.now() - started }))
      }
      hooks.beforeEach(event => emit('before', event))
      hooks.afterEach(event => emit('after', event))
    }
    observe('nuxt', nuxt.hooks)
    nuxt.hook('nitro:init', nitro => observe('nitro', nitro.hooks))
  }`
