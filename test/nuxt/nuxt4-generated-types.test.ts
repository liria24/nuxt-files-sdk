import { afterAll, beforeAll, expect, test } from 'vitest'

import { invalidTypeCases } from '../types/invalid/cases'
import { cleanFixture, fixtureDirectory, runFixture } from '../utils/fixture'
import { checkDocs, checkGeneratedTypes, checkInvalidType, cleanTypeContracts } from '../utils/generated-types'

const directory = fixtureDirectory('nuxt4')

beforeAll(() => runFixture('nuxt4'))
afterAll(async () => {
    await cleanTypeContracts(directory)
    await cleanFixture('nuxt4')
})

test('[TYPE-001][API-002][API-003] generated named/default/native/plugin types pass actual typecheck', () =>
    expect(checkGeneratedTypes(directory)).resolves.toBeUndefined())
test.each(invalidTypeCases)('[$id] rejects $name in an actual generated consumer', (entry) =>
    expect(checkInvalidType(directory, entry)).resolves.toBeUndefined(),
)
test('[DOCS-001] README examples and native public types compile against generated consumer declarations', () =>
    expect(checkDocs(directory)).resolves.toBeUndefined())
