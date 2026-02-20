import { Router } from 'express';
import { authenticate } from '../middleware/auth';

export const invoiceRouter = Router();

invoiceRouter.use(authenticate);

// GET /api/v1/invoices
invoiceRouter.get('/', async (req, res) => {
  // Query params: status (paid|unpaid|overdue), businessId
  res.json({ success: true, data: [] });
});

// POST /api/v1/invoices
invoiceRouter.post('/', async (req, res) => {
  res.json({ success: true, message: 'Create invoice — coming soon' });
});

// GET /api/v1/invoices/:id
invoiceRouter.get('/:id', async (req, res) => {
  res.json({ success: true, data: null });
});

// PUT /api/v1/invoices/:id
invoiceRouter.put('/:id', async (req, res) => {
  res.json({ success: true, message: 'Update invoice — coming soon' });
});

// DELETE /api/v1/invoices/:id
invoiceRouter.delete('/:id', async (req, res) => {
  res.json({ success: true, message: 'Delete invoice — coming soon' });
});

// POST /api/v1/invoices/:id/send
invoiceRouter.post('/:id/send', async (req, res) => {
  res.json({ success: true, message: 'Send invoice — coming soon' });
});

// POST /api/v1/invoices/:id/pay
invoiceRouter.post('/:id/pay', async (req, res) => {
  // Stripe payment intent
  res.json({ success: true, message: 'Pay invoice — coming soon' });
});
