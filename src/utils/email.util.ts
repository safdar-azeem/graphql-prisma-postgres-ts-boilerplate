import Queue from 'bull'
import nodemailer from 'nodemailer'
import { APP_NAME } from '@/constants'

const queueEmail = new Queue('email', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // Increased delay for Gmail rate limits
    },
  },
})

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // Use TLS
  auth: {
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || '',
  },
})

queueEmail.process(10, async (job) => {
  // Process 10 jobs concurrently
  const { to, subject, html } = job.data

  const mailOptions = {
    from: {
      name: APP_NAME,
      address: process.env.MAIL_USER || '',
    },
    to,
    subject,
    html,
  }

  try {
    await transporter.sendMail(mailOptions)
  } catch (error: any) {
    console.error(`Failed to send email to ${to}:`, error.message)
    throw error // Trigger Bull retry
  }
})

queueEmail.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`)
})

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    await queueEmail.add({ to, subject, html }, { attempts: 3 })
    return 'Email queued successfully'
  } catch (error: any) {
    console.error('Failed to queue email:', error.message)
    throw error
  }
}
