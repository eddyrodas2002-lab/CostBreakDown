export type Category =
  | "groceries"
  | "household"
  | "health"
  | "gas"
  | "food-court"
  | "alcohol"
  | "pet"
  | "baby"
  | "clothing"
  | "electronics"
  | "home"
  | "other";

export type Pace = "auto" | "weekly" | "biweekly" | "monthly";

export interface LineItem {
  id: string;
  description: string;
  itemNumber?: string;
  quantity: number;
  unitPrice?: number;
  amount: number;
  taxCode?: string;
  category: Category;
  executiveEligible: boolean;
  visaRate: number;
}

export interface Receipt {
  id: string;
  purchasedAt: string;
  warehouse: string;
  items: LineItem[];
  tax: number;
  total: number;
  rawText?: string;
  sample?: boolean;
  createdAt: string;
}

export interface Settings {
  blackCard: boolean;
  costcoVisa: boolean;
  pace: Pace;
}

export interface Draft {
  purchasedAt: string;
  warehouse: string;
  items: LineItem[];
  tax: number;
  total: number;
  rawText: string;
  sample: boolean;
  editingId?: string;
  detectedSubtotal?: number;
}

export interface RewardBreakdown {
  executive: number;
  visa: number;
  total: number;
  groceryRewards: number;
  grocerySpend: number;
  merchandise: number;
  gasSpend: number;
  executiveBase: number;
  executiveCapped: boolean;
  gasCapped: boolean;
}

export interface CategorySpend {
  category: Category;
  spent: number;
  share: number;
}

export interface YearSummary {
  year: number;
  tripCount: number;
  olderTripCount: number;
  spent: number;
  daysCovered: number;
  daysRemaining: number;
  early: boolean;
  firstDate?: string;
  actual: RewardBreakdown;
  projected: RewardBreakdown;
  byCategory: CategorySpend[];
}
