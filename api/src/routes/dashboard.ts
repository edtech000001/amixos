import { Router } from 'express';
import { authenticate } from '../middleware/auth';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

// GET /api/v1/dashboard — get dashboard data for business
dashboardRouter.get('/', async (req, res) => {
  // Returns: earnings, invoices summary, recent activity
  res.json({
    success: true,
    data: {
      earnings: { day: 0, month: 0, year: 0 },
      invoices: { recent: [], overdue: [], unpaid: [], paid: [] },
      recentActivity: [],
    },
  });
});
