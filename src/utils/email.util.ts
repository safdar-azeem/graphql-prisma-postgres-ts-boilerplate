import { emailQueue } from '@/queues/email.queue'

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    await emailQueue.add('send-email', { to, subject, html })
    return 'Email queued successfully'
  } catch (error: any) {
    console.error('Failed to queue email:', error.message)
    throw error
  }
}
