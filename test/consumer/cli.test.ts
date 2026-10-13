import { rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test'

import { installConsumer, packageManager, runConsumerScript } from '../utils/consumer-install'
import { copyPackedConsumer, packPackage } from '../utils/fixture'
import { runPackedNuxtCliSession } from '../utils/packed-cli-session'
let packed: Awaited<ReturnType<typeof packPackage>>
describe('Packed CLI lifecycle', () => {
    beforeAll(async () => {
        packed = await packPackage()
    })
    afterAll(async () => {
        if (packed) await rm(packed.directory, { recursive: true, force: true })
    })
    test.each([1, 2, 3])(
        '[CLI-002][GATEWAY-006] session %s: exact archive runs the real CLI lifecycle and portable gateway boundaries',
        async () => {
            const consumer = await copyPackedConsumer('nuxt4', resolve(packed.directory, 'cli-input'), packed.tarball)
            if (packageManager === 'pnpm') {
                await writeFile(resolve(consumer, '.npmrc'), 'hoist=false\nshamefully-hoist=false\n')
            }
            const report = await runPackedNuxtCliSession({
                consumer,
                install: installConsumer,
                runScript: runConsumerScript,
            })
            expect(report.cli).toMatch(/^4\./u)
            expect(report.localReferenceUpdated).toBe(true)
            expect(report.aliasLayerRelativeUpdated).toBe(true)
            expect(report.installOnlyRecovery).toBe(true)
            if (report.disconnectAbort.status === 'upstream-limitation') {
                // The real probe ran; preserve the actual native-adapter limitation in CI output.
                // oxlint-disable-next-line no-console
                console.info(`[Packed Nuxt CLI] ${report.disconnectAbort.detail}`)
            }
        },
        600_000,
    )
})
