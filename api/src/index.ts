import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { authRouter } from './routes/auth';
import { businessRouter } from './routes/business';
import { employeeRouter } from './routes/employee';
import { invoiceRouter } from './routes/invoice';
import { clientRouter } from './routes/client';
import { timesheetRouter } from './routes/timesheet';
import { dashboardRouter } from './routes/dashboard';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security & Middleware
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'amixos-api' }));

// Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/business', businessRouter);
app.use('/api/v1/employees', employeeRouter);
app.use('/api/v1/invoices', invoiceRouter);
app.use('/api/v1/clients', clientRouter);
app.use('/api/v1/timesheet', timesheetRouter);
app.use('/api/v1/dashboard', dashboardRouter);

// Error handling
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Amixos API running on port ${PORT}`);
});

export default app;
