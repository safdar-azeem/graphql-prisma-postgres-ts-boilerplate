import { ValidationError } from '@/errors'
import { normalizeEmail } from '@/utils/email-normalize.util'

export interface SignupInput {
  email: string
  username: string
  password: string
  workspaceName: string
  workspaceSlug?: string | null
}

export interface LoginInput {
  email: string
  password: string
}

export function validateSignupInput(data: SignupInput) {
  const email = normalizeEmail(data.email)
  const username = data.username?.trim()
  const password = data.password
  const workspaceName = data.workspaceName?.trim()

  if (!email || !email.includes('@')) {
    throw new ValidationError('A valid email is required')
  }
  if (!username || username.length < 2 || username.length > 64) {
    throw new ValidationError('Username must be between 2 and 64 characters')
  }
  if (!password || password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters')
  }
  if (!workspaceName || workspaceName.length < 2 || workspaceName.length > 100) {
    throw new ValidationError('Workspace name must be between 2 and 100 characters')
  }

  return {
    email,
    username,
    password,
    workspaceName,
    workspaceSlug: data.workspaceSlug?.trim() || undefined,
  }
}

export function validateLoginInput(data: LoginInput) {
  const email = normalizeEmail(data.email)
  if (!email || !data.password) {
    throw new ValidationError('Email and password are required')
  }
  return {
    email,
    password: data.password,
  }
}
