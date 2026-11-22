// Accessibility statement — public, informational. NOT a consented policy, so
// it has no entry in versions.ts and the consent gate never shows it.

import type { LegalDoc } from './types';

const EMAIL = 'soporte@amixos.com';

export const accessibilityStatement: LegalDoc = {
  es: {
    title: 'Declaración de Accesibilidad',
    updated: 'Última actualización: 22 de noviembre de 2026',
    intro: [
      'Queremos que todas las personas puedan usar Amixos, y que los clientes de nuestros usuarios puedan ver y firmar sus propuestas y facturas, sin importar cómo usen su teléfono o computadora.',
    ],
    sections: [
      {
        heading: 'Nuestro objetivo',
        body: [
          'Trabajamos para cumplir con las Pautas de Accesibilidad para el Contenido Web (WCAG) 2.1, nivel AA, en nuestro sitio web, en las páginas que reciben los clientes (propuestas y facturas) y en nuestras apps para iPhone y Android.',
        ],
      },
      {
        heading: 'Lo que hacemos',
        body: [
          '- Probamos nuestras páginas públicas con herramientas automáticas de accesibilidad.',
          '- Las páginas funcionan con lectores de pantalla y con el teclado.',
          '- Las propuestas se pueden firmar escribiendo tu nombre, no solo dibujando la firma.',
          '- La app respeta el tamaño de texto que eliges en tu teléfono.',
        ],
      },
      {
        heading: 'Limitaciones conocidas',
        body: [
          '- Algunos botones con solo un ícono dentro de la app todavía no tienen una etiqueta para lectores de pantalla. Los estamos corrigiendo.',
          '- Los colores de las facturas los elige cada negocio, y algunas combinaciones pueden tener poco contraste.',
        ],
      },
      {
        heading: '¿Tienes un problema?',
        body: [
          `Si algo en Amixos no te funciona por un tema de accesibilidad, escríbenos a **${EMAIL}**. Dinos qué página o pantalla estabas usando y qué pasó, y te ayudaremos a completar lo que necesitas lo antes posible.`,
        ],
      },
    ],
  },
  en: {
    title: 'Accessibility Statement',
    updated: 'Last updated: November 22, 2026',
    intro: [
      'We want everyone to be able to use Amixos, and our users’ clients to be able to view and sign their estimates and invoices, however they use their phone or computer.',
    ],
    sections: [
      {
        heading: 'Our goal',
        body: [
          'We work toward the Web Content Accessibility Guidelines (WCAG) 2.1, level AA, on our website, on the pages clients receive (estimates and invoices), and in our iPhone and Android apps.',
        ],
      },
      {
        heading: 'What we do',
        body: [
          '- We test our public pages with automated accessibility tools.',
          '- Pages work with screen readers and the keyboard.',
          '- Estimates can be signed by typing your name, not only by drawing.',
          '- The app follows the text size you choose on your phone.',
        ],
      },
      {
        heading: 'Known limitations',
        body: [
          '- Some icon-only buttons inside the app don’t have a screen-reader label yet. We are fixing them.',
          '- Each business picks its own invoice colours, and some combinations may have low contrast.',
        ],
      },
      {
        heading: 'Having a problem?',
        body: [
          `If something in Amixos doesn’t work for you because of an accessibility issue, email us at **${EMAIL}**. Tell us which page or screen you were on and what happened, and we’ll help you finish what you need as soon as we can.`,
        ],
      },
    ],
  },
};
