// oxlint-disable-next-line import/no-unassigned-import -- registers the Vite-bundled icon data
import 'virtual:nuxt-icon-bundle/register'
// oxlint-disable-next-line import/no-unassigned-import -- global component styles
import '../../ui/styles.standalone.css'
// oxlint-disable-next-line import/no-unassigned-import -- DevTools shell styles
import './style.css'
import { createApp } from 'vue'

import { en } from '../../ui/locale'
import { createFilesUi } from '../../ui/runtime/context'
import App from './App.vue'

createApp(App)
    .use(createFilesUi({ locale: en }))
    .mount('#app')
