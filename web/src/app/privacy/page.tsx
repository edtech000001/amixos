// Privacy policy — public, no auth. Linked from both apps' signup screens and
// used as the privacy-policy URL in App Store Connect.
//
// Written from what the code ACTUALLY does. When a feature changes what is
// collected or who it is sent to, this page changes with it — a policy that
// describes a different app is worse than none, both for App Review and for
// the people trusting it.

import type { Metadata } from 'next';
import { LegalPage, type LegalContent, type Lang } from '../(legal)/LegalPage';

export const metadata: Metadata = {
  title: 'Aviso de Privacidad · Amixos',
  description: 'Cómo Amixos recopila, usa y protege tu información.',
};

// TODO(legal): replace with the registered company name before launch.
const ENTITY = '[NOMBRE LEGAL DE LA EMPRESA]';
const UPDATED_ES = 'Última actualización: 22 de septiembre de 2026';
const UPDATED_EN = 'Last updated: September 22, 2026';

const content: Record<Lang, LegalContent> = {
  es: {
    title: 'Aviso de Privacidad',
    updated: UPDATED_ES,
    intro: [
      `Amixos es un software de administración de negocios operado por ${ENTITY} ("Amixos", "nosotros"). Este aviso explica qué información recopilamos, por qué, y qué control tienes sobre ella.`,
      'En resumen: recopilamos lo necesario para que la app funcione. **No vendemos tu información ni la de tus clientes.** No usamos tus datos de negocio para publicidad.',
    ],
    sections: [
      {
        heading: '1. Información que nos das',
        body: [
          '- **Tu cuenta:** nombre, correo electrónico y contraseña (la contraseña se guarda cifrada; nunca la vemos). Si entras con Google o Apple, recibimos tu nombre y correo de ese servicio.',
          '- **Tu negocio:** nombre, dirección, teléfono, logo, identificación fiscal y número de licencia si decides agregarlos.',
          '- **Datos que tú capturas:** clientes (nombres, teléfonos, correos, direcciones), trabajos, propuestas, facturas, pagos, inventario, equipo, empleados (incluyendo salario por hora y horas trabajadas si usas nómina) y los archivos o fotos que subas.',
          '- **Pagos de tus clientes:** montos, método y, si la tomas, la foto de un cheque o comprobante.',
        ],
      },
      {
        heading: '2. Permisos del teléfono',
        body: [
          'La app solo pide un permiso cuando vas a usar la función que lo necesita, y puedes negarlo sin perder el resto de la app.',
          '- **Cámara:** para tomar fotos de equipo, comprobantes y escanear códigos VIN.',
          '- **Fotos:** para adjuntar imágenes que ya tienes en el teléfono.',
          '- **Ubicación:** para registrar dónde se realizó un trabajo y mostrar pines en el mapa. No rastreamos tu ubicación en segundo plano.',
          '- **Contactos:** solo si eliges importar contactos del teléfono como clientes. Leemos los contactos en ese momento; no los sincronizamos automáticamente.',
          '- **Micrófono y reconocimiento de voz:** solo si usas a Ami, el asistente, para dictar en lugar de escribir.',
        ],
      },
      {
        heading: '3. Cómo usamos la información',
        body: [
          '- Para operar la app: guardar tus datos, generar facturas y propuestas, calcular nómina y mostrar reportes.',
          '- Para enviar correos que tú inicias (facturas, propuestas, recordatorios). Estos salen desde tu propia app de correo o desde tu dirección; nosotros no enviamos correo a tus clientes por nuestra cuenta.',
          '- Para cobrar tu suscripción y avisarte sobre tu cuenta.',
          '- Para dar soporte cuando nos escribes.',
          '**No** usamos los datos de tus clientes para publicidad, no los vendemos y no los compartimos con otros negocios de la plataforma.',
        ],
      },
      {
        heading: '4. Con quién compartimos información',
        body: [
          'Solo con los proveedores necesarios para que el servicio funcione, y solo lo que cada uno necesita:',
          '- **Supabase** — base de datos, autenticación y almacenamiento de archivos (Estados Unidos).',
          '- **Google Cloud** — servidores donde corre nuestra API.',
          '- **Vercel** — hospedaje de la aplicación web.',
          '- **Stripe** — cobro de suscripciones. Los datos de tu tarjeta se los das directamente a Stripe; **nosotros nunca los vemos ni los guardamos**.',
          '- **Google Maps** — mapas y geocodificación de direcciones si usas el módulo de mapa.',
          '- **Google Contacts** — solo si conectas la sincronización. Es **de una sola vía**: enviamos tus clientes de Amixos a Google, nunca al revés.',
          '- **Anthropic (Claude)** — si usas a Ami, el asistente. Se envía el texto de tu pregunta y el contexto necesario para responderla. No se usa para entrenar modelos.',
          'También podemos entregar información si la ley nos obliga, o para proteger derechos y seguridad.',
        ],
      },
      {
        heading: '5. Seguridad',
        body: [
          'Todo viaja cifrado (HTTPS) y se guarda en servidores con cifrado en reposo. Cada negocio está aislado a nivel de base de datos mediante políticas de seguridad por fila: los datos de un negocio no son accesibles desde otro. Dentro de tu negocio, tú decides qué puede ver cada rol.',
          'Ningún sistema es infalible. Si ocurre una violación de seguridad que te afecte, te avisaremos.',
        ],
      },
      {
        heading: '6. Cuánto tiempo guardamos tus datos',
        body: [
          'Mientras tu cuenta esté activa. Cuando eliminas tu cuenta o tu negocio desde la app, marcamos la eliminación y **borramos todo de forma definitiva 30 días después**. Durante esos 30 días puedes iniciar sesión y restaurar la cuenta.',
          'Después del borrado no podemos recuperar la información. Podemos conservar registros mínimos de facturación que la ley exige (por ejemplo, comprobantes de cobro).',
        ],
      },
      {
        heading: '7. Tus derechos',
        body: [
          '- **Acceso y corrección:** puedes ver y editar tu información desde la app en cualquier momento.',
          '- **Exportación:** puedes exportar clientes, trabajos y facturas a CSV o PDF desde la app.',
          '- **Eliminación:** desde **Ajustes → Cuenta → Zona de peligro** puedes eliminar tu cuenta o tu negocio. No necesitas escribirnos ni pedir permiso.',
          '- **Dudas:** escríbenos a soporte@amixos.com y respondemos.',
        ],
      },
      {
        heading: '8. Los datos de tus clientes',
        body: [
          'La información que capturas sobre tus clientes es tuya; nosotros solo la procesamos para darte el servicio. Eres responsable de tener derecho a guardar esos datos y de cumplir las leyes que te apliquen al usarlos, incluyendo cuando envías correos o mensajes desde la app.',
        ],
      },
      {
        heading: '9. Menores de edad',
        body: [
          'Amixos es una herramienta de trabajo para adultos. No está dirigida a menores de 13 años y no recopilamos información de ellos a sabiendas.',
        ],
      },
      {
        heading: '10. Cambios y contacto',
        body: [
          'Si cambiamos este aviso, actualizaremos la fecha de arriba y, si el cambio es importante, te avisaremos dentro de la app.',
          'Dudas sobre privacidad: **soporte@amixos.com**.',
        ],
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: UPDATED_EN,
    intro: [
      `Amixos is business management software operated by ${ENTITY} ("Amixos", "we"). This notice explains what we collect, why, and what control you have over it.`,
      'In short: we collect what the app needs to work. **We do not sell your information or your clients’ information.** We do not use your business data for advertising.',
    ],
    sections: [
      {
        heading: '1. Information you give us',
        body: [
          '- **Your account:** name, email and password (stored hashed; we never see it). If you sign in with Google or Apple, we receive your name and email from that service.',
          '- **Your business:** name, address, phone, logo, tax ID and license number, if you choose to add them.',
          '- **Data you enter:** clients (names, phones, emails, addresses), jobs, proposals, invoices, payments, inventory, equipment, employees (including hourly pay and hours worked if you use payroll), and any files or photos you upload.',
          '- **Your clients’ payments:** amounts, method and, if you take one, a photo of a check or receipt.',
        ],
      },
      {
        heading: '2. Phone permissions',
        body: [
          'The app asks for a permission only when you use the feature that needs it, and declining one does not break the rest of the app.',
          '- **Camera:** to photograph equipment and receipts, and to scan VIN codes.',
          '- **Photos:** to attach images already on your phone.',
          '- **Location:** to record where a job was performed and to show pins on the map. We do not track your location in the background.',
          '- **Contacts:** only if you choose to import phone contacts as clients. We read them at that moment; there is no automatic sync.',
          '- **Microphone and speech recognition:** only if you use Ami, the assistant, to dictate instead of typing.',
        ],
      },
      {
        heading: '3. How we use it',
        body: [
          '- To run the app: store your data, generate invoices and proposals, calculate payroll and show reports.',
          '- To send emails you initiate (invoices, proposals, reminders). These go out through your own mail app or address; we do not email your clients on our own.',
          '- To bill your subscription and notify you about your account.',
          '- To help you when you contact support.',
          'We do **not** use your clients’ data for advertising, we do not sell it, and we do not share it with other businesses on the platform.',
        ],
      },
      {
        heading: '4. Who we share it with',
        body: [
          'Only the providers needed to run the service, and only what each one needs:',
          '- **Supabase** — database, authentication and file storage (United States).',
          '- **Google Cloud** — servers running our API.',
          '- **Vercel** — hosting for the web app.',
          '- **Stripe** — subscription billing. You give your card details directly to Stripe; **we never see or store them**.',
          '- **Google Maps** — maps and address geocoding if you use the map module.',
          '- **Google Contacts** — only if you connect the sync. It is **one-way**: we send your Amixos clients to Google, never the reverse.',
          '- **Anthropic (Claude)** — if you use Ami, the assistant. Your question and the context needed to answer it are sent. It is not used to train models.',
          'We may also disclose information where required by law, or to protect rights and safety.',
        ],
      },
      {
        heading: '5. Security',
        body: [
          'Everything travels encrypted (HTTPS) and is stored on servers with encryption at rest. Each business is isolated at the database level through row-level security policies: one business’s data is not reachable from another. Within your business, you decide what each role can see.',
          'No system is perfect. If a breach affects you, we will tell you.',
        ],
      },
      {
        heading: '6. How long we keep it',
        body: [
          'For as long as your account is active. When you delete your account or your business from the app, we mark it for deletion and **permanently erase everything 30 days later**. During those 30 days you can sign in and restore the account.',
          'After erasure we cannot recover it. We may keep minimal billing records that the law requires us to retain.',
        ],
      },
      {
        heading: '7. Your rights',
        body: [
          '- **Access and correction:** view and edit your information in the app at any time.',
          '- **Export:** export clients, jobs and invoices to CSV or PDF from the app.',
          '- **Deletion:** from **Settings → Account → Danger zone** you can delete your account or your business. You do not need to email us or ask permission.',
          '- **Questions:** write to soporte@amixos.com and we will answer.',
        ],
      },
      {
        heading: '8. Your clients’ data',
        body: [
          'The information you record about your clients is yours; we only process it to provide the service. You are responsible for having the right to hold that data and for complying with the laws that apply to you when you use it, including when you send emails or messages from the app.',
        ],
      },
      {
        heading: '9. Children',
        body: [
          'Amixos is a work tool for adults. It is not directed at children under 13, and we do not knowingly collect their information.',
        ],
      },
      {
        heading: '10. Changes and contact',
        body: [
          'If we change this notice we will update the date above and, for significant changes, tell you inside the app.',
          'Privacy questions: **soporte@amixos.com**.',
        ],
      },
    ],
  },
};

export default function PrivacyPolicyPage() {
  return <LegalPage content={content} />;
}
