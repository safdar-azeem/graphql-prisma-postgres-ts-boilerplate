import { ENABLE_QUEUES } from '@/constants'
import { getEmailQueue, sendEmailDirect } from '@/queues/email.queue'

/**
 * Queue email when queues are enabled; otherwise attempt direct SMTP.
 * Callers that must not leak account existence should void/catch this promise.
 */
export const sendEmail = async (to: string, subject: string, html: string) => {
  if (ENABLE_QUEUES) {
    const queue = getEmailQueue()
    if (!queue) {
      throw new Error('Email queue is not initialized. Call startQueues() during startup.')
    }
    await queue.add('send-email', { to, subject, html })
    return 'Email queued successfully'
  }

  await sendEmailDirect(to, subject, html)
  return 'Email sent successfully'
}
