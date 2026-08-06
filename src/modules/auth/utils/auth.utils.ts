import bcrypt from 'bcrypt'
import { generateStorageServiceToken, verifyStorageServiceToken } from '@/config/tokens'

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

/** @deprecated Use generateStorageServiceToken — kept for upload module import path. */
export interface TokenPayload {
  _id: string
  email?: string
  is2faPending?: boolean
}

/** Short-lived internal token for storage-service proxy calls only. */
export const generateToken = (payload: TokenPayload): string => {
  return generateStorageServiceToken({
    _id: payload._id,
    email: payload.email,
  })
}

export const verifyToken = (token: string): TokenPayload | null => {
  const decoded = verifyStorageServiceToken(token)
  if (!decoded) return null
  return { _id: decoded._id, email: decoded.email }
}
