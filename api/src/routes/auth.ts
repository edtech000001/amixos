import { Router } from 'express';

export const authRouter = Router();

// POST /api/v1/auth/register
authRouter.post('/register', async (req, res) => {
  // TODO: Create user account, hash password, return JWT
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/auth/login
authRouter.post('/login', async (req, res) => {
  // TODO: Validate credentials, return JWT + refresh token
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/auth/google
authRouter.post('/google', async (req, res) => {
  // TODO: Google OAuth token exchange
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/auth/apple
authRouter.post('/apple', async (req, res) => {
  // TODO: Apple OAuth token exchange
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/auth/refresh
authRouter.post('/refresh', async (req, res) => {
  // TODO: Refresh JWT with refresh token
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/auth/forgot-password
authRouter.post('/forgot-password', async (req, res) => {
  // TODO: Send password reset email
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/auth/reset-password
authRouter.post('/reset-password', async (req, res) => {
  // TODO: Reset password with token
  res.status(501).json({ success: false, message: 'not_implemented' });
});
