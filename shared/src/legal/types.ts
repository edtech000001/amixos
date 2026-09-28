// Shape of a legal document, shared by the public web pages and the in-app
// consent screen.
//
// It lives in shared/ because the text has to be identical in three places —
// amixos.com/privacy, amixos.com/terms, and the consent gate inside both apps.
// Two copies of a privacy policy is how an app ends up promising one thing on
// the web and another in the store listing.
//
// Deliberately plain data, not markup: each platform renders it with its own
// primitives (HTML on web, <Text> on native), and a paragraph beginning "- "
// is a bullet while **text** is bold. That is the whole formatting vocabulary
// these documents need.

export type Lang = 'es' | 'en';

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalContent {
  title: string;
  updated: string;
  intro: string[];
  sections: LegalSection[];
}

export type LegalDoc = Record<Lang, LegalContent>;
