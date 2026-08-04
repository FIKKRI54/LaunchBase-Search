import nodemailer from 'nodemailer'

const truthy = (value) => /^(1|true|yes)$/i.test(String(value || ''))
const singleLine = (value) => String(value || '').replace(/[\r\n]+/g, ' ').trim()

export function getContactEmailConfig(env = process.env) {
  const port = Number(env.SMTP_PORT || 465)
  return {
    host: String(env.SMTP_HOST || '').trim(),
    port: Number.isInteger(port) && port > 0 ? port : 465,
    secure: env.SMTP_SECURE === undefined ? port === 465 : truthy(env.SMTP_SECURE),
    user: String(env.SMTP_USER || '').trim(),
    password: String(env.SMTP_PASS || ''),
    from: String(env.CONTACT_FROM_EMAIL || env.SMTP_USER || '').trim(),
    to: String(env.CONTACT_TO_EMAIL || '').trim(),
  }
}

export function isContactEmailConfigured(env = process.env) {
  const config = getContactEmailConfig(env)
  return Boolean(config.host && config.user && config.password && config.from && config.to)
}

export function buildContactMessage(input, env = process.env) {
  const config = getContactEmailConfig(env)
  const name = singleLine(input.name)
  const email = singleLine(input.email)
  const subject = singleLine(input.subject)
  return {
    from: { name: 'LaunchBase Search website', address: config.from },
    to: config.to,
    replyTo: { name, address: email },
    subject: `[LaunchBase Search] ${subject}`,
    text: [
      'New message from the LaunchBase Search contact form',
      '',
      `Name: ${name}`,
      `Email: ${email}`,
      `Subject: ${subject}`,
      '',
      String(input.message || '').trim(),
    ].join('\n'),
  }
}

let cachedTransport = null
let cachedTransportKey = ''

function getTransport(config) {
  const key = `${config.host}:${config.port}:${config.secure}:${config.user}`
  if (cachedTransport && cachedTransportKey === key) return cachedTransport
  cachedTransportKey = key
  cachedTransport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  return cachedTransport
}

export async function sendContactEmail(input, { env = process.env, transport } = {}) {
  const config = getContactEmailConfig(env)
  if (!isContactEmailConfigured(env)) {
    const error = new Error('Contact email delivery is not configured')
    error.code = 'CONTACT_EMAIL_NOT_CONFIGURED'
    error.statusCode = 503
    throw error
  }

  try {
    const sender = transport || getTransport(config)
    const result = await sender.sendMail(buildContactMessage(input, env))
    return { accepted: Array.isArray(result.accepted) ? result.accepted.length : 0 }
  } catch (cause) {
    const error = new Error('The message could not be delivered. Please try again later.')
    error.code = 'CONTACT_DELIVERY_FAILED'
    error.statusCode = 502
    error.cause = cause
    throw error
  }
}
