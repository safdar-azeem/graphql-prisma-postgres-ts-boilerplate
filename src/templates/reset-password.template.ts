import { FRONTEND_URL, APP_NAME } from '@/constants'

interface ResetPasswordEmailProps {
  token: string
  name?: string
}

export const getResetPasswordEmailTemplate = ({ token, name }: ResetPasswordEmailProps) => {
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`

  return `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Hello ${name || 'User'},</h2>
      <p>We received a request to reset your password for your ${APP_NAME} account.</p>
      <p>Click the button below to reset your password:</p>
      <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
      <p>Or verify using this link: <a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p>This link will expire in 1 hour.</p>
    </div>
  `
}
