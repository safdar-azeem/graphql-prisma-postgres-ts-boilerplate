import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken'
import {
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_ALGORITHM,
  STORAGE_SERVICE_TOKEN_SECRET,
  STORAGE_SERVICE_TOKEN_ISSUER,
  STORAGE_SERVICE_TOKEN_AUDIENCE,
  STORAGE_SERVICE_TOKEN_EXPIRES_IN,
} from '@/constants'
import { UserType } from '@prisma/client'
import crypto from 'crypto'

export const ACCESS_TOKEN_TYPE = 'access' as const
export const STORAGE_SERVICE_TOKEN_TYPE = 'storage-service' as const

export interface AccessTokenPayload {
  _id: string
  email?: string
  userType?: UserType
  workspaceId?: string
  is2faPending?: boolean
  tokenType?: typeof ACCESS_TOKEN_TYPE
}

export interface RefreshTokenPayload {
  jti: string
  sub: string
}

export interface StorageServiceTokenPayload {
  _id: string
  email?: string
  tokenType: typeof STORAGE_SERVICE_TOKEN_TYPE
}

const accessSignOptions: SignOptions = {
  expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  algorithm: JWT_ALGORITHM,
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
}

const refreshSignOptions: SignOptions = {
  expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  algorithm: JWT_ALGORITHM,
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
}

const storageSignOptions: SignOptions = {
  expiresIn: STORAGE_SERVICE_TOKEN_EXPIRES_IN,
  algorithm: JWT_ALGORITHM,
  issuer: STORAGE_SERVICE_TOKEN_ISSUER,
  audience: STORAGE_SERVICE_TOKEN_AUDIENCE,
}

const accessVerifyOptions: VerifyOptions = {
  algorithms: [JWT_ALGORITHM],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
}

const refreshVerifyOptions: VerifyOptions = {
  algorithms: [JWT_ALGORITHM],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
}

const storageVerifyOptions: VerifyOptions = {
  algorithms: [JWT_ALGORITHM],
  issuer: STORAGE_SERVICE_TOKEN_ISSUER,
  audience: STORAGE_SERVICE_TOKEN_AUDIENCE,
}

export const generateAccessToken = (payload: AccessTokenPayload): string => {
  return jwt.sign(
    { ...payload, tokenType: ACCESS_TOKEN_TYPE },
    ACCESS_TOKEN_SECRET,
    accessSignOptions
  )
}

export const generateRefreshToken = (userId: string): { token: string; jti: string } => {
  const jti = crypto.randomUUID()
  const payload: RefreshTokenPayload = { jti, sub: userId }
  const token = jwt.sign(payload, REFRESH_TOKEN_SECRET, refreshSignOptions)
  return { token, jti }
}

export const generateStorageServiceToken = (payload: {
  _id: string
  email?: string
}): string => {
  const body: StorageServiceTokenPayload = {
    _id: payload._id,
    email: payload.email,
    tokenType: STORAGE_SERVICE_TOKEN_TYPE,
  }
  return jwt.sign(body, STORAGE_SERVICE_TOKEN_SECRET, storageSignOptions)
}

export const verifyAccessToken = (token: string): AccessTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET, accessVerifyOptions) as AccessTokenPayload
    // Reject internal service tokens even if signed with a leaked/shared secret
    if (decoded.tokenType && decoded.tokenType !== ACCESS_TOKEN_TYPE) {
      return null
    }
    if ((decoded as any).tokenType === STORAGE_SERVICE_TOKEN_TYPE) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

export const verifyRefreshToken = (token: string): RefreshTokenPayload | null => {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET, refreshVerifyOptions) as RefreshTokenPayload
  } catch {
    return null
  }
}

export const verifyStorageServiceToken = (
  token: string
): StorageServiceTokenPayload | null => {
  try {
    const decoded = jwt.verify(
      token,
      STORAGE_SERVICE_TOKEN_SECRET,
      storageVerifyOptions
    ) as StorageServiceTokenPayload
    if (decoded.tokenType !== STORAGE_SERVICE_TOKEN_TYPE || !decoded._id) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

export const generateTokenPair = (user: {
  id: string
  email: string
  userType?: UserType
  workspaceId?: string
}) => {
  const accessToken = generateAccessToken({
    _id: user.id,
    email: user.email,
    userType: user.userType,
    workspaceId: user.workspaceId,
  })
  const { token: refreshToken, jti } = generateRefreshToken(user.id)
  return { accessToken, refreshToken, jti }
}

export const hashToken = (raw: string): string => {
  return crypto.createHash('sha256').update(raw).digest('hex')
}
