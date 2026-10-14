export type Frequency = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'yearly';

export interface Category {
  id: number;
  name: string;
  color: string;
  monthly_budget: number;
  position: number;
}

export interface Attachment {
  id: number;
  filename: string;
  mime: string;
  size: number;
  created_at: string;
}

export interface Bill {
  id: number;
  label: string;
  supplier: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  amount: number;
  due_date: string;
  paid_date: string | null;
  notes: string;
  recurring_id: number | null;
  attachment_count: number;
  attachments?: Attachment[];
}

export interface Recurring {
  id: number;
  label: string;
  supplier: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  amount: number;
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  active: number;
  notes: string;
  next_due: string | null;
}

export interface Totals {
  total: number;
  paid: number;
  unpaid: number;
  count: number;
}

export interface Budget {
  month: string;
  budget: number;
  totals: Totals;
  categories: Array<Pick<Category, 'id' | 'name' | 'color' | 'monthly_budget'> & { spent: number; paid: number; count: number }>;
  uncategorized: { spent: number; paid: number; count: number };
  history: Array<Totals & { month: string }>;
}

export interface Dashboard {
  today: string;
  month: string;
  budget: number;
  totals: Totals;
  overdue: Bill[];
  upcoming: Bill[];
}
