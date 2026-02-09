import Queue from 'bull'
import nodemailer from 'nodemailer'
import { APP_NAME } from '@/constants'
import dotenv from 'dotenv'
dotenv.config()

const redisUrl = process.env.REDIS_URL
const isProduction = process.env.NODE_ENV === 'production'

const emailQueue = redisUrl
  ? new Queue('email', redisUrl, {
      redis: isProduction
        ? {
            tls: { rejectUnauthorized: false },
          }
        : undefined,
    })
  : new Queue('email', {
      redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    })

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
})

emailQueue.process(10, async (job) => {
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

emailQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`)
})

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    await emailQueue.add({ to, subject, html }, { attempts: 3 })
    return 'Email queued successfully'
  } catch (error: any) {
    console.error('Failed to queue email:', error.message)
    throw error
  }
}
