import { User, PrismaClient } from '@prisma/client'

export type AuthUser = Omit<User, 'password'>

export interface Context {
  user: AuthUser
  password: string
  isAuthenticated: boolean
  client: PrismaClient | null
}
