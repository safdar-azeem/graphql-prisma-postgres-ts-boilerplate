import { mergeResolvers } from '@graphql-tools/merge'
import { authResolver } from './resolvers/auth.resolver'
import { twoFaResolvers } from './resolvers/2fa.resolver'

export const authResolvers = mergeResolvers([authResolver, twoFaResolvers])
export * from './utils/auth.utils'
