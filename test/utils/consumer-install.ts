import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, resolve } from 'node:path'

import { parse, stringify } from 'yaml'

import { repositoryRoot, runCommand } from './fixture'

const requested = process.env.NUXT_FILES_PACKAGE_MANAGER ?? 'bun'
assert(['bun', 'npm', 'pnpm'].includes(requested), `Unsupported package manager: ${requested}`)
export const packageManager = requested as 'bun' | 'npm' | 'pnpm'
const require = createRequire(import.meta.url)
const bin = async () => {
    const path = packageManager === 'pnpm' ? require.resolve('pnpm') : require.resolve('npm/package.json')
    const manifest = JSON.parse(await readFile(path, 'utf8'))
    const workspace = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
    assert.equal(manifest.version, workspace.devDependencies[packageManager], 'Use the pinned package manager')
    return resolve(dirname(path), manifest.bin[packageManager])
}
type Options = { signal?: AbortSignal; timeout?: number; frozen?: boolean }
const command = async (args: string[], directory: string, options: Options) =>
    runCommand(
        packageManager === 'bun' ? 'bun' : process.execPath,
        packageManager === 'bun' ? args : [await bin(), ...args],
        { cwd: directory, ...options },
    )

export const bindConsumerLock = (
    lock: string,
    manager: typeof packageManager,
    archive: { filename: string; version: string; integrity: string },
): string => {
    lock = lock.replaceAll('nuxt-files-sdk.tgz', archive.filename)
    if (manager === 'npm') {
        const parsed = JSON.parse(lock)
        const owned = parsed.packages['node_modules/nuxt-files-sdk']
        owned.version = archive.version
        owned.integrity = archive.integrity
        return JSON.stringify(parsed, null, 2) + '\n'
    }
    if (manager === 'pnpm') {
        const parsed = parse(lock)
        const key = Object.keys(parsed.packages).find((entry) => entry.startsWith('nuxt-files-sdk@file:'))!
        parsed.packages[key].version = archive.version
        parsed.packages[key].resolution.integrity = archive.integrity
        return stringify(parsed)
    }
    return lock.replace(/("nuxt-files-sdk": \[.*?, )"sha512-[^"]+"/u, `$1"${archive.integrity}"`)
}

export const installConsumer = async (directory: string, options: Options = {}): Promise<string> => {
    const manifestPath = resolve(directory, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const archive = resolve(directory, manifest.dependencies['nuxt-files-sdk'].slice(5))
    const checksum = createHash('sha256')
        .update(await readFile(archive))
        .digest('hex')
    const localArchive = resolve(
        directory,
        packageManager === 'bun' ? `nuxt-files-sdk-${checksum}.tgz` : 'nuxt-files-sdk.tgz',
    )
    if (archive !== localArchive) await copyFile(archive, localArchive)
    manifest.dependencies['nuxt-files-sdk'] = `file:${basename(localArchive)}`
    await writeFile(manifestPath, JSON.stringify(manifest, null, 4) + '\n')
    const lockfile =
        packageManager === 'bun' ? 'bun.lock' : packageManager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml'
    const workspace = await readFile(resolve(dirname(directory), 'pnpm-workspace.yaml'), 'utf8').then(
        () => true,
        () => false,
    )
    const destination = packageManager === 'pnpm' && workspace ? dirname(directory) : directory
    const update = process.env.NUXT_FILES_UPDATE_LOCKS === '1'
    const frozen =
        options.frozen !== false &&
        !update &&
        !process.env.NUXT_FILES_NUXT_VERSION &&
        !process.env.NUXT_FILES_NITRO2_VERSION
    const name = workspace
        ? 'workspace'
        : manifest.dependencies.nuxt
          ? 'nuxt4'
          : manifest.dependencies.nitropack
            ? 'nitro-v2'
            : 'nitro-v3'
    const template = resolve(repositoryRoot, 'test/consumer/locks', name, lockfile)
    if (frozen) {
        const artifact = JSON.parse(
            await runCommand('tar', ['-xOf', localArchive, 'package/package.json'], { cwd: directory, ...options }),
        )
        assert.equal(artifact.name, 'nuxt-files-sdk')
        const integrity =
            'sha512-' +
            createHash('sha512')
                .update(await readFile(localArchive))
                .digest('base64')
        const lock = bindConsumerLock(await readFile(template, 'utf8'), packageManager, {
            filename: basename(localArchive),
            version: artifact.version,
            integrity,
        })
        await writeFile(resolve(destination, lockfile), lock)
    }
    const args =
        packageManager === 'bun'
            ? ['install', '--ignore-scripts', ...(frozen ? ['--frozen-lockfile'] : [])]
            : packageManager === 'npm'
              ? [
                    frozen ? 'ci' : 'install',
                    '--ignore-scripts',
                    '--no-audit',
                    '--no-fund',
                    '--progress=false',
                    '--timing',
                    '--loglevel=http',
                ]
              : ['install', '--ignore-scripts', frozen ? '--frozen-lockfile' : '--no-frozen-lockfile']
    const started = performance.now()
    const output = await command(args, directory, options)
    process.stdout.write(
        '[Packed install] ' + JSON.stringify({ packageManager, name, frozen, ms: performance.now() - started }) + '\n',
    )
    if (packageManager === 'npm')
        process.stdout.write(
            output
                .split('\n')
                .filter((line) => /timing (?:idealTree\b|reify\b|command:)|http fetch/u.test(line))
                .join('\n') + '\n',
        )
    if (update && options.frozen !== false) {
        await mkdir(dirname(template), { recursive: true })
        const lock = await readFile(resolve(destination, lockfile), 'utf8')
        await writeFile(template, lock.replaceAll(basename(localArchive), 'nuxt-files-sdk.tgz'))
    }
    return output
}

export const runConsumerScript = (directory: string, script: string, options: Options = {}) =>
    command(['run', script], directory, options)
