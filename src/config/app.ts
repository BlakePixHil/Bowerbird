/**
 * The app's name lives here and nowhere else in the code.
 * If it changes, update this file, the logo wordmark and 01 · Product brief in Linear.
 */
export const APP_NAME = "Bowerbird";

/** The name under the icon on a phone's Home Screen. Keep it short so it never gets cut off. */
export const APP_SHORT_NAME = "Bowerbird";

/** Days, weeks, months and paydays are worked out in the household's time zone. This is the default. */
export const DEFAULT_TIMEZONE = "Australia/Sydney";

/**
 * Every household starts with these categories (project 03 · Sorting transactions). Income is kind
 * income, Transfers is kind transfer, and the rest are spending.
 */
export const STARTING_CATEGORIES = [
  { name: "Groceries", kind: "spending", icon: "cart" },
  { name: "Eating out", kind: "spending", icon: "food" },
  { name: "Transport", kind: "spending", icon: "car" },
  { name: "Fuel", kind: "spending", icon: "fuel" },
  { name: "Bills and utilities", kind: "spending", icon: "bolt" },
  { name: "Housing", kind: "spending", icon: "house" },
  { name: "Insurance", kind: "spending", icon: "umbrella" },
  { name: "Health", kind: "spending", icon: "heart" },
  { name: "Shopping", kind: "spending", icon: "bag" },
  { name: "Entertainment", kind: "spending", icon: "film" },
  { name: "Subscriptions", kind: "spending", icon: "repeat" },
  { name: "Travel", kind: "spending", icon: "plane" },
  { name: "Gifts", kind: "spending", icon: "gift" },
  { name: "Income", kind: "income", icon: "income" },
  { name: "Transfers", kind: "transfer", icon: "transfer" },
  { name: "Other", kind: "spending", icon: "other" },
] as const satisfies readonly {
  name: string;
  kind: "spending" | "income" | "transfer";
  /** A name from the inline icon set (src/components/ui/icons.ts). */
  icon: string;
}[];

/**
 * Live sync goes through Redbark, a SimpleFIN provider over the Consumer Data Right. It's optional
 * and paid to Redbark (agreed by Blake, see 04 · Decisions and cost rules in Linear).
 */
export const LIVE_SYNC_PROVIDER = {
  name: "Redbark",
  url: "https://redbark.com",
  plan: "Developer plan",
  price: "A$16 a month",
  connections: 6,
  /** How long a bank's consent lasts from when it's made (redbark.com/docs/consents). */
  consentMonths: 12,
} as const;

/**
 * Common Australian shops whose bank text varies a lot, so every variation lands on one shop with
 * a name people recognise. Each `match` is the start of the cleaned bank text, in capitals; case,
 * apostrophes and punctuation don't matter. The first one is the shop's key, so don't reorder a
 * shop's matches once households use it. Shop names are fine here; bank names never are.
 * (project 03 · Sorting transactions, "Clean shop names")
 */
export const KNOWN_SHOPS: readonly { name: string; match: readonly string[] }[] = [
  // Groceries
  { name: "Woolworths", match: ["WOOLWORTHS", "WOOLIES", "WW METRO"] },
  { name: "Coles", match: ["COLES", "COLES SUPERMARKETS", "COLES ONLINE"] },
  { name: "Coles Express", match: ["COLES EXPRESS"] },
  { name: "Aldi", match: ["ALDI", "ALDI STORES"] },
  { name: "Aldi Mobile", match: ["ALDI MOBILE"] },
  { name: "IGA", match: ["IGA", "SUPA IGA", "IGA XPRESS", "IGA X PRESS"] },
  { name: "Harris Farm Markets", match: ["HARRIS FARM"] },
  { name: "Costco", match: ["COSTCO"] },
  { name: "FoodWorks", match: ["FOODWORKS"] },
  // Fuel
  { name: "Ampol", match: ["AMPOL", "EG AMPOL", "AMPOL FOODARY"] },
  { name: "Caltex", match: ["CALTEX"] },
  { name: "BP", match: ["BP", "BP CONNECT", "BP EXPRESS"] },
  { name: "Shell", match: ["SHELL", "SHELL COLES EXPRESS"] },
  { name: "Reddy Express", match: ["REDDY EXPRESS"] },
  { name: "7-Eleven", match: ["7 ELEVEN", "7ELEVEN", "SEVEN ELEVEN"] },
  { name: "United Petroleum", match: ["UNITED PETROLEUM", "UNITED PETRO"] },
  { name: "Metro Petroleum", match: ["METRO PETROLEUM", "METRO FUEL"] },
  { name: "Puma Energy", match: ["PUMA ENERGY"] },
  { name: "OTR", match: ["OTR", "ON THE RUN"] },
  // Shopping and health
  { name: "Bunnings", match: ["BUNNINGS"] },
  { name: "Kmart", match: ["KMART"] },
  { name: "Target", match: ["TARGET"] },
  { name: "Big W", match: ["BIG W"] },
  { name: "JB Hi-Fi", match: ["JB HI FI", "JBHIFI"] },
  { name: "Officeworks", match: ["OFFICEWORKS"] },
  { name: "Myer", match: ["MYER"] },
  { name: "David Jones", match: ["DAVID JONES"] },
  { name: "IKEA", match: ["IKEA"] },
  { name: "Harvey Norman", match: ["HARVEY NORMAN"] },
  { name: "The Good Guys", match: ["THE GOOD GUYS", "GOOD GUYS"] },
  { name: "Amazon", match: ["AMAZON", "AMZN", "AMAZON MKTPLC", "AMAZON AU"] },
  { name: "Amazon Prime", match: ["AMAZON PRIME", "PRIME VIDEO"] },
  { name: "eBay", match: ["EBAY"] },
  { name: "Chemist Warehouse", match: ["CHEMIST WAREHOUSE", "CWH"] },
  { name: "Priceline", match: ["PRICELINE"] },
  { name: "TerryWhite Chemmart", match: ["TERRYWHITE", "TERRY WHITE"] },
  { name: "Dan Murphy's", match: ["DAN MURPHYS", "DAN MURPHY"] },
  { name: "BWS", match: ["BWS"] },
  { name: "Liquorland", match: ["LIQUORLAND"] },
  // Eating out
  { name: "McDonald's", match: ["MCDONALDS", "MCDONALD", "MACCAS"] },
  { name: "Hungry Jack's", match: ["HUNGRY JACKS"] },
  { name: "KFC", match: ["KFC"] },
  { name: "Guzman y Gomez", match: ["GUZMAN Y GOMEZ", "GUZMAN", "GYG"] },
  { name: "Domino's", match: ["DOMINOS"] },
  { name: "Oporto", match: ["OPORTO"] },
  { name: "Nando's", match: ["NANDOS"] },
  { name: "Subway", match: ["SUBWAY"] },
  { name: "Grill'd", match: ["GRILLD"] },
  { name: "Zambrero", match: ["ZAMBRERO"] },
  { name: "Starbucks", match: ["STARBUCKS"] },
  { name: "Boost Juice", match: ["BOOST JUICE"] },
  { name: "Menulog", match: ["MENULOG"] },
  { name: "DoorDash", match: ["DOORDASH"] },
  { name: "Uber Eats", match: ["UBER EATS", "UBEREATS"] },
  // Getting around
  { name: "Uber", match: ["UBER", "UBER TRIP"] },
  { name: "DiDi", match: ["DIDI"] },
  { name: "Opal", match: ["TRANSPORTFORNSW OPAL", "TRANSPORT FOR NSW", "TFNSW", "OPAL TRANSPORT"] },
  { name: "Myki", match: ["MYKI", "PTV MYKI"] },
  { name: "Linkt", match: ["LINKT"] },
  { name: "Wilson Parking", match: ["WILSON PARKING"] },
  { name: "Secure Parking", match: ["SECURE PARKING"] },
  // Subscriptions
  { name: "Netflix", match: ["NETFLIX"] },
  { name: "Spotify", match: ["SPOTIFY"] },
  { name: "Disney+", match: ["DISNEY PLUS", "DISNEYPLUS"] },
  { name: "Stan", match: ["STAN COM AU", "STAN ENTERTAINMENT"] },
  { name: "Kayo", match: ["KAYO SPORTS", "KAYO"] },
  {
    name: "YouTube Premium",
    match: ["YOUTUBE PREMIUM", "GOOGLE YOUTUBE", "GOOGLE YOUTUBEPREMIUM", "YOUTUBEPREMIUM"],
  },
  { name: "Google", match: ["GOOGLE"] },
  { name: "Apple", match: ["APPLE COM BILL", "APPLE COM", "ITUNES COM"] },
  { name: "Microsoft", match: ["MICROSOFT", "MSFT"] },
  { name: "Audible", match: ["AUDIBLE"] },
  // Bills
  { name: "Telstra", match: ["TELSTRA"] },
  { name: "Optus", match: ["OPTUS"] },
  { name: "Vodafone", match: ["VODAFONE"] },
  { name: "AGL", match: ["AGL"] },
  { name: "Origin Energy", match: ["ORIGIN ENERGY"] },
  { name: "EnergyAustralia", match: ["ENERGYAUSTRALIA", "ENERGY AUSTRALIA"] },
  { name: "Sydney Water", match: ["SYDNEY WATER"] },
  // Travel
  { name: "Booking.com", match: ["BOOKING COM"] },
  { name: "Airbnb", match: ["AIRBNB"] },
  { name: "Qantas", match: ["QANTAS"] },
  { name: "Virgin Australia", match: ["VIRGIN AUSTRALIA", "VIRGIN AUST"] },
  { name: "Jetstar", match: ["JETSTAR"] },
];
