import { mergeResolvers } from '@graphql-tools/merge'
import { authResolver } from './resolvers/auth.resolver'
import { twoFaResolvers } from './resolvers/2fa.resolver'
import { tokenResolver } from './resolvers/token.resolver'

export const authResolvers = mergeResolvers([authResolver, twoFaResolvers, tokenResolver])
export * from './utils/auth.utils'
