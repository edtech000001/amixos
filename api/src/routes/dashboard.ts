import { Router } from 'express';
import { authenticate } from '../middleware/auth';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

// GET /api/v1/dashboard — get dashboard data for business
dashboardRouter.get('/', async (req, res) => {
  // Returns: earnings, invoices summary, recent activity
  res.status(501).json({ success: false, message: 'not_implemented' });
});
