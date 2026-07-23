import { Router } from 'express';
import { authenticate } from '../middleware/auth';

export const clientRouter = Router();

clientRouter.use(authenticate);

// GET /api/v1/clients
clientRouter.get('/', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/clients
clientRouter.post('/', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// GET /api/v1/clients/:id
clientRouter.get('/:id', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// PUT /api/v1/clients/:id
clientRouter.put('/:id', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// DELETE /api/v1/clients/:id
clientRouter.delete('/:id', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});
