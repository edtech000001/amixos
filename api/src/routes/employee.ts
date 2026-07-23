import { Router } from 'express';
import { authenticate, requireBusinessRole } from '../middleware/auth';

export const employeeRouter = Router();

employeeRouter.use(authenticate);

// Role gates resolve the caller's role from business_members (requires a
// business_id in the body/query), NOT from the JWT's user_metadata.

// GET /api/v1/employees
employeeRouter.get('/', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/employees — owner/manager only
employeeRouter.post('/', requireBusinessRole('owner', 'manager'), async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// GET /api/v1/employees/:id
employeeRouter.get('/:id', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// PUT /api/v1/employees/:id
employeeRouter.put('/:id', requireBusinessRole('owner', 'manager'), async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// DELETE /api/v1/employees/:id
employeeRouter.delete('/:id', requireBusinessRole('owner'), async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});
