import { Router } from 'express';

export const authRouter = Router();

// POST /api/v1/auth/register
authRouter.post('/register', async (req, res) => {
  // TODO: Create user account, hash password, return JWT
  res.json({ success: true, message: 'Register endpoint — coming soon' });
});

// POST /api/v1/auth/login
authRouter.post('/login', async (req, res) => {
  // TODO: Validate credentials, return JWT + refresh token
  res.json({ success: true, message: 'Login endpoint — coming soon' });
});

// POST /api/v1/auth/google
authRouter.post('/google', async (req, res) => {
  // TODO: Google OAuth token exchange
  res.json({ success: true, message: 'Google OAuth — coming soon' });
});

// POST /api/v1/auth/apple
authRouter.post('/apple', async (req, res) => {
  // TODO: Apple OAuth token exchange
  res.json({ success: true, message: 'Apple OAuth — coming soon' });
});

// POST /api/v1/auth/refresh
authRouter.post('/refresh', async (req, res) => {
  // TODO: Refresh JWT with refresh token
  res.json({ success: true, message: 'Token refresh — coming soon' });
});

// POST /api/v1/auth/forgot-password
authRouter.post('/forgot-password', async (req, res) => {
  // TODO: Send password reset email
  res.json({ success: true, message: 'Forgot password — coming soon' });
});

// POST /api/v1/auth/reset-password
authRouter.post('/reset-password', async (req, res) => {
  // TODO: Reset password with token
  res.json({ success: true, message: 'Reset password — coming soon' });
});
