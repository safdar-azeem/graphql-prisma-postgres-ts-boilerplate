import { Queue, Worker, Job } from 'bullmq'
import { connectionOptions } from './connection'
import nodemailer from 'nodemailer'
import { APP_NAME } from '@/constants'

const QUEUE_NAME = 'email'

interface EmailJobData {
  to: string
  subject: string
  html: string
}

// 1. Create Data Queue
export const emailQueue = new Queue<EmailJobData>(QUEUE_NAME, {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed for 7 days
    },
  },
})

// 2. Setup Transporter (Nodemailer)
// Reused from original email.util.ts logic
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
})

// 3. Create Worker
export const emailWorker = new Worker<EmailJobData>(
  QUEUE_NAME,
  async (job: Job<EmailJobData>) => {
    const { to, subject, html } = job.data

    const mailOptions = {
      from: {
        name: APP_NAME,
        address: process.env.MAIL_USER || process.env.EMAIL_USER || '',
      },
      to,
      subject,
      html,
    }

    try {
      await transporter.sendMail(mailOptions)
      return { sent: true, to }
    } catch (error: any) {
      // Throwing error triggers BullMQ retry
      throw new Error(`Failed to send email to ${to}: ${error.message}`)
    }
  },
  {
    connection: connectionOptions,
    concurrency: 10,
    limiter: {
      max: 50,
      duration: 1000,
    },
  }
)

// Worker Event Listeners
emailWorker.on('completed', (job) => {
  // console.log(`[EmailQueue] Job ${job.id} completed. Sent to ${job.data.to}`)
})

emailWorker.on('failed', (job, err) => {
  console.error(`[EmailQueue] Job ${job?.id} failed: ${err.message}`)
})
