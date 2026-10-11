import { describe, expect, it } from "vitest";
import { KNOWN_SHOPS } from "@/config/app";
import { loose, shopFor, shopText, tidyName } from "./clean";

/** Made-up bank text in the shapes Australian banks and card terminals write it, and its shop. */
const EXAMPLES: [description: string, name: string | null][] = [
  // Supermarkets, with store numbers, suburbs, states and countries
  ["WOOLWORTHS 1234 SYDNEY AU", "Woolworths"],
  ["WOOLWORTHS METRO 2231", "Woolworths"],
  ["WW METRO 0410 PYRMONT NSW", "Woolworths"],
  ["EFTPOS DEBIT 0123 WOOLWORTHS 1234 SYDNEY AU", "Woolworths"],
  ["WOOLWORTHS 1187 SURRY HILLS AU Card xx0000 Value Date: 01/09/2026", "Woolworths"],
  ["VISA DEBIT PURCHASE CARD 1234 WOOLWORTHS 3321 SYDNEY", "Woolworths"],
  ["COLES 0456 NEWTOWN NSW", "Coles"],
  ["EFTPOS PURCHASE AT COLES 0789 MELBOURNE", "Coles"],
  ["ALDI STORES 22 MARRICKVILLE", "Aldi"],
  ["SUPA IGA X-PRESS 041 GLEBE", "IGA"],
  ["PENDING - HARRIS FARM 012 BONDI JUNCTION", "Harris Farm Markets"],
  // Fuel
  ["AMPOL ENFIELD 4471", "Ampol"],
  ["BP CONNECT ASHFIELD", "BP"],
  ["7-ELEVEN 2045 PARRAMATTA", "7-Eleven"],
  ["SHELL COLES EXPRESS 1234 RYDE", "Shell"],
  ["COLES EXPRESS 1902 KENSINGTON", "Coles Express"],
  // Shops
  ["KMART 1077 BROADWAY", "Kmart"],
  ["BUNNINGS 545000 ALEXANDRIA", "Bunnings"],
  ["JB HI FI 0312 SYDNEY", "JB Hi-Fi"],
  ["JB HI-FI ONLINE", "JB Hi-Fi"],
  ["DAN MURPHY'S 1234 ERSKINEVILLE", "Dan Murphy's"],
  ["PRICELINE PHARMACY 412", "Priceline"],
  ["CHEMIST WAREHOUSE 532 GEORGE ST SYDNEY", "Chemist Warehouse"],
  ["AMZN MKTP AU*2X3Y4Z5", "Amazon"],
  ["AMAZON MKTPLC AU SYDNEY", "Amazon"],
  // Eating out, through card processors
  ["VISA DEBIT PURCHASE CARD 1234 MCDONALDS MOORE PARK", "McDonald's"],
  ["HUNGRY JACKS 0098 ST LEONARDS NSW", "Hungry Jack's"],
  ["GUZMAN Y GOMEZ 088", "Guzman y Gomez"],
  ["DOMINOS PIZZA 98765 NORTH SYDNEY", "Domino's"],
  ["UBER *EATS HELP.UBER.COM", "Uber Eats"],
  ["SQ *LITTLE MARIONETTE", "Little Marionette"],
  ["SQ *BAR LUCA", "Bar Luca"],
  ["ZLR*BEAN THERE CAFE", "Bean There Cafe"],
  ["CAFE BREVE SURRY HILLS", "Cafe Breve"],
  ["THE COFFEE CLUB      BONDI JUNCTION NS AUS", "The Coffee Club"],
  ["DEBIT CARD PURCHASE THE GROUNDS ALEXANDRIA NS AUS", "The Grounds"],
  ["TAP AND PAY GELATO MESSINA DARLINGHURST", "Gelato Messina Darlinghurst"],
  ["O'BRIEN'S BAKERY BALMAIN NSW", "O'Brien's Bakery"],
  ["MR WONG SYDNEY", "Mr Wong"],
  // Getting around
  ["UBER *TRIP HELP.UBER.COM", "Uber"],
  ["TRANSPORTFORNSW OPAL", "Opal"],
  ["LIGHT RAIL 01/09 13:45", "Light Rail"],
  // Subscriptions and bills
  ["NETFLIX.COM MELBOURNE", "Netflix"],
  ["PAYPAL *NETFLIX", "Netflix"],
  ["NETFLIX.COM LOS GATOS US 12.99 USD", "Netflix"],
  ["SPOTIFY P2A7C SYDNEY", "Spotify"],
  ["GOOGLE *YOUTUBEPREMIUM", "YouTube Premium"],
  ["APPLE.COM/BILL SYDNEY", "Apple"],
  ["TELSTRA DIRECT DEBIT", "Telstra"],
  ["DIRECT DEBIT 123456 ORIGIN ENERGY", "Origin Energy"],
  ["BPAY SYDNEY WATER 123456789", "Sydney Water"],
  ["NRMA INSURANCE 88213", "NRMA Insurance"],
  ["EVENT CINEMAS GEORGE ST", "Event Cinemas"],
  ["BOOKING.COM HOTEL KATOOMBA", "Booking.com"],
  // Money in, transfers and the bank's own lines keep their words
  ["SALARY SAMPLE CO PTY LTD, PAYROLL", "Salary Sample Co"],
  ["ACME PTY LTD SALARY", "Acme Salary"],
  ["PAYMENT FROM SAMPLE CO PTY LTD", "Payment from Sample Co"],
  ["OSKO PAYMENT TO JANE CITIZEN", "Jane Citizen"],
  ["TRANSFER TO SAVINGS 0042", "Transfer to Savings"],
  ["TRANSFER FROM EVERYDAY", "Transfer from Everyday"],
  ["RENT RAY WHITE REF 4417", "Rent Ray White"],
  ["CREDIT CARD PAYMENT 5521", "Credit Card Payment"],
  ["ATM WITHDRAWAL 012345 SYDNEY", "ATM Withdrawal"],
  ["INTEREST CREDIT", "Interest Credit"],
  ["CHEQUE 000123", "Cheque"],
  // Nothing that names a shop
  ["1234567890", null],
  ["EFTPOS 0123 4567", null],
  ["", null],
];

describe("shop names from bank text", () => {
  it.each(EXAMPLES)("%s reads %s", (description, name) => {
    expect(shopFor(description)?.name ?? null).toBe(name);
  });

  it("covers plenty of made-up descriptions", () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(30);
  });

  it("gives every variation of a shop the same key, whatever its store, suburb or card", () => {
    const keys = (descriptions: string[]) =>
      new Set(descriptions.map((d) => shopFor(d)?.matchText));
    expect(
      keys([
        "WOOLWORTHS 1234 SYDNEY AU",
        "WOOLWORTHS METRO 2231",
        "EFTPOS DEBIT 0123 WOOLWORTHS 1234 SYDNEY AU",
        "WW METRO 0410 PYRMONT NSW",
      ]),
    ).toEqual(new Set(["WOOLWORTHS"]));
    expect(
      keys([
        "SQ *BAR LUCA",
        "BAR LUCA 0012 SYDNEY",
        "VISA PURCHASE BAR LUCA SURRY HILLS NS AUS",
        "BAR LUCA NSW",
      ]),
    ).toEqual(new Set(["BAR LUCA"]));
    expect(keys(["DAN MURPHY'S 1234", "DAN MURPHYS 77", "Dan Murphys online"])).toHaveProperty(
      "size",
      1,
    );
  });

  it("cleans unknown shops down to their name, in capitals", () => {
    expect(shopText("VISA PURCHASE BAR LUCA 0012 SYDNEY AU")).toBe("BAR LUCA");
    expect(shopText("EFTPOS PURCHASE AT THE NOODLE HOUSE 23/08/2026 14:02")).toBe(
      "THE NOODLE HOUSE",
    );
    expect(shopText("ROSE BAY FISH MARKET INV-20931 ROSE BAY NSW")).toBe("ROSE BAY FISH MARKET");
  });

  it("writes names the way people do", () => {
    expect(tidyName("THE COFFEE CLUB")).toBe("The Coffee Club");
    expect(tidyName("NETFLIX.COM")).toBe("Netflix.com");
    expect(tidyName("KFC")).toBe("KFC");
    expect(tidyName("MCDONALDS")).toBe("McDonalds");
    expect(tidyName("BED & BATH")).toBe("Bed & Bath");
  });

  it("keeps the built-in list free of clashes, so each match names one shop", () => {
    const owners = new Map<string, string>();
    for (const shop of KNOWN_SHOPS)
      for (const match of shop.match) {
        expect(owners.get(loose(match)) ?? shop.name).toBe(shop.name);
        owners.set(loose(match), shop.name);
      }
  });
});
