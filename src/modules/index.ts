import { mergeResolvers } from '@graphql-tools/merge'
import { scalars } from '@/graphql/scalars'
import { authResolvers } from './auth'
import { userResolver } from './user'
import { uploadResolver } from './upload'
import { roleResolver } from './role'
import { userManagementResolver } from './user-management'

export const resolvers = mergeResolvers([
  scalars,
  authResolvers,
  userResolver,
  uploadResolver,
  roleResolver,
  userManagementResolver,
])
