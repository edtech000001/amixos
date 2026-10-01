// Source of truth for this document. Rendered by the public web page
// and by the in-app consent screen on both platforms — see shared/legal/types.ts.
//
// Editing the text here means bumping the version in ./versions.ts, or the
// consent records will point at a document that no longer says what they agreed
// to.

import type { LegalDoc } from './types';

const ENTITY = 'Prime Solutions LLC';
const UPDATED_ES = 'Última actualización: 30 de septiembre de 2026';
const UPDATED_EN = 'Last updated: September 30, 2026';

export const privacyPolicy: LegalDoc = {
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
          '- **Fotos:** para adjuntar imágenes que ya tienes en el teléfono, y para guardar en tus fotos los PDF o imágenes que decides descargar.',
          '- **Ubicación:** para registrar dónde se realizó un trabajo y mostrar pines en el mapa. No rastreamos tu ubicación en segundo plano.',
          '- **Contactos:** solo si eliges importar contactos del teléfono como clientes. Leemos los contactos en ese momento; no los sincronizamos automáticamente.',
          '- **Micrófono y reconocimiento de voz:** solo si usas a Ami, el asistente, para dictar en lugar de escribir. El audio lo convierte en texto el servicio de voz de tu teléfono (Apple o Google) o de tu navegador.',
        ],
      },
      {
        heading: '3. Cómo usamos la información',
        body: [
          '- Para operar la app: guardar tus datos, generar facturas y propuestas, calcular nómina y mostrar reportes.',
          '- Para enviar correos que tú inicias (facturas, propuestas, recordatorios). Estos salen desde tu propia app de correo o desde tu dirección; nosotros no enviamos correo a tus clientes por nuestra cuenta.',
          '- Para enviarte a ti y a tu equipo correos de la cuenta: invitaciones, avisos de cobro y avisos sobre tu cuenta.',
          '- Para cobrar tu suscripción y avisarte sobre tu cuenta.',
          '- Para dar soporte cuando nos escribes.',
          '**No** usamos los datos de tus clientes para publicidad, no los vendemos y no los compartimos con otros negocios de la plataforma.',
          '**Cookies:** el sitio web solo usa las cookies necesarias para mantener tu sesión iniciada y recordar tus preferencias (negocio, ubicación e idioma). No usamos cookies de publicidad ni de analítica, y no rastreamos tu actividad en otras apps o sitios.',
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
          '- **Google Contacts** — solo si conectas la sincronización. Tus clientes de Amixos se envían a Google; **nada de Google se importa a Amixos**. Para no duplicarlos, la sincronización busca en tus contactos de Google y puede actualizar o borrar los contactos que ella misma creó, por eso pide acceso a tus contactos de Google.',
          '- **Anthropic (Claude)** — si usas a Ami, el asistente. Se envía tu pregunta y la información de tu negocio necesaria para responderla, que puede incluir datos de clientes, trabajos, empleados y horas trabajadas. No se usa para entrenar modelos.',
          '- **Google Cloud Text-to-Speech** — si Ami te responde en voz alta, el texto de la respuesta se convierte en audio.',
          '- **Resend** — envío de los correos de la cuenta (invitaciones y avisos).',
          '- **Cloudflare Turnstile** — verificación contra bots al registrarte o recuperar tu contraseña.',
          '- **Twilio o ClickSend** — solo si conectas tu propia cuenta de mensajes de texto: el teléfono del cliente y el texto del mensaje.',
          '- **Expo** — actualizaciones de la app móvil (datos técnicos como la versión de la app y el tipo de dispositivo).',
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
          '**Si tu suscripción termina y no la renuevas**, conservamos la información del negocio **12 meses** (sin acceso, pero intacta: si renuevas, todo sigue igual). Antes de borrarla le avisamos al dueño por correo **30, 7 y 1 días antes**. Si no renueva, **se borra definitivamente** al cumplirse los 12 meses.',
          'Después del borrado no podemos recuperar la información. Podemos conservar registros mínimos de facturación que la ley exige (por ejemplo, comprobantes de cobro).',
        ],
      },
      {
        heading: '7. Tus derechos',
        body: [
          '- **Acceso y corrección:** puedes ver y editar tu información desde la app en cualquier momento.',
          '- **Exportación:** puedes descargar cualquier factura o propuesta en PDF, exportar la información de un cliente y exportar el registro de rentas a CSV. Si quieres una copia completa de tus datos, escríbenos a soporte@amixos.com.',
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
          '- **Photos:** to attach images already on your phone, and to save PDFs or images you choose to download to your photos.',
          '- **Location:** to record where a job was performed and to show pins on the map. We do not track your location in the background.',
          '- **Contacts:** only if you choose to import phone contacts as clients. We read them at that moment; there is no automatic sync.',
          '- **Microphone and speech recognition:** only if you use Ami, the assistant, to dictate instead of typing. The audio is turned into text by your phone\'s speech service (Apple or Google) or your browser\'s.',
        ],
      },
      {
        heading: '3. How we use it',
        body: [
          '- To run the app: store your data, generate invoices and proposals, calculate payroll and show reports.',
          '- To send emails you initiate (invoices, proposals, reminders). These go out through your own mail app or address; we do not email your clients on our own.',
          '- To send you and your team account emails: invitations, billing notices and notices about your account.',
          '- To bill your subscription and notify you about your account.',
          '- To help you when you contact support.',
          'We do **not** use your clients’ data for advertising, we do not sell it, and we do not share it with other businesses on the platform.',
          '**Cookies:** the website only uses the cookies needed to keep you signed in and remember your preferences (business, location and language). We do not use advertising or analytics cookies, and we do not track your activity across other apps or sites.',
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
          '- **Google Contacts** — only if you connect the sync. Your Amixos clients are sent to Google; **nothing from Google is imported into Amixos**. To avoid duplicates, the sync looks up your Google contacts and can update or delete the contacts it created, which is why it asks for access to your Google contacts.',
          '- **Anthropic (Claude)** — if you use Ami, the assistant. Your question is sent along with the business information needed to answer it, which can include client, job, employee and hours-worked data. It is not used to train models.',
          '- **Google Cloud Text-to-Speech** — if Ami answers out loud, the text of the reply is turned into audio.',
          '- **Resend** — delivery of account emails (invitations and notices).',
          '- **Cloudflare Turnstile** — bot check when you sign up or reset your password.',
          '- **Twilio or ClickSend** — only if you connect your own texting account: the client\'s phone number and the message text.',
          '- **Expo** — mobile app updates (technical data such as app version and device type).',
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
          '**If your subscription ends and you don\'t renew**, we keep the business\'s information for **12 months** (locked, but intact: renew and everything is where you left it). Before erasing it we email the owner **30, 7 and 1 days ahead**. If it isn\'t renewed, **it is permanently erased** once the 12 months are up.',
          'After erasure we cannot recover it. We may keep minimal billing records that the law requires us to retain.',
        ],
      },
      {
        heading: '7. Your rights',
        body: [
          '- **Access and correction:** view and edit your information in the app at any time.',
          '- **Export:** download any invoice or proposal as a PDF, export an individual client\'s information, and export the rent roll to CSV. For a full copy of your data, write to soporte@amixos.com.',
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
