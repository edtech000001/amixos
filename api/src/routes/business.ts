import { Router } from 'express';
import { authenticate } from '../middleware/auth';

export const businessRouter = Router();

// All business routes require auth
businessRouter.use(authenticate);

// GET /api/v1/business — list all businesses for user
businessRouter.get('/', async (req, res) => {
  res.json({ success: true, data: [] });
});

// POST /api/v1/business — create new business
businessRouter.post('/', async (req, res) => {
  res.json({ success: true, message: 'Create business — coming soon' });
});

// GET /api/v1/business/:id — get single business
businessRouter.get('/:id', async (req, res) => {
  res.json({ success: true, data: null });
});

// PUT /api/v1/business/:id — update business
businessRouter.put('/:id', async (req, res) => {
  res.json({ success: true, message: 'Update business — coming soon' });
});

// DELETE /api/v1/business/:id — delete business
businessRouter.delete('/:id', async (req, res) => {
  res.json({ success: true, message: 'Delete business — coming soon' });
});

// POST /api/v1/business/:id/switch — switch active business
businessRouter.post('/:id/switch', async (req, res) => {
  res.json({ success: true, message: 'Switch business — coming soon' });
});

// GET /api/v1/business/:id/modules — get active modules
businessRouter.get('/:id/modules', async (req, res) => {
  res.json({ success: true, data: [] });
});

// POST /api/v1/business/:id/modules/:moduleId — activate module
businessRouter.post('/:id/modules/:moduleId', async (req, res) => {
  res.json({ success: true, message: 'Activate module — coming soon' });
});
