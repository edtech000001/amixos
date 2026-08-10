// Storage location for optional payment photos (e.g. a picture of the check),
// attached to invoice_payments.photo_path. Lives in the private assets bucket
// and is signed on read like every other photo.

import { PRIVATE_ASSETS_BUCKET } from './storageUrls';

export const INVOICE_PAYMENT_BUCKET = PRIVATE_ASSETS_BUCKET; // 'business-private'

/** Path for a payment photo, scoped per business. `uid` should be random so a
 *  re-upload never collides with (or overwrites) another payment's photo.
 *
 *  LAYOUT MATTERS: the business-private bucket policies (migration 066) read
 *  the OWNING BUSINESS from the SECOND path segment (`<prefix>/<biz>/…`). The
 *  original `<biz>/invoice-payments/…` order put a non-uuid there, so RLS
 *  rejected every upload — silently, since the save flow tolerates a failed
 *  photo. Prefix-first matches files/jobs/equipment and just works. */
export function paymentPhotoPath(businessId: string, uid: string): string {
  return `invoice-payments/${businessId}/${uid}.jpg`;
}
