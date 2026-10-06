import type { Category, LineItem } from "../types";
import { money, uid } from "./money";

export const EXECUTIVE_RATE = 0.02;
export const VISA_MERCH_RATE = 0.02;
export const VISA_GAS_RATE = 0.05;
export const VISA_GAS_AFTER_CAP_RATE = 0.01;
export const EXECUTIVE_CAP = 1250;
export const GAS_CAP = 7000;

export interface CategoryMeta {
  id: Category;
  label: string;
  emoji: string;
  color: string;
  soft: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: "groceries", label: "Groceries", emoji: "🛒", color: "#12a86a", soft: "#d9ffe9" },
  { id: "household", label: "Household", emoji: "🧻", color: "#1d7ef2", soft: "#e3f1ff" },
  { id: "health", label: "Health", emoji: "💊", color: "#e23b86", soft: "#ffe3f1" },
  { id: "gas", label: "Gas", emoji: "⛽", color: "#ef8a00", soft: "#fff1d6" },
  { id: "food-court", label: "Food court", emoji: "🌭", color: "#ff4d4d", soft: "#ffe4e1" },
  { id: "alcohol", label: "Alcohol", emoji: "🍷", color: "#7c5cff", soft: "#eee9ff" },
  { id: "pet", label: "Pet", emoji: "🐾", color: "#d59a00", soft: "#fff4cc" },
  { id: "baby", label: "Baby", emoji: "🍼", color: "#0e9fbf", soft: "#ddf7ff" },
  { id: "clothing", label: "Clothing", emoji: "👕", color: "#ff4d8d", soft: "#ffe4ef" },
  { id: "electronics", label: "Electronics", emoji: "📺", color: "#3a4bff", soft: "#e6e9ff" },
  { id: "home", label: "Home", emoji: "🛋️", color: "#0f9d8a", soft: "#ddf8f4" },
  { id: "other", label: "Other", emoji: "✨", color: "#6d6788", soft: "#f1eef8" },
];

const byId = new Map(CATEGORIES.map((category) => [category.id, category]));

export function categoryMeta(id: Category): CategoryMeta {
  return byId.get(id) ?? CATEGORIES[CATEGORIES.length - 1];
}

interface RewardFlags {
  executiveEligible: boolean;
  visaRate: number;
}

function blocked(description: string): RewardFlags | null {
  const text = description.toLowerCase();
  if (/\b(tobacco|cigarette|cigarettes|cigar|cigars)\b/.test(text)) {
    return { executiveEligible: false, visaRate: 0 };
  }
  if (/\b(membership fee|member fee|annual fee)\b/.test(text)) {
    return { executiveEligible: false, visaRate: 0 };
  }
  if (/\b(bottle deposit|crv|recycling fee|enviro fee)\b/.test(text)) {
    return { executiveEligible: false, visaRate: 0 };
  }
  if (/\b(shop card|gift card)\b/.test(text)) {
    return { executiveEligible: false, visaRate: VISA_MERCH_RATE };
  }
  return null;
}

export function rewardFlags(description: string, category: Category): RewardFlags {
  const special = blocked(description);
  if (special) return special;
  if (category === "gas") return { executiveEligible: false, visaRate: VISA_GAS_RATE };
  if (category === "food-court") return { executiveEligible: false, visaRate: VISA_MERCH_RATE };
  return { executiveEligible: true, visaRate: VISA_MERCH_RATE };
}

const RULES: { category: Category; test: RegExp }[] = [
  { category: "gas", test: /\b(unleaded|gasoline|diesel|fuel|gas)\b/i },
  {
    category: "food-court",
    test: /chicken bake|pizza slice|food court|\bchurro\b|\bicee\b|hot dog(?!\s+buns?)/i,
  },
  {
    category: "alcohol",
    test: /\b(wine|beer|vodka|whiskey|whisky|tequila|champagne|prosecco|bourbon|cabernet|merlot|pinot|ipa|ale|seltzer)\b/i,
  },
  { category: "baby", test: /\b(diaper|diapers|wipes|formula|huggies|pampers|baby food)\b/i },
  {
    category: "pet",
    test: /\b(dog food|cat food|cat litter|puppy|kitten|pet|kibble|dog treats|cat treats)\b/i,
  },
  {
    category: "health",
    test: /\b(vitamin|tylenol|advil|ibuprofen|shampoo|toothpaste|pharmacy|probiotic|allergy|lotion|sunscreen|supplement|medicine|bandage)\b/i,
  },
  {
    category: "household",
    test: /paper towel|toilet paper|bath tissue|\b(detergent|tide|lysol|clorox|laundry|swiffer|bounty|charmin|kleenex|tissue|foil|sponge|bleach)\b|trash bags?|ziploc|plastic wrap|dish (soap|pods)|dryer sheets/i,
  },
  {
    category: "electronics",
    test: /\b(tv|laptop|ipad|airpods?|samsung|sony|charger|bluetooth|headphones?|computer|monitor|tablet|printer|router)\b/i,
  },
  {
    category: "clothing",
    test: /\b(shirt|pants|jeans|socks|underwear|jacket|tee|t-shirt|leggings|gloves|hoodie|sweater|shorts|dress|pajamas|pyjamas)\b/i,
  },
  {
    category: "home",
    test: /\b(mattress|pillow|sheets?|blanket|towel|towels|vacuum|blender|cookware|curtain|rug|lamp|furniture|duvet|comforter)\b|water filter/i,
  },
  {
    category: "groceries",
    test: /\b(eggs?|milk|banana|apple|chicken|beef|pork|cheese|yogurt|bread|butter|coffee|cereal|rice|pasta|salmon|shrimp|berry|berries|avocado|juice|chips?|cookie|croissant|muffin|bagel|tortilla|flour|sugar|spice|frozen|lettuce|spinach|broccoli|steak|turkey|bacon|sausage|hummus|salsa|guacamole|rotisserie|pizza|snack|almond|peanut|oat|cream|produce|organic|vegetable|fruit|grape|orange|lemon|lime|melon|potato|onion|tomato|cucumber|carrot|kale|cabbage|corn|bean|lentil|quinoa|granola|cracker|pretzel|popcorn|chocolate|candy|soda|coke|pepsi|sparkling|water|kombucha|tea|ketchup|mustard|mayo|sauce|broth|soup|noodle|ramen|tofu|meat|lamb|fish|tuna|bakery|baguette|roll|cake|pesto|olive|vinegar|honey|jam|jelly|salt|cheddar|mozzarella|deli|ribeye|sirloin|bun|buns|ice cream|hot dog buns)\b/i,
  },
];

export function categorize(description: string): Category {
  const text = description.trim();
  if (!text) return "other";
  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.category;
  }
  return "other";
}

export function makeItem(
  partial: Omit<LineItem, "executiveEligible" | "visaRate" | "id" | "quantity"> & {
    id?: string;
    quantity?: number;
  },
): LineItem {
  const category = partial.category;
  const flags = rewardFlags(partial.description, category);
  return {
    id: partial.id ?? uid(),
    description: partial.description.trim(),
    itemNumber: partial.itemNumber,
    quantity: partial.quantity && partial.quantity > 0 ? partial.quantity : 1,
    unitPrice: partial.unitPrice,
    amount: money(partial.amount || 0),
    taxCode: partial.taxCode,
    category,
    executiveEligible: flags.executiveEligible,
    visaRate: flags.visaRate,
  };
}

export function applyTaxHint(items: LineItem[]): LineItem[] {
  const hasTaxable = items.some((item) => item.taxCode === "A");
  if (!hasTaxable) return items;
  return items.map((item) => {
    if (item.category === "other" && item.taxCode === "E") {
      return makeItem({ ...item, category: "groceries" });
    }
    return item;
  });
}
