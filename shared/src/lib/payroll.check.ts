// Self-check: `npx tsx shared/src/lib/payroll.check.ts` — exits non-zero on failure.
import assert from 'node:assert';
import { computePayrollRows, computePayrollRowsFromAggregates, type PayrollEmployee } from './payroll';

const emp: PayrollEmployee = { id: 'e1', first_name: 'Ana', last_name: 'R', pay_rate: 100, pay_type: 'daily' };
const period = { startStr: '2026-11-02', endStr: '2026-11-08' };
const job = (d: string, h: number) => ({ scheduled_date: d, total_hours: h, driver_employee_ids: null, driver_hours: null, assignmentEmployeeIds: ['e1'] });

// 5 days × 4 h → 5 days (old rule paid ceil(20/8) = 3).
const five = computePayrollRows({ employees: [emp], timesheets: [], period,
  jobs: ['02', '03', '04', '05', '06'].map(d => job(`2026-11-${d}`, 4)) });
assert.strictEqual(five[0].pay, 500);

// 2 days × 10 h → 2 days (old rule: 3). Two jobs + a timesheet on one day = 1 day.
const two = computePayrollRows({ employees: [emp], period,
  jobs: [job('2026-11-02', 6), job('2026-11-02', 4), job('2026-11-03', 10)],
  timesheets: [{ employee_id: 'e1', hours_worked: 2, work_date: '2026-11-03' }] });
assert.strictEqual(two[0].pay, 200);

// Server aggregates path (migration 268 dates) agrees.
const agg = computePayrollRowsFromAggregates({ period, aggregates: [{ employee: emp, worked: 20, driven: 0, jobsDriven: 0,
  workedDates: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'], drivenDates: [] }] });
assert.strictEqual(agg[0].pay, 500);

console.log('payroll check ok');
