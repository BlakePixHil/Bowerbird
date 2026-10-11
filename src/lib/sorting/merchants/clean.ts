import { KNOWN_SHOPS } from "@/config/app";

/** The shop a transaction is from: its key in `merchants.match_text`, and the name it starts with. */
export type Shop = { matchText: string; name: string };

/**
 * Text in the form shops and keys are compared in: capitals, no apostrophes, and every other mark
 * a space. "Dan Murphy's", "DAN MURPHYS" and "dan-murphys" all read "DAN MURPHYS".
 */
export function loose(text: string): string {
  return text
    .toUpperCase()
    .replace(/['’`]/g, "")
    .replace(/[^A-Z0-9&]+/g, " ")
    .trim();
}

/** Every known shop's matches, longest first, so "COLES EXPRESS" wins over "COLES". */
const KNOWN = KNOWN_SHOPS.flatMap((shop) =>
  shop.match.map((match) => ({ match: loose(match), shop })),
).sort((a, b) => b.match.length - a.match.length);

function knownShop(text: string): Shop | null {
  const words = loose(text);
  for (const { match, shop } of KNOWN) {
    if (words === match || words.startsWith(`${match} `))
      return { matchText: loose(shop.match[0]), name: shop.name };
  }
  return null;
}

// How a payment is described before the shop's name. Taken off the start until none is left.
const LEADING = [
  /^PENDING\b\s*[-:]?/,
  /^EFT\s?POS(?:\s+(?:DEBIT|PURCHASE|PURCH|WDL|TRANSACTION|TXN))?(?:\s+AT)?\b/,
  /^(?:VISA|MASTERCARD|MCARD|DEBIT|CREDIT|CARD)(?:\s+(?:DEBIT|CREDIT|CARD))*\s+(?:PURCHASE|PURCH|AUTHORI[SZ]ATION|AUTH|TRANSACTION|TXN)(?:\s+AT)?\b/,
  /^(?:POS|PURCHASE)(?:\s+(?:PURCHASE|AUTHORI[SZ]ATION|AUTH))?(?:\s+AT)?\b/,
  /^CARD\s+(?:X+|\*+)?\d{4}\b/,
  /^(?:TAP\s?(?:AND|&|N)\s?(?:PAY|GO)|CONTACTLESS|PAYWAVE|PAYPASS|APPLE\s?PAY|GOOGLE\s?PAY|SAMSUNG\s?PAY|GPAY)\b/,
  /^(?:DIRECT\s+(?:DEBIT|DR)|RECURRING\s+(?:PAYMENT|DEBIT)|BPAY(?:\s+PAYMENT)?|PAYMENT\s+(?:BY\s+AUTHORITY\s+)?TO|(?:OSKO|PAYID|ONLINE|INTERNET)\s+(?:PAYMENT|BPAY)(?:\s+TO)?|AUTHORITY\s+TO)\b/,
  // Payment processors written in front of the shop's own name, as in "SQ *BAR LUCA".
  /^(?:SQ|SP|PP|PAYPAL|ZLR|TST|SMP|IZ|LSP|CKO|WPY|SUMUP)\s*\*\s*/,
  // A terminal or card number between the words above and the shop's name.
  /^\d{3,}\b/,
];

const MONTH = "(?:JAN|FEB|MAR|APR|MAY|JUNE?|JULY?|AUG|SEPT?|OCT|NOV|DEC)";
const DATES = [
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  new RegExp(`\\b\\d{1,2}\\s?${MONTH}(?:\\s?\\d{2,4})?\\b`, "g"),
  /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM)?\b/g,
];

const words = (text: string) => new Set(text.split(" "));
const COUNTRIES = words(
  "AU AUS AUSTRALIA US USA GB GBR UK NZ NZL SG SGP IE IRL NL NLD HK HKG CA CAN JP JPN",
);
const STATES = words("NSW NS VIC VI QLD QL SA WA TAS TA ACT NT");
const CITIES = [
  "SYDNEY",
  "MELBOURNE",
  "BRISBANE",
  "PERTH",
  "ADELAIDE",
  "HOBART",
  "DARWIN",
  "CANBERRA",
  "GOLD COAST",
  "SUNSHINE COAST",
  "NEWCASTLE",
  "WOLLONGONG",
  "GEELONG",
  "CAIRNS",
  "TOWNSVILLE",
  "PARRAMATTA",
  "CBD",
].map((city) => city.split(" "));
/** The second word of a two-word suburb, as in "SURRY HILLS" or "BONDI JUNCTION". */
const SUBURB_ENDS = words(
  "HILLS HILL JUNCTION PARK BEACH HEIGHTS BAY POINT VALE GROVE CREEK DOWNS GARDENS WATERS LAKES RIDGE PLAINS VALLEY QUAY WHARF",
);
/** The first word of a two-word suburb, as in "NORTH SYDNEY" or "ST LEONARDS". */
const SUBURB_STARTS = words("NORTH SOUTH EAST WEST ST MT MOUNT PORT UPPER LOWER GLEN");
const STREETS = words(
  "ST STREET RD ROAD AVE AV AVENUE HWY HIGHWAY PDE PARADE PL PLACE LN LANE DR DRIVE CRES BLVD TCE",
);
/** How a payment is described after the shop's name. */
const PAYMENT_ENDS = [
  "DIRECT DEBIT",
  "DIRECT DR",
  "BPAY",
  "RECURRING PAYMENT",
  "RECURRING",
  "AUTOPAY",
  "AUTO PAY",
  "EFTPOS",
  "PURCHASE",
  "TAP AND PAY",
  "CONTACTLESS",
  "LTD",
  "LIMITED",
  "INC",
  "LLC",
].map((end) => end.split(" "));
/** Words that only join others, so never the last word of a shop's name. */
const SMALL = words("A AN AND & AT BY FOR FROM IN OF ON OR THE TO DATE VIA -");

const isNumber = (word: string) => /^\d+$/.test(word);
const digits = (word: string) => word.match(/\d/g)?.length ?? 0;
/** A word that's a reference rather than part of a name: "P2A7C", "INV-20931", "#4471". */
const isReference = (word: string) =>
  word.startsWith("#") ||
  (/[A-Z]/.test(word) && (digits(word) >= 3 || (word.length >= 5 && digits(word) >= 2)));
const endsWith = (list: string[], end: string[]) =>
  list.length > end.length && end.every((word, i) => list.at(i - end.length) === word);

/** Takes a suburb off the end: one word, or two for "SURRY HILLS" and "ST LEONARDS". */
function dropSuburb(list: string[]) {
  if (list.length < 2) return;
  const last = list.pop()!;
  if (SUBURB_ENDS.has(last) && list.length >= 2 && !SMALL.has(list.at(-1)!)) list.pop();
  if (list.length >= 2 && SUBURB_STARTS.has(list.at(-1)!)) list.pop();
}

/**
 * Takes what isn't the name off the end until none is left: countries, a state with its suburb,
 * cities, two-word suburbs, streets, postcodes, payment words and company endings.
 */
function dropEnds(list: string[]) {
  for (let changed = true; changed && list.length > 1;) {
    const last = list.at(-1)!;
    const city = CITIES.find((parts) => endsWith(list, parts));
    const payment = PAYMENT_ENDS.find((parts) => endsWith(list, parts));
    changed = true;
    if (COUNTRIES.has(last) || SMALL.has(last) || (isNumber(last) && last.length === 4)) list.pop();
    else if (STATES.has(last)) {
      list.pop();
      // A suburb comes before the state, but with only two words left the second may be part of
      // the name, so it stays: a rename fixes a long name, but nothing splits two shops made one.
      if (list.length >= 3) dropSuburb(list);
    } else if (city) list.splice(-city.length);
    else if (payment) list.splice(-payment.length);
    else if (SUBURB_ENDS.has(last) && list.length >= 3 && !SMALL.has(list.at(-2)!)) {
      list.splice(-2);
      if (list.length >= 2 && SUBURB_STARTS.has(list.at(-1)!)) list.pop();
    } else if (STREETS.has(last) && list.length >= 3) list.splice(-2);
    else changed = false;
  }
}

/** The start of the cleaning: payment words and card numbers off, the shop's name up front. */
function prepare(description: string): string {
  let text = description.toUpperCase().replace(/\s/g, " ").trim();
  for (let before = ""; before !== text;) {
    before = text;
    for (const pattern of LEADING) text = text.replace(pattern, "").trim();
  }
  // Card terminals pad the shop's name to a fixed width before the suburb.
  const [name] = text.split(/\s{2,}/);
  if (/[A-Z]{2}/.test(name)) text = name;
  return text.replace(/\s*\*\s*/g, " ").replace(/\s+/g, " ");
}

/** The rest: details, references, store numbers and places off, so the name is left. */
function finish(prepared: string): string | null {
  let text = prepared
    // Details banks add after the shop: the card, the date it was made, any foreign amount.
    .replace(/\s+VALUE\s+DATE\b.*$/, "")
    .replace(
      /\s+(?:FRGN|FOREIGN|INTNL|INT'?L)\s+(?:AMT|AMOUNT|CURRENCY|TRANS|TXN|TRANSACTION)\b.*$/,
      "",
    )
    .replace(/\bCARD\s+(?:X+|\*+)\d{2,4}\b/g, " ")
    .replace(/\b(?:X{2,}|\*{2,})\d{2,4}\b/g, " ")
    .replace(/\b\d{4,6}[X*]{4,}\d{3,4}\b/g, " ");
  const [beforeComma] = text.split(",");
  if (/[A-Z]{2}/.test(beforeComma)) text = beforeComma;
  for (const pattern of DATES) text = text.replace(pattern, " ");
  text = text
    .replace(
      /\b(?:REF|REFERENCE|RECEIPT|RCPT|INV|INVOICE|ORDER|TXN|ID|NO)\b\.?\s*[:#]?\s*[A-Z]*\d[\w/-]*/g,
      " ",
    )
    .replace(/\b(?:PTY\.?\s+LTD|PTY|P\/L)\b\.?/g, " ")
    .replace(/[^A-Z0-9&'./+# -]/g, " ");

  let list = text
    .split(" ")
    .filter(
      (word, i) =>
        word &&
        !isReference(word) &&
        // A web address after the name, or a day and month with no year.
        !(i > 0 && (/^(?:HELP|WWW|SUPPORT)\./.test(word) || /^\d{1,2}\/\d{1,2}$/.test(word))),
    )
    .map((word) => word.replace(/^[./'+-]+|[./'-]+$/g, ""))
    .filter(Boolean);
  // A store number ends the name: whatever follows it is where the store is.
  const store = list.findIndex((word, i) => i > 0 && isNumber(word) && word.length >= 3);
  if (store > 0) list = list.slice(0, store);
  dropEnds(list);
  list = list.filter((word) => !(isNumber(word) && word.length >= 3));

  const name = list.join(" ");
  return (name.match(/[A-Z]/g)?.length ?? 0) >= 2 ? name : null;
}

/**
 * Bank text cleaned down to the shop's name, in capitals: "EFTPOS PURCHASE WOOLWORTHS 1234 SYDNEY
 * AU" reads "WOOLWORTHS". It drops how the card was used, card and reference numbers, store
 * numbers, dates, and the suburb, state and country at the end. Null when nothing like a name is
 * left, as in a line of numbers.
 */
export function shopText(description: string): string | null {
  return finish(prepare(description));
}

const LOWER_WORDS = words("A AN AND AT BY FOR FROM IN OF ON OR THE TO Y DE DEL LA N");
const TITLE_WORDS = words("MR MRS MS DR ST MT");
/** Short words that stay in capitals, as in "NRMA Insurance" or "ATM". */
const CAPITAL_WORDS = words(
  "ATM AGL IGA KFC BWS NRMA RACV RACQ RAC AAMI NIB HCF ATO JB BP GYG CBD TAFE UK USA US NSW VIC QLD ACT NT BBQ IT TV PC DVD ABC SBS NBN RSL YMCA UNSW UTS PTV HSC",
);

function capitalise(part: string): string {
  if (/^MC[A-Z]{2,}/.test(part)) return `Mc${capitalise(part.slice(2))}`;
  if (/^[OD]'[A-Z]/.test(part)) return part.slice(0, 2) + capitalise(part.slice(2));
  const [head, ...dotted] = part.split(".");
  const word = head.charAt(0) + head.slice(1).toLowerCase();
  return [word, ...dotted.map((rest) => rest.toLowerCase())].join(".");
}

/** "THE COFFEE CLUB" reads "The Coffee Club", "NETFLIX.COM" reads "Netflix.com". */
export function tidyName(text: string): string {
  return text
    .split(" ")
    .map((word, i) => {
      if (CAPITAL_WORDS.has(word)) return word;
      if (i > 0 && LOWER_WORDS.has(word)) return word.toLowerCase();
      // Short words with no vowels are letters, as in "JB" or "TSS".
      if (!TITLE_WORDS.has(word) && /^[B-DF-HJ-NP-TV-XZ]{2,4}$/.test(word)) return word;
      return word
        .split(/(?<=[-/])/)
        .map(capitalise)
        .join("");
    })
    .join(" ");
}

/**
 * The shop a bank description is from, or null when it doesn't name one. Known shops get their
 * own name ("Woolworths" for "WW METRO 2231"), anything else a tidy version of the cleaned text.
 * Keys are `loose`, so "JB HI-FI" and "JB HI FI" are one shop.
 */
export function shopFor(description: string): Shop | null {
  const prepared = prepare(description);
  const known = knownShop(prepared);
  if (known) return known;
  const text = finish(prepared);
  if (!text) return null;
  return knownShop(text) ?? { matchText: loose(text), name: tidyName(text) };
}
