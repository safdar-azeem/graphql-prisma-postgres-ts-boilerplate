import { hashPassword, comparePassword, generateToken, verifyToken } from './auth.utils'
import { describe, it, expect, vi } from 'vitest'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { JWT_SECRET, JWT_EXPIRES_IN_SECONDS } from '@/constants'

// Mock external libraries
vi.mock('bcrypt')
vi.mock('jsonwebtoken')

describe('Auth Utils', () => {
  describe('Password Utils', () => {
    it('should hash a password', async () => {
      const password = 'password123'
      const hashedPassword = 'hashedPassword123'
      vi.mocked(bcrypt.hash).mockImplementation(() => Promise.resolve(hashedPassword as never))

      const result = await hashPassword(password)

      expect(bcrypt.hash).toHaveBeenCalledWith(password, 12)
      expect(result).toBe(hashedPassword)
    })

    it('should compare a password and hash correctly', async () => {
      const password = 'password123'
      const hash = 'hashedPassword123'
      vi.mocked(bcrypt.compare).mockImplementation(() => Promise.resolve(true as never))

      const result = await comparePassword(password, hash)

      expect(bcrypt.compare).toHaveBeenCalledWith(password, hash)
      expect(result).toBe(true)
    })
  })

  describe('Token Utils', () => {
    it('should generate a token with correct payload and options', () => {
      const payload = { _id: 'user123', email: 'test@example.com' }
      const token = 'generated.jwt.token'
      vi.mocked(jwt.sign).mockImplementation(() => token as never)

      const result = generateToken(payload)

      expect(jwt.sign).toHaveBeenCalledWith(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN_SECONDS,
      })
      expect(result).toBe(token)
    })

    it('should verify a valid token', () => {
      const token = 'valid.token'
      const payload = { _id: 'user123' }
      vi.mocked(jwt.verify).mockImplementation(() => payload as never)

      const result = verifyToken(token)

      expect(jwt.verify).toHaveBeenCalledWith(token, JWT_SECRET)
      expect(result).toEqual(payload)
    })

    it('should return null for an invalid token', () => {
      const token = 'invalid.token'
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('Invalid token')
      })

      const result = verifyToken(token)

      expect(result).toBeNull()
    })
  })
})
