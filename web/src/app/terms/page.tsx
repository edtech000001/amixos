// Terms of service — public, no auth. Linked from both apps' signup screens.
//
// Describes how the product actually behaves today: 14-day trial, per-business
// subscription billed through Stripe, in-app deletion with a 30-day window.
// Anything stated here has a counterpart in code; keep them in step.

import type { Metadata } from 'next';
import { LegalPage, type LegalContent, type Lang } from '../(legal)/LegalPage';

export const metadata: Metadata = {
  title: 'Términos de Servicio · Amixos',
  description: 'Las reglas para usar Amixos.',
};

// TODO(legal): replace with the registered company name before launch.
const ENTITY = '[NOMBRE LEGAL DE LA EMPRESA]';
const UPDATED_ES = 'Última actualización: 22 de septiembre de 2026';
const UPDATED_EN = 'Last updated: September 22, 2026';

const content: Record<Lang, LegalContent> = {
  es: {
    title: 'Términos de Servicio',
    updated: UPDATED_ES,
    intro: [
      `Estos términos son el acuerdo entre tú y ${ENTITY} ("Amixos", "nosotros") por el uso de la aplicación Amixos. Al crear una cuenta, aceptas lo que sigue.`,
      'Están escritos para que se entiendan. Si algo no te queda claro, escríbenos a soporte@amixos.com antes de registrarte.',
    ],
    sections: [
      {
        heading: '1. Qué es el servicio',
        body: [
          'Amixos es un software para administrar un negocio de servicios: clientes, trabajos, propuestas, facturas, empleados, nómina, inventario y equipo, con módulos adicionales según tu industria.',
          'Es una herramienta administrativa. **No somos contadores, abogados ni asesores fiscales**, y los cálculos que hace la app (impuestos, nómina, totales) son ayudas que tú debes revisar antes de usarlos con tus clientes o autoridades.',
        ],
      },
      {
        heading: '2. Tu cuenta',
        body: [
          'Debes ser mayor de edad y dar información real al registrarte. Eres responsable de lo que pase en tu cuenta y de cuidar tu contraseña.',
          'Si invitas a otras personas a tu negocio, eres responsable de lo que hagan dentro de él y de los permisos que les des.',
        ],
      },
      {
        heading: '3. Prueba gratis y suscripción',
        body: [
          '- La prueba gratuita dura **14 días** y no pide tarjeta.',
          '- Al terminar la prueba, necesitas un plan para seguir usando el negocio. La suscripción es **por negocio**, no por persona: si administras dos negocios, cada uno necesita su plan.',
          '- Los pagos se procesan con **Stripe**. Al suscribirte autorizas el cobro recurrente (mensual o anual) hasta que canceles.',
          '- **Puedes cancelar cuando quieras** desde el portal de facturación. La cancelación toma efecto al final del periodo que ya pagaste; conservas el acceso hasta esa fecha y no se cobra el siguiente.',
          '- No hay reembolsos automáticos por periodos ya pagados. Si algo salió mal, escríbenos y lo vemos caso por caso.',
          '- Podemos cambiar los precios. Si eso te afecta, te avisaremos con anticipación y podrás cancelar antes de que aplique.',
        ],
      },
      {
        heading: '4. Tus datos son tuyos',
        body: [
          'Todo lo que capturas —clientes, trabajos, facturas, archivos— **te pertenece**. No reclamamos propiedad sobre ello.',
          'Nos das permiso para almacenarlo y procesarlo únicamente con el fin de darte el servicio (ver el Aviso de Privacidad).',
          'Puedes exportar tu información a CSV o PDF desde la app en cualquier momento, incluso antes de cancelar.',
        ],
      },
      {
        heading: '5. Uso aceptable',
        body: [
          'No uses Amixos para:',
          '- actividades ilegales, fraude o facturas falsas;',
          '- guardar datos de personas sin tener derecho a hacerlo;',
          '- enviar correos o mensajes no solicitados (spam) a través de las funciones de envío;',
          '- intentar acceder a datos de otros negocios, romper la seguridad o sobrecargar el servicio de forma automatizada.',
          'Podemos suspender una cuenta que haga esto, y si es grave, cerrarla.',
        ],
      },
      {
        heading: '6. Eliminación de tu cuenta',
        body: [
          'Puedes eliminar tu cuenta o tu negocio desde **Ajustes → Cuenta → Zona de peligro**, sin pedirnos permiso.',
          'Cuando lo haces: tu suscripción se cancela de inmediato, pierdes el acceso, y **todo se borra definitivamente 30 días después**. Durante esos 30 días puedes iniciar sesión y restaurarla. La suscripción cancelada no se restaura sola: tendrás que elegir un plan de nuevo.',
          'Si eres dueño de un negocio con más personas, primero debes transferirlo o eliminarlo; así nadie pierde su información sin que el dueño lo decida.',
        ],
      },
      {
        heading: '7. Disponibilidad del servicio',
        body: [
          'Hacemos lo posible por mantener Amixos funcionando, pero no garantizamos que esté disponible sin interrupciones. Hay mantenimientos, fallas de proveedores y errores.',
          'Guarda respaldos de la información crítica de tu negocio. La función de exportar existe para eso.',
        ],
      },
      {
        heading: '8. Servicios de terceros',
        body: [
          'Algunas funciones dependen de terceros (Stripe para pagos, Google Maps, Google Contacts, el asistente de Anthropic). Esas funciones están sujetas también a los términos de esos proveedores, y si uno falla o cambia, la función puede cambiar con él.',
        ],
      },
      {
        heading: '9. Límite de responsabilidad',
        body: [
          'Amixos se ofrece "tal cual". En la medida que la ley lo permita, no somos responsables por pérdida de ganancias, de datos, ni por daños indirectos derivados del uso del servicio.',
          'Nuestra responsabilidad total por cualquier reclamo se limita a lo que hayas pagado por el servicio en los **12 meses anteriores** al hecho que originó el reclamo.',
        ],
      },
      {
        heading: '10. Cambios a estos términos',
        body: [
          'Podemos actualizar estos términos. Cambiaremos la fecha de arriba y, si el cambio es importante, te avisaremos dentro de la app. Si sigues usando Amixos después, aceptas la nueva versión.',
        ],
      },
      {
        heading: '11. Ley aplicable y contacto',
        body: [
          'Este acuerdo se rige por las leyes del **Estado de Nebraska, Estados Unidos**, sin aplicar sus reglas de conflicto de leyes.',
          'Contacto: **soporte@amixos.com**.',
        ],
      },
    ],
  },
  en: {
    title: 'Terms of Service',
    updated: UPDATED_EN,
    intro: [
      `These terms are the agreement between you and ${ENTITY} ("Amixos", "we") for use of the Amixos application. By creating an account, you accept them.`,
      'They are written to be understood. If anything is unclear, email soporte@amixos.com before signing up.',
    ],
    sections: [
      {
        heading: '1. What the service is',
        body: [
          'Amixos is software for running a service business: clients, jobs, proposals, invoices, employees, payroll, inventory and equipment, with additional modules by industry.',
          'It is an administrative tool. **We are not accountants, lawyers or tax advisors**, and the calculations the app performs (taxes, payroll, totals) are aids you must review before relying on them with your clients or the authorities.',
        ],
      },
      {
        heading: '2. Your account',
        body: [
          'You must be of legal age and provide accurate information when registering. You are responsible for activity in your account and for keeping your password safe.',
          'If you invite other people into your business, you are responsible for what they do there and for the permissions you grant them.',
        ],
      },
      {
        heading: '3. Free trial and subscription',
        body: [
          '- The free trial lasts **14 days** and requires no card.',
          '- When the trial ends, a plan is required to keep using the business. Subscriptions are **per business**, not per person: two businesses need two plans.',
          '- Payments are processed by **Stripe**. Subscribing authorizes recurring charges (monthly or annual) until you cancel.',
          '- **You can cancel at any time** from the billing portal. Cancellation takes effect at the end of the period you already paid for; you keep access until then and are not charged again.',
          '- There are no automatic refunds for periods already paid. If something went wrong, write to us and we will look at it case by case.',
          '- We may change prices. If that affects you, we will tell you in advance and you can cancel before it applies.',
        ],
      },
      {
        heading: '4. Your data is yours',
        body: [
          'Everything you enter — clients, jobs, invoices, files — **belongs to you**. We claim no ownership of it.',
          'You grant us permission to store and process it solely to provide the service (see the Privacy Policy).',
          'You can export your information to CSV or PDF from the app at any time, including before cancelling.',
        ],
      },
      {
        heading: '5. Acceptable use',
        body: [
          'Do not use Amixos to:',
          '- carry out illegal activity, fraud or false invoicing;',
          '- store people’s data without the right to do so;',
          '- send unsolicited email or messages (spam) through the sending features;',
          '- attempt to reach other businesses’ data, break security, or overload the service through automation.',
          'We may suspend an account doing this, and close it if the conduct is serious.',
        ],
      },
      {
        heading: '6. Deleting your account',
        body: [
          'You can delete your account or your business from **Settings → Account → Danger zone**, without asking us.',
          'When you do: your subscription is cancelled immediately, you lose access, and **everything is permanently erased 30 days later**. During those 30 days you can sign in and restore it. A cancelled subscription does not come back on its own — you would choose a plan again.',
          'If you own a business with other people in it, you must transfer or delete that business first, so nobody loses their information without the owner deciding it.',
        ],
      },
      {
        heading: '7. Availability',
        body: [
          'We work to keep Amixos running, but we do not guarantee uninterrupted availability. Maintenance happens, providers fail, and software has bugs.',
          'Keep your own backups of business-critical information. That is what the export feature is for.',
        ],
      },
      {
        heading: '8. Third-party services',
        body: [
          'Some features depend on third parties (Stripe for payments, Google Maps, Google Contacts, the Anthropic assistant). Those features are also subject to those providers’ terms, and if one fails or changes, the feature may change with it.',
        ],
      },
      {
        heading: '9. Limitation of liability',
        body: [
          'Amixos is provided "as is". To the extent permitted by law, we are not liable for lost profits, lost data, or indirect damages arising from use of the service.',
          'Our total liability for any claim is limited to what you paid for the service in the **12 months** before the event giving rise to the claim.',
        ],
      },
      {
        heading: '10. Changes to these terms',
        body: [
          'We may update these terms. We will change the date above and, for significant changes, tell you inside the app. Continuing to use Amixos afterwards means you accept the new version.',
        ],
      },
      {
        heading: '11. Governing law and contact',
        body: [
          'This agreement is governed by the laws of the **State of Nebraska, United States**, without regard to its conflict-of-law rules.',
          'Contact: **soporte@amixos.com**.',
        ],
      },
    ],
  },
};

export default function TermsPage() {
  return <LegalPage content={content} />;
}
