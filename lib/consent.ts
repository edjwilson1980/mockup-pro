// Opt-in wording for texts and emails, written to the A2P 10DLC / TCPA checklist:
// unchecked by default, order texts and promotions are separate choices, brand
// named, frequency, rates, STOP/HELP, and "not a condition of purchase".
// The exact text a customer agreed to is saved with their file, so if you edit
// a sentence here, bump CONSENT_VERSION.

export const BRAND = "South Side Printing";
export const CONSENT_VERSION = "2026-10-13";

export const ORDER_TEXTS_CONSENT = `Yes, text me about my order (mockups, proofs, and pickup) from ${BRAND} at the number above. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.`;

export const PROMO_CONSENT = `Yes, send me promotional texts and emails (deals, new products, and shop news) from ${BRAND}, including by automated means. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out of texts, HELP for help; every email has an unsubscribe link.`;

export const CONSENT_FOOTNOTE = `Consent is not a condition of purchase. We'll still email your proof and order receipts. We never sell or share your mobile number with third parties for their marketing.`;
