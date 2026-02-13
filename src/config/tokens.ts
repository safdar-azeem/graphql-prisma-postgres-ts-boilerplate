import jwt, { SignOptions } from 'jsonwebtoken'
import { JWT_SECRET, ACCESS_TOKEN_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN } from '@/constants'
import crypto from 'crypto'

export interface AccessTokenPayload {
  _id: string
  email?: string
  is2faPending?: boolean
}

export interface RefreshTokenPayload {
  jti: string
  sub: string // userId
}

export const generateAccessToken = (payload: AccessTokenPayload): string => {
  const options: SignOptions = {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  }
  return jwt.sign(payload, JWT_SECRET, options)
}

export const generateRefreshToken = (userId: string): { token: string; jti: string } => {
  const jti = crypto.randomUUID()
  const payload: RefreshTokenPayload = {
    jti,
    sub: userId,
  }
  const options: SignOptions = {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  }

  const token = jwt.sign(payload, JWT_SECRET, options)
  return { token, jti }
}

export const verifyAccessToken = (token: string): AccessTokenPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as AccessTokenPayload
  } catch {
    return null
  }
}

export const verifyRefreshToken = (token: string): RefreshTokenPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as RefreshTokenPayload
  } catch {
    return null
  }
}

export const generateTokenPair = (user: { id: string; email: string }) => {
  const accessToken = generateAccessToken({ _id: user.id, email: user.email })
  const { token: refreshToken, jti } = generateRefreshToken(user.id)
  return { accessToken, refreshToken, jti }
}
