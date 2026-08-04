import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildContactMessage,
  isContactEmailConfigured,
  sendContactEmail,
} from './contactEmail.js'

const env = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'sender@example.com',
  SMTP_PASS: 'test-secret',
  CONTACT_FROM_EMAIL: 'sender@example.com',
  CONTACT_TO_EMAIL: 'hello@laubase.xyz',
}

test('requires complete server-side SMTP configuration', () => {
  assert.equal(isContactEmailConfigured(env), true)
  assert.equal(isContactEmailConfigured({ ...env, SMTP_PASS: '' }), false)
})

test('builds a text-only message with a safe subject and visitor reply-to', () => {
  const message = buildContactMessage({
    name: 'Aina\r\nInjected',
    email: 'aina@example.com',
    subject: 'Partnership\r\nBcc: attacker@example.com',
    message: 'I would like to discuss a data partnership.',
  }, env)

  assert.equal(message.to, 'hello@laubase.xyz')
  assert.deepEqual(message.replyTo, { name: 'Aina Injected', address: 'aina@example.com' })
  assert.equal(message.subject, '[LaunchBase Search] Partnership Bcc: attacker@example.com')
  assert.match(message.text, /data partnership/)
  assert.equal('html' in message, false)
})

test('sends through an injected transport without persisting the message', async () => {
  let delivered
  const transport = {
    async sendMail(message) {
      delivered = message
      return { accepted: [message.to] }
    },
  }
  const result = await sendContactEmail({
    name: 'Aina',
    email: 'aina@example.com',
    subject: 'Feedback',
    message: 'The market scan was useful.',
  }, { env, transport })

  assert.equal(result.accepted, 1)
  assert.equal(delivered.to, 'hello@laubase.xyz')
})
