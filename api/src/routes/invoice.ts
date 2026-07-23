import { Router } from 'express';
import { authenticate } from '../middleware/auth';

export const invoiceRouter = Router();

invoiceRouter.use(authenticate);

// GET /api/v1/invoices
invoiceRouter.get('/', async (req, res) => {
  // Query params: status (paid|unpaid|overdue), businessId
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/invoices
invoiceRouter.post('/', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// GET /api/v1/invoices/:id
invoiceRouter.get('/:id', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// PUT /api/v1/invoices/:id
invoiceRouter.put('/:id', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// DELETE /api/v1/invoices/:id
invoiceRouter.delete('/:id', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/invoices/:id/send
invoiceRouter.post('/:id/send', async (req, res) => {
  res.status(501).json({ success: false, message: 'not_implemented' });
});

// POST /api/v1/invoices/:id/pay
invoiceRouter.post('/:id/pay', async (req, res) => {
  // Stripe payment intent
  res.status(501).json({ success: false, message: 'not_implemented' });
});
