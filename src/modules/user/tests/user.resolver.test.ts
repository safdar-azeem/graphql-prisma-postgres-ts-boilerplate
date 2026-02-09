import { userResolver } from '../resolvers/user.resolver'
import { describe, it, expect, beforeEach } from 'vitest'
import { Context } from '@/types/context.type'
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'
import { AuthenticationError } from '@/errors'

describe('User Resolver', () => {
  let mockContext: DeepMockProxy<Context>

  beforeEach(() => {
    mockContext = mockDeep<Context>()
  })

  describe('Query.me', () => {
    it('Get user', async () => {
      const user = { id: '1', email: 'test@example.com', role: 'USER', name: 'Test User' }
      mockContext.user = user as any

      const result = await (userResolver.Query?.me as any)({}, {}, mockContext, {})

      expect(result).toEqual(user)
    })

    it('Get user (Unauthenticated)', async () => {
      mockContext.user = undefined as any

      await expect((userResolver.Query?.me as any)({}, {}, mockContext, {})).rejects.toThrow(
        AuthenticationError
      )
    })
  })
})
