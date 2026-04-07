const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  process.env.JWT_SECRET ||
  'CHANGE_THIS_BEFORE_PRODUCTION';
const JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '7d';

if (NODE_ENV === 'production' && JWT_ACCESS_SECRET === 'CHANGE_THIS_BEFORE_PRODUCTION') {
  throw new Error('Missing JWT secret: set JWT_ACCESS_SECRET before running in production');
}

module.exports = {
  JWT_ACCESS_SECRET,
  JWT_ACCESS_EXPIRES,
  NODE_ENV,
  COOKIE_OPTIONS: {
    httpOnly: true,
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
    secure: NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
};
