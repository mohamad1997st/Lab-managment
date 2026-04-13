const router = require('express').Router();
const auth = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');

router.get('/status', auth.status);
router.get('/session', auth.session);
router.get('/google/start', auth.googleStart);
router.get('/google/callback', auth.googleCallback);
router.post('/setup', auth.setupAdmin);
router.post('/login', auth.login);
router.post('/logout', auth.logout);
router.post('/forgot-password', auth.requestPasswordReset);
router.get('/reset-password/:token', auth.getPasswordResetToken);
router.post('/reset-password/:token', auth.resetPassword);

router.get('/me', requireAuth, auth.me);
router.put('/me', requireAuth, auth.updateMe);

module.exports = router;
