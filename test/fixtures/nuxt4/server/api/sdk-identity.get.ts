import { Files } from '#files-sdk'

export default defineEventHandler(() => ({ owned: useServerFiles('blob') instanceof Files }))
