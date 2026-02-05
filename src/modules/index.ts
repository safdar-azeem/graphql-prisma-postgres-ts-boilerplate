import { mergeResolvers } from '@graphql-tools/merge'
import { scalars } from '@/graphql/scalars'
import { authResolvers } from './auth'
import { userResolver } from './user'
import { uploadResolver } from './upload'

export const resolvers = mergeResolvers([scalars, authResolvers, userResolver, uploadResolver])
