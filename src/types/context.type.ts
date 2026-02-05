import { User, PrismaClient } from '@/generated/prisma'

export type AuthUser = Omit<User, 'password'>

export interface Context {
  user: AuthUser
  password: string
  isAuthenticated: boolean
  client: PrismaClient | null
}
