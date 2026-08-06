import { Queue, Worker, type Job } from 'bullmq'
import nodemailer from 'nodemailer'
import { APP_NAME, ENABLE_QUEUES } from '@/constants'
import { connectionOptions } from './connection'
import { registerQueueHandle } from './registry'

const QUEUE_NAME = 'email'

export interface EmailJobData {
  to: string
  subject: string
  html: string
}

let emailQueue: Queue<EmailJobData> | null = null
let emailWorker: Worker<EmailJobData> | null = null

function createTransporter() {
  const smtpTlsInsecure = process.env.SMTP_TLS_INSECURE === 'true'
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: !smtpTlsInsecure,
    },
  })
}

export function initEmailQueue(): Queue<EmailJobData> | null {
  if (!ENABLE_QUEUES) return null
  if (emailQueue) return emailQueue

  emailQueue = new Queue<EmailJobData>(QUEUE_NAME, {
    connection: connectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  })

  const transporter = createTransporter()

  emailWorker = new Worker<EmailJobData>(
    QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      const { to, subject, html } = job.data
      await transporter.sendMail({
        from: {
          name: APP_NAME,
          address: process.env.MAIL_USER || process.env.EMAIL_USER || '',
        },
        to,
        subject,
        html,
      })
      return { sent: true, to }
    },
    {
      connection: connectionOptions,
      concurrency: 10,
      limiter: { max: 50, duration: 1000 },
    }
  )

  emailWorker.on('failed', (job, err) => {
    // Structured logging is attached by the app logger when available
    process.stderr.write(
      JSON.stringify({
        level: 'error',
        msg: 'EmailQueue job failed',
        jobId: job?.id,
        error: err.message,
      }) + '\n'
    )
  })

  registerQueueHandle({ queue: emailQueue, worker: emailWorker })
  return emailQueue
}

export function getEmailQueue(): Queue<EmailJobData> | null {
  return emailQueue
}

/** Direct send when queues are disabled (best-effort, fire-and-forget friendly). */
export async function sendEmailDirect(to: string, subject: string, html: string): Promise<void> {
  const transporter = createTransporter()
  await transporter.sendMail({
    from: {
      name: APP_NAME,
      address: process.env.MAIL_USER || process.env.EMAIL_USER || '',
    },
    to,
    subject,
    html,
  })
}
