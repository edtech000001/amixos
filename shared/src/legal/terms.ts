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

export const termsOfService: LegalDoc = {
  es: {
    title: 'Términos de Servicio',
    updated: UPDATED_ES,
    intro: [
      `Estos términos son el acuerdo entre tú y ${ENTITY} ("Amixos", "nosotros") por el uso de la aplicación Amixos. Al crear una cuenta, aceptas lo que sigue.`,
      'Están escritos para que se entiendan. Si algo no te queda claro, escríbenos a soporte@amixos.com antes de registrarte.',
      '**Importante:** la sección 11 dice que los desacuerdos se resuelven por **arbitraje individual y obligatorio**, no en un juicio con jurado ni en una demanda colectiva. Puedes excluirte del arbitraje escribiéndonos dentro de los 30 días siguientes a aceptar estos términos.',
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
          'Puedes descargar tus facturas y propuestas en PDF y exportar información desde la app en cualquier momento, incluso antes de cancelar. Si necesitas una copia completa de tus datos, escríbenos a soporte@amixos.com.',
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
          '**Si tu suscripción termina y no la renuevas**, conservamos la información del negocio **12 meses** (sin acceso, pero intacta: si renuevas, todo sigue igual). Antes de borrarla le avisamos al dueño por correo **30, 7 y 1 días antes**. Si no renueva, **se borra definitivamente** al cumplirse los 12 meses.',
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
        heading: '10. Indemnización',
        body: [
          `Tú eres responsable de la información que guardas en Amixos y de cómo usas el servicio. Por eso aceptas defender, indemnizar y mantener libre de responsabilidad a ${ENTITY} y a su personal frente a reclamos, pérdidas y gastos (incluidos honorarios razonables de abogados) que resulten de:`,
          '- la información que guardas, incluida la de tus clientes y empleados, y tu derecho a guardarla;',
          '- tu uso del servicio, incluidos los correos y mensajes que envías a tus clientes desde la app;',
          '- que no cumplas estos términos o la ley que te aplica.',
        ],
      },
      {
        heading: '11. Resolución de desacuerdos y arbitraje',
        body: [
          '**Primero, hablemos.** Si tienes un problema con Amixos, escríbenos a soporte@amixos.com explicando qué pasó y qué solución buscas. Ambas partes tenemos **30 días** para intentar resolverlo antes de iniciar un arbitraje.',
          '**Arbitraje obligatorio.** Si no se resuelve, cualquier desacuerdo relacionado con estos términos o con el servicio se decide por **arbitraje individual y obligatorio** administrado por la American Arbitration Association (AAA) bajo sus reglas vigentes, y no en un tribunal. La Ley Federal de Arbitraje (Federal Arbitration Act) rige esta sección. El arbitraje puede hacerse por video o teléfono; si es presencial, será en el Condado de Douglas, Nebraska. La decisión del árbitro es final y puede presentarse ante cualquier tribunal competente.',
          '**Costos.** Si inicias un arbitraje por un reclamo de menos de **$10,000**, nosotros pagamos las cuotas de presentación y administración de la AAA. Cada parte paga sus propios abogados, salvo que el árbitro o la ley digan otra cosa.',
          '**Excepciones.** Cualquiera de las partes puede llevar un reclamo individual a un **tribunal de reclamos menores**, y puede pedir a un tribunal que detenga un uso no autorizado del servicio o de su propiedad intelectual.',
          '**Sin demandas colectivas.** Los reclamos se presentan solo de forma **individual**, no como parte de una demanda colectiva, grupal o representativa, y ambas partes renuncian a un juicio con jurado. Si esta renuncia no pudiera aplicarse a un reclamo, ese reclamo se resolverá en un tribunal y no en arbitraje.',
          '**Cómo excluirte.** Puedes excluirte de esta sección enviando un correo a soporte@amixos.com dentro de los **30 días** siguientes a aceptar estos términos por primera vez, con tu nombre, el correo de tu cuenta y la frase "Me excluyo del arbitraje". Excluirte no afecta ninguna otra parte de estos términos.',
        ],
      },
      {
        heading: '12. Cambios a estos términos',
        body: [
          'Podemos actualizar estos términos. Cambiaremos la fecha de arriba y, si el cambio es importante, te avisaremos dentro de la app. Si sigues usando Amixos después, aceptas la nueva versión.',
          'Un cambio a la sección 11 (arbitraje) no se aplica a un desacuerdo que ya nos hayas notificado antes del cambio.',
        ],
      },
      {
        heading: '13. Condiciones generales',
        body: [
          '- **Suspensión:** podemos suspender o cerrar una cuenta que incumpla estos términos (sección 5), avisándote cuando sea posible.',
          '- **Acuerdo completo:** estos términos y el Aviso de Privacidad son el acuerdo completo entre tú y Amixos sobre el servicio.',
          '- **Divisibilidad:** si alguna parte no se puede aplicar, el resto sigue vigente.',
          '- **Sin renuncia:** si no exigimos una parte de estos términos en algún momento, no renunciamos a exigirla después.',
          '- **Cesión:** no puedes transferir tu cuenta ni estos términos sin nuestro permiso; nosotros podemos transferirlos si la empresa se vende o se fusiona.',
          '- **Fuerza mayor:** no somos responsables por fallas causadas por hechos fuera de nuestro control razonable (desastres, cortes de internet o de proveedores).',
        ],
      },
      {
        heading: '14. Ley aplicable, jurisdicción y contacto',
        body: [
          'Este acuerdo se rige por las leyes del **Estado de Nebraska, Estados Unidos**, sin aplicar sus reglas de conflicto de leyes.',
          'Cualquier asunto que no se resuelva por arbitraje (por ejemplo, si te excluiste o en reclamos menores) se presentará exclusivamente ante los tribunales estatales o federales del **Condado de Douglas, Nebraska**, y ambas partes aceptan su jurisdicción.',
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
      '**Important:** section 11 says disputes are resolved by **binding individual arbitration**, not by a jury trial or a class action. You can opt out of arbitration by emailing us within 30 days of accepting these terms.',
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
          'You can download your invoices and proposals as PDFs and export information from the app at any time, including before cancelling. If you need a full copy of your data, email soporte@amixos.com.',
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
          '**If your subscription ends and you don\'t renew**, we keep the business\'s information for **12 months** (locked, but intact: renew and everything is where you left it). Before erasing it we email the owner **30, 7 and 1 days ahead**. If it isn\'t renewed, **it is permanently erased** once the 12 months are up.',
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
        heading: '10. Indemnification',
        body: [
          `You are responsible for the information you store in Amixos and for how you use the service. So you agree to defend, indemnify and hold harmless ${ENTITY} and its personnel from claims, losses and costs (including reasonable attorneys’ fees) arising from:`,
          '- the information you store, including your clients’ and employees’, and your right to store it;',
          '- your use of the service, including the emails and messages you send your clients from the app;',
          '- your breach of these terms or of the law that applies to you.',
        ],
      },
      {
        heading: '11. Dispute resolution and arbitration',
        body: [
          '**Talk to us first.** If you have a problem with Amixos, email soporte@amixos.com describing what happened and the outcome you want. We both have **30 days** to try to resolve it before starting arbitration.',
          '**Binding arbitration.** If it is not resolved, any dispute relating to these terms or the service is decided by **binding individual arbitration** administered by the American Arbitration Association (AAA) under its rules then in effect, not in court. The Federal Arbitration Act governs this section. Arbitration may be held by video or phone; if in person, it will be in Douglas County, Nebraska. The arbitrator’s decision is final and may be entered in any court with jurisdiction.',
          '**Costs.** If you start arbitration for a claim under **$10,000**, we pay the AAA filing and administrative fees. Each side pays its own attorneys unless the arbitrator or the law says otherwise.',
          '**Exceptions.** Either side may bring an individual claim in **small claims court**, and may ask a court to stop unauthorized use of the service or of its intellectual property.',
          '**No class actions.** Claims may be brought only **individually**, not as part of a class, collective or representative action, and both sides waive a jury trial. If this waiver cannot be applied to a claim, that claim will be decided in court, not in arbitration.',
          '**How to opt out.** You can opt out of this section by emailing soporte@amixos.com within **30 days** of first accepting these terms, with your name, your account email and the words "I opt out of arbitration". Opting out does not affect any other part of these terms.',
        ],
      },
      {
        heading: '12. Changes to these terms',
        body: [
          'We may update these terms. We will change the date above and, for significant changes, tell you inside the app. Continuing to use Amixos afterwards means you accept the new version.',
          'A change to section 11 (arbitration) does not apply to a dispute you notified us about before the change.',
        ],
      },
      {
        heading: '13. General terms',
        body: [
          '- **Suspension:** we may suspend or close an account that breaches these terms (section 5), with notice when possible.',
          '- **Entire agreement:** these terms and the Privacy Policy are the entire agreement between you and Amixos about the service.',
          '- **Severability:** if any part cannot be enforced, the rest stays in effect.',
          '- **No waiver:** if we do not enforce part of these terms at some point, we do not give up the right to enforce it later.',
          '- **Assignment:** you may not transfer your account or these terms without our permission; we may transfer them if the company is sold or merged.',
          '- **Force majeure:** we are not responsible for failures caused by events beyond our reasonable control (disasters, internet or provider outages).',
        ],
      },
      {
        heading: '14. Governing law, venue and contact',
        body: [
          'This agreement is governed by the laws of the **State of Nebraska, United States**, without regard to its conflict-of-law rules.',
          'Any matter not resolved by arbitration (for example, if you opted out, or in small claims) will be brought exclusively in the state or federal courts of **Douglas County, Nebraska**, and both sides consent to their jurisdiction.',
          'Contact: **soporte@amixos.com**.',
        ],
      },
    ],
  },
};
