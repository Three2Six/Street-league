import jwt from 'jsonwebtoken';

export function signToken(user) {
  return jwt.sign({ sub: user.id, nickname: user.nickname }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    req.nickname = payload.nickname;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
