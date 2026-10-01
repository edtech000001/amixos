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
      '**Importante:** la sección 13 dice que los desacuerdos se resuelven por **arbitraje individual y obligatorio**, no en un juicio con jurado ni en una demanda colectiva. Puedes excluirte del arbitraje escribiéndonos dentro de los 30 días siguientes a aceptar estos términos.',
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
          '- **Renovación automática:** tu plan se renueva solo al final de cada periodo (mes o año), al precio vigente, hasta que lo canceles. Antes de que se renueve un plan anual te enviamos un recordatorio por correo.',
          '- **Cambios de plan:** si subes de plan, se cobra de inmediato la diferencia proporcional por el resto del periodo. Si bajas de plan, el cambio aplica al iniciar tu siguiente periodo. Las funciones incluidas en cada plan pueden cambiar con el tiempo.',
          '- **Impuestos:** los precios no incluyen impuestos; si aplica alguno, se agrega al cobro.',
          '- **Dudas sobre un cobro:** avísanos dentro de los **60 días** siguientes al cobro.',
          '- Podemos cambiar los precios. Si eso te afecta, te avisaremos con anticipación y podrás cancelar antes de que aplique.',
        ],
      },
      {
        heading: '4. Tus datos son tuyos',
        body: [
          'Todo lo que capturas —clientes, trabajos, facturas, archivos— **te pertenece**. No reclamamos propiedad sobre ello.',
          'Nos das permiso para almacenarlo y procesarlo únicamente con el fin de darte el servicio (ver el Aviso de Privacidad). Lo tratamos como **confidencial**: solo tienen acceso las personas y proveedores que lo necesitan para darte el servicio.',
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
          `**Si descargaste la app desde el App Store de Apple:** este acuerdo es entre tú y ${ENTITY}, no con Apple, y nosotros, no Apple, somos responsables de la app y su contenido. Tu licencia te permite usar la app en dispositivos Apple que tengas o controles, según las Reglas de Uso del App Store. Apple no tiene obligación de dar mantenimiento ni soporte a la app. Si la app no cumple alguna garantía que aplique, puedes avisarle a Apple y Apple te reembolsará el precio de compra, si lo hubo; Apple no tiene ninguna otra obligación de garantía. Nosotros, no Apple, atenderemos cualquier reclamo sobre la app (de producto, de cumplimiento legal o de protección al consumidor) y cualquier reclamo de que la app infringe derechos de terceros. Confirmas que no estás en un país sujeto a embargo de EE. UU. ni en una lista de personas restringidas del gobierno de EE. UU. Apple y sus subsidiarias son terceros beneficiarios de este acuerdo y pueden hacerlo valer en tu contra.`,
        ],
      },
      {
        heading: '9. Propiedad de Amixos y tu licencia',
        body: [
          `La aplicación, el sitio web, su diseño, código, marca y contenido (excepto tus datos) son propiedad de ${ENTITY}. Mientras cumplas estos términos, te damos una licencia limitada, no exclusiva, intransferible y revocable para usar Amixos en tu negocio. La app se licencia, no se vende.`,
          'No puedes copiar, modificar, revender ni intentar obtener el código fuente de Amixos (ingeniería inversa), ni usar nuestra marca sin permiso por escrito.',
          'Si nos envías sugerencias o comentarios, podemos usarlos para mejorar Amixos sin ninguna obligación ni pago hacia ti.',
        ],
      },
      {
        heading: '10. Ami y funciones de inteligencia artificial',
        body: [
          'Ami, el asistente, y otras funciones automáticas usan inteligencia artificial. Sus respuestas pueden contener errores o estar incompletas: **revísalas antes de usarlas**, sobre todo cuando tengan que ver con precios, nómina, impuestos o asuntos legales.',
          'Ami no da asesoría legal, contable, fiscal ni profesional. Tú decides qué hacer con sus respuestas y eres responsable de ese uso.',
          'No compartas con Ami información sensible que no necesite para responderte.',
        ],
      },
      {
        heading: '11. Garantías y límite de responsabilidad',
        body: [
          '**AMIXOS SE OFRECE "TAL CUAL" Y "SEGÚN DISPONIBILIDAD". EN LA MEDIDA QUE LA LEY LO PERMITA, NO DAMOS NINGUNA GARANTÍA, EXPRESA O IMPLÍCITA, INCLUIDAS LAS GARANTÍAS DE COMERCIABILIDAD, IDONEIDAD PARA UN FIN DETERMINADO Y NO INFRACCIÓN, NI GARANTIZAMOS QUE EL SERVICIO SEA ININTERRUMPIDO, SEGURO O LIBRE DE ERRORES.**',
          'En la medida que la ley lo permita, no somos responsables por pérdida de ganancias, de datos, ni por daños indirectos derivados del uso del servicio.',
          'Nuestra responsabilidad total por cualquier reclamo se limita a lo que hayas pagado por el servicio en los **12 meses anteriores** al hecho que originó el reclamo.',
        ],
      },
      {
        heading: '12. Indemnización',
        body: [
          `Tú eres responsable de la información que guardas en Amixos y de cómo usas el servicio. Por eso aceptas defender, indemnizar y mantener libre de responsabilidad a ${ENTITY} y a su personal frente a reclamos, pérdidas y gastos (incluidos honorarios razonables de abogados) que resulten de:`,
          '- la información que guardas, incluida la de tus clientes y empleados, y tu derecho a guardarla;',
          '- tu uso del servicio, incluidos los correos y mensajes que envías a tus clientes desde la app;',
          '- que no cumplas estos términos o la ley que te aplica.',
        ],
      },
      {
        heading: '13. Resolución de desacuerdos y arbitraje',
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
        heading: '14. Cambios a estos términos',
        body: [
          'Podemos actualizar estos términos. Cambiaremos la fecha de arriba y, si el cambio es importante, te avisaremos dentro de la app. Si sigues usando Amixos después, aceptas la nueva versión.',
          'Un cambio a la sección 13 (arbitraje) no se aplica a un desacuerdo que ya nos hayas notificado antes del cambio.',
        ],
      },
      {
        heading: '15. Condiciones generales',
        body: [
          '- **Suspensión:** podemos suspender o cerrar una cuenta que incumpla estos términos (sección 5), avisándote cuando sea posible.',
          '- **Acuerdo completo:** estos términos y el Aviso de Privacidad son el acuerdo completo entre tú y Amixos sobre el servicio.',
          '- **Divisibilidad:** si alguna parte no se puede aplicar, el resto sigue vigente.',
          '- **Sin renuncia:** si no exigimos una parte de estos términos en algún momento, no renunciamos a exigirla después.',
          '- **Cesión:** no puedes transferir tu cuenta ni estos términos sin nuestro permiso; nosotros podemos transferirlos si la empresa se vende o se fusiona.',
          '- **Fuerza mayor:** no somos responsables por fallas causadas por hechos fuera de nuestro control razonable (desastres, cortes de internet o de proveedores).',
          '- **Vigencia:** las secciones 9, 11, 12, 13 y 16 siguen aplicando aunque se cierre tu cuenta.',
          '- **Comunicaciones electrónicas:** aceptas recibir avisos sobre tu cuenta por correo y dentro de la app; cuentan como avisos por escrito.',
          '- **Tus clientes y otros usuarios:** tú eres responsable de tu relación con tus clientes y con otros usuarios de Amixos; nosotros no somos parte de los desacuerdos entre ustedes.',
          '- **Terceros beneficiarios:** estos términos no dan derechos a nadie más, salvo a Apple como se indica en la sección 8.',
          '- **Idioma:** estos términos existen en español y en inglés. Si hubiera alguna diferencia entre las dos versiones, prevalece la versión en inglés.',
        ],
      },
      {
        heading: '16. Ley aplicable, jurisdicción y contacto',
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
      '**Important:** section 13 says disputes are resolved by **binding individual arbitration**, not by a jury trial or a class action. You can opt out of arbitration by emailing us within 30 days of accepting these terms.',
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
          '- **Automatic renewal:** your plan renews automatically at the end of each period (month or year), at the current price, until you cancel. Before an annual plan renews, we email you a reminder.',
          '- **Plan changes:** if you upgrade, the prorated difference for the rest of the period is charged immediately. If you downgrade, the change takes effect at the start of your next period. The features included in each plan may change over time.',
          '- **Taxes:** prices do not include taxes; any that apply are added to the charge.',
          '- **Billing questions:** tell us within **60 days** of a charge.',
          '- We may change prices. If that affects you, we will tell you in advance and you can cancel before it applies.',
        ],
      },
      {
        heading: '4. Your data is yours',
        body: [
          'Everything you enter — clients, jobs, invoices, files — **belongs to you**. We claim no ownership of it.',
          'You grant us permission to store and process it solely to provide the service (see the Privacy Policy). We treat it as **confidential**: only the people and providers who need it to provide the service have access.',
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
          `**If you downloaded the app from Apple's App Store:** this agreement is between you and ${ENTITY}, not Apple, and we, not Apple, are responsible for the app and its content. Your license lets you use the app on Apple devices you own or control, as permitted by the App Store Usage Rules. Apple has no obligation to provide maintenance or support for the app. If the app fails to conform to any applicable warranty, you may notify Apple and Apple will refund the purchase price, if any; Apple has no other warranty obligation. We, not Apple, will handle any claims about the app (product, legal-compliance or consumer-protection claims) and any claim that the app infringes a third party's rights. You confirm you are not in a country subject to a U.S. embargo or on a U.S. government list of restricted parties. Apple and its subsidiaries are third-party beneficiaries of this agreement and may enforce it against you.`,
        ],
      },
      {
        heading: '9. Ownership of Amixos and your license',
        body: [
          `The app, the website, their design, code, brand and content (except your data) are owned by ${ENTITY}. As long as you follow these terms, we give you a limited, non-exclusive, non-transferable, revocable license to use Amixos for your business. The app is licensed, not sold.`,
          'You may not copy, modify or resell Amixos, try to obtain its source code (reverse engineering), or use our brand without written permission.',
          'If you send us suggestions or feedback, we may use them to improve Amixos with no obligation or payment to you.',
        ],
      },
      {
        heading: '10. Ami and artificial intelligence features',
        body: [
          'Ami, the assistant, and other automated features use artificial intelligence. Their answers can be wrong or incomplete: **review them before relying on them**, especially for prices, payroll, taxes or legal matters.',
          'Ami does not give legal, accounting, tax or other professional advice. You decide what to do with its answers and are responsible for that use.',
          'Do not share sensitive information with Ami that it does not need to answer you.',
        ],
      },
      {
        heading: '11. Warranties and limitation of liability',
        body: [
          '**AMIXOS IS PROVIDED "AS IS" AND "AS AVAILABLE". TO THE EXTENT PERMITTED BY LAW, WE MAKE NO WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT, AND WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE OR ERROR-FREE.**',
          'To the extent permitted by law, we are not liable for lost profits, lost data, or indirect damages arising from use of the service.',
          'Our total liability for any claim is limited to what you paid for the service in the **12 months** before the event giving rise to the claim.',
        ],
      },
      {
        heading: '12. Indemnification',
        body: [
          `You are responsible for the information you store in Amixos and for how you use the service. So you agree to defend, indemnify and hold harmless ${ENTITY} and its personnel from claims, losses and costs (including reasonable attorneys’ fees) arising from:`,
          '- the information you store, including your clients’ and employees’, and your right to store it;',
          '- your use of the service, including the emails and messages you send your clients from the app;',
          '- your breach of these terms or of the law that applies to you.',
        ],
      },
      {
        heading: '13. Dispute resolution and arbitration',
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
        heading: '14. Changes to these terms',
        body: [
          'We may update these terms. We will change the date above and, for significant changes, tell you inside the app. Continuing to use Amixos afterwards means you accept the new version.',
          'A change to section 13 (arbitration) does not apply to a dispute you notified us about before the change.',
        ],
      },
      {
        heading: '15. General terms',
        body: [
          '- **Suspension:** we may suspend or close an account that breaches these terms (section 5), with notice when possible.',
          '- **Entire agreement:** these terms and the Privacy Policy are the entire agreement between you and Amixos about the service.',
          '- **Severability:** if any part cannot be enforced, the rest stays in effect.',
          '- **No waiver:** if we do not enforce part of these terms at some point, we do not give up the right to enforce it later.',
          '- **Assignment:** you may not transfer your account or these terms without our permission; we may transfer them if the company is sold or merged.',
          '- **Force majeure:** we are not responsible for failures caused by events beyond our reasonable control (disasters, internet or provider outages).',
          '- **Survival:** sections 9, 11, 12, 13 and 16 keep applying after your account is closed.',
          '- **Electronic communications:** you agree to receive account notices by email and in the app; they count as written notice.',
          '- **Your clients and other users:** you are responsible for your relationship with your clients and with other Amixos users; we are not a party to disputes between you.',
          '- **Third-party beneficiaries:** these terms give no rights to anyone else, except Apple as described in section 8.',
          '- **Language:** these terms exist in Spanish and English. If the two versions differ, the English version controls.',
        ],
      },
      {
        heading: '16. Governing law, venue and contact',
        body: [
          'This agreement is governed by the laws of the **State of Nebraska, United States**, without regard to its conflict-of-law rules.',
          'Any matter not resolved by arbitration (for example, if you opted out, or in small claims) will be brought exclusively in the state or federal courts of **Douglas County, Nebraska**, and both sides consent to their jurisdiction.',
          'Contact: **soporte@amixos.com**.',
        ],
      },
    ],
  },
};
