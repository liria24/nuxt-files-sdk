import { expect, test } from 'vitest'

import { runFixture } from '../utils/fixture'

test('[NUXT-002][TYPE-018] Nuxt Vue > native composable auto-imports typecheck and build', async () => {
    await expect(runFixture('nuxt4-vue')).resolves.toBeUndefined()
})
