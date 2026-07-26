import jwt from 'jsonwebtoken'

const secret = () => process.env.JWT_SECRET || 'development-only-change-me'

export function createToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, plan: user.plan }, secret(), { expiresIn: '7d' })
}

export function optionalAuth(request, _response, next) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (token) {
    try {
      request.user = jwt.verify(token, secret())
    } catch {
      request.user = null
    }
  }
  next()
}

export function requireAuth(request, response, next) {
  optionalAuth(request, response, () => {
    if (!request.user) return response.status(401).json({ error: 'Authentication required' })
    next()
  })
}
