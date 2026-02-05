import bcrypt from 'bcrypt'
import jwt, { SignOptions } from 'jsonwebtoken'
import { JWT_EXPIRES_IN_SECONDS, JWT_SECRET } from '@/constants'

// Password Utils
const SALT_ROUNDS = 12

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword)
}

// Token Utils
export interface TokenPayload {
  _id: string
  email?: string
  is2faPending?: boolean
}

export const generateToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN_SECONDS,
  }

  return jwt.sign(payload, JWT_SECRET, options)
}

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload
  } catch {
    return null
  }
}
