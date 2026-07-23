import { Router } from 'express';
import { authenticate } from '../middleware/auth';

export const businessRouter = Router();

// All business routes require auth
businessRouter.use(authenticate);

// GET /api/v1/business — list all businesses for user
businessRouter.get('/', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/business — create new business
businessRouter.post('/', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// GET /api/v1/business/:id — get single business
businessRouter.get('/:id', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// PUT /api/v1/business/:id — update business
businessRouter.put('/:id', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// DELETE /api/v1/business/:id — delete business
businessRouter.delete('/:id', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/business/:id/switch — switch active business
businessRouter.post('/:id/switch', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// GET /api/v1/business/:id/modules — get active modules
businessRouter.get('/:id/modules', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/business/:id/modules/:moduleId — activate module
businessRouter.post('/:id/modules/:moduleId', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});
