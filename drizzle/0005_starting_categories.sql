-- BUD-24: households made before starting categories existed get them now, in the same order a
-- new household gets them (STARTING_CATEGORIES in src/config/app.ts, as it was then). A household
-- that already has any category is left alone. Colours are handed out later, from spending.
INSERT INTO "categories" ("household_id", "name", "kind", "icon", "sort_order")
SELECT "households"."id", "starting"."name", "starting"."kind"::"category_kind", "starting"."icon", "starting"."sort_order"
FROM "households"
CROSS JOIN (VALUES
  (0, 'Groceries', 'spending', 'cart'),
  (1, 'Eating out', 'spending', 'food'),
  (2, 'Transport', 'spending', 'car'),
  (3, 'Fuel', 'spending', 'fuel'),
  (4, 'Bills and utilities', 'spending', 'bolt'),
  (5, 'Housing', 'spending', 'house'),
  (6, 'Insurance', 'spending', 'umbrella'),
  (7, 'Health', 'spending', 'heart'),
  (8, 'Shopping', 'spending', 'bag'),
  (9, 'Entertainment', 'spending', 'film'),
  (10, 'Subscriptions', 'spending', 'repeat'),
  (11, 'Travel', 'spending', 'plane'),
  (12, 'Gifts', 'spending', 'gift'),
  (13, 'Income', 'income', 'income'),
  (14, 'Transfers', 'transfer', 'transfer'),
  (15, 'Other', 'spending', 'other')
) AS "starting" ("sort_order", "name", "kind", "icon")
WHERE NOT EXISTS (
  SELECT 1 FROM "categories" WHERE "categories"."household_id" = "households"."id"
);
