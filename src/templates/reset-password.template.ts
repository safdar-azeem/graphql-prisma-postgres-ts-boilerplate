import { FRONTEND_URL, APP_NAME } from '@/constants'

interface ResetPasswordEmailProps {
	token: string
	name?: string
}

export const getResetPasswordEmailTemplate = ({
	token,
	name,
}: ResetPasswordEmailProps) => {
	// FIX: Updated route to match frontend structure (/auth/reset-password)
	const resetUrl = `${FRONTEND_URL}/auth/reset-password?token=${token}`

	return `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Hello ${name || 'User'},</h2>
      <p style="color: #666; font-size: 16px;">We received a request to reset your password for your <strong>${APP_NAME}</strong> account.</p>
      
      <div style="margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
      </div>
      
      <p style="color: #666; font-size: 14px;">Or verify using this link:</p>
      <p><a href="${resetUrl}" style="color: #0066cc;">${resetUrl}</a></p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      
      <p style="color: #999; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
      <p style="color: #999; font-size: 13px;">This link will expire in 1 hour.</p>
    </div>
  `
}

