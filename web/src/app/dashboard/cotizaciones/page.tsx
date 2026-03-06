import { redirect } from 'next/navigation';

export default function CotizacionesRedirect() {
  redirect('/dashboard/trabajos?tab=propuestas');
}
