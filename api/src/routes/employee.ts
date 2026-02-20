import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';

export const employeeRouter = Router();

employeeRouter.use(authenticate);

// GET /api/v1/employees
employeeRouter.get('/', async (req, res) => {
  res.json({ success: true, data: [] });
});

// POST /api/v1/employees — owner/manager only
employeeRouter.post('/', requireRole('owner', 'manager'), async (req, res) => {
  res.json({ success: true, message: 'Add employee — coming soon' });
});

// GET /api/v1/employees/:id
employeeRouter.get('/:id', async (req, res) => {
  res.json({ success: true, data: null });
});

// PUT /api/v1/employees/:id
employeeRouter.put('/:id', requireRole('owner', 'manager'), async (req, res) => {
  res.json({ success: true, message: 'Update employee — coming soon' });
});

// DELETE /api/v1/employees/:id
employeeRouter.delete('/:id', requireRole('owner'), async (req, res) => {
  res.json({ success: true, message: 'Delete employee — coming soon' });
});
