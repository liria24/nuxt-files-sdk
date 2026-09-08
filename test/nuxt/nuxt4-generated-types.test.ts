import { afterAll, beforeAll, expect, test } from 'vitest'

import { invalidTypeCases } from '../types/invalid/cases'
import { cleanFixture, fixtureDirectory, runFixture } from '../utils/fixture'
import {
    checkGeneratedTypes,
    checkHoverDocumentation,
    checkInvalidType,
    checkPublicExamples,
    cleanTypeContracts,
} from '../utils/generated-types'

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
test('[DOCS-001] fixture examples and native public types compile against generated consumer declarations', () =>
    expect(checkPublicExamples(directory)).resolves.toBeUndefined())
test('[DOCS-002] public, auto-imported, and configuration hovers retain their documentation', () =>
    expect(checkHoverDocumentation(directory)).resolves.toBeUndefined())
