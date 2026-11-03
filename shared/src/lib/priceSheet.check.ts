// Self-check: `npx tsx shared/src/lib/priceSheet.check.ts` — exits non-zero on failure.
import assert from 'node:assert';
import { autopriceLine, rowToPriceSheetItem } from './priceSheet';
import { computeTotals } from './invoicing';

const item = rowToPriceSheetItem({ id: 'x', name: 'Fence', category: null, pricing_mode: 'per_unit', unit_label: 'ft', rate: 0.335 } as never);
const line = autopriceLine(item, 10000);
assert.strictEqual(line.unitPrice, 0.335, 'per-unit rate stored exactly');
assert.strictEqual(computeTotals([{ description: 'Fence', qty: line.quantity, rate: line.unitPrice }], 0, 0).total, 3350);
console.log('priceSheet check ok');
