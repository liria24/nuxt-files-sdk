import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from 'vite-plus/test'
import { parse } from 'yaml'

import { bindConsumerLock } from '../utils/consumer-install'
import { repositoryRoot } from '../utils/fixture'

test.for(['0.3.1', '0.4.0'])('[PKG-006] archive %s rebinds only owned metadata in release locks', async (version) => {
    const filename = `nuxt-files-sdk-${version}.tgz`
    const integrity = 'sha512-release-archive-regression'
    for (const [manager, file] of [
        ['npm', 'package-lock.json'],
        ['pnpm', 'pnpm-lock.yaml'],
        ['bun', 'bun.lock'],
    ] as const) {
        const template = await readFile(resolve(repositoryRoot, 'test/consumer/locks/nuxt4', file), 'utf8')
        const before = parse(template)
        const bound = bindConsumerLock(template, manager, { filename, version, integrity })
        expect(bound, manager).toContain(filename)
        const after = parse(bound.replaceAll(filename, 'nuxt-files-sdk.tgz'))
        if (manager === 'bun') {
            const owned = after.packages['nuxt-files-sdk']
            assert.equal(owned.at(-1), integrity)
            owned[owned.length - 1] = before.packages['nuxt-files-sdk'].at(-1)
        } else {
            const key =
                manager === 'npm'
                    ? 'node_modules/nuxt-files-sdk'
                    : Object.keys(after.packages).find((entry) => entry.startsWith('nuxt-files-sdk@file:'))!
            const owned = after.packages[key]
            const original = before.packages[key]
            assert.equal(owned.version, version, manager)
            owned.version = original.version
            const resolution = manager === 'npm' ? owned : owned.resolution
            assert.equal(resolution.integrity, integrity, manager)
            resolution.integrity = (manager === 'npm' ? original : original.resolution).integrity
        }
        expect(after, `${manager} registry resolutions remain frozen`).toEqual(before)
    }
})
