import { Router } from 'express';
import { authenticate } from '../middleware/auth';

export const timesheetRouter = Router();

timesheetRouter.use(authenticate);

// POST /api/v1/timesheet/clock-in
timesheetRouter.post('/clock-in', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/timesheet/clock-out
timesheetRouter.post('/clock-out', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// GET /api/v1/timesheet — get timesheet for period
timesheetRouter.get('/', async (req, res) => {
  // Query params: employeeId, startDate, endDate, businessId
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// GET /api/v1/timesheet/summary
timesheetRouter.get('/summary', async (req, res) => {
  // Returns total hours + pay per employee
  res.status(501).json({ success: false, message: 'not_implemented' });
});
