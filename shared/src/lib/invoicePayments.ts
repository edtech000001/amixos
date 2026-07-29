// Storage location for optional payment photos (e.g. a picture of the check),
// attached to invoice_payments.photo_path. Lives in the private assets bucket
// and is signed on read like every other photo.

import { PRIVATE_ASSETS_BUCKET } from './storageUrls';

export const INVOICE_PAYMENT_BUCKET = PRIVATE_ASSETS_BUCKET; // 'business-private'

/** Path for a payment photo, scoped per business. `uid` should be random so a
 *  re-upload never collides with (or overwrites) another payment's photo. */
export function paymentPhotoPath(businessId: string, uid: string): string {
  return `${businessId}/invoice-payments/${uid}.jpg`;
}
