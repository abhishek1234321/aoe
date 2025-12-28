import { getISOWeek } from 'date-fns';
import { formatCurrency } from './format';
import type { OrderSummary } from './types';

export type Highlights = {
  totalOrders: number;
  nonCancelledOrders: number;
  totalSpend: number;
  avgOrderValue: number;
  currency: string;
  formattedSpend: string;
  formattedAvg: string;
  busiestDay?: string;
  topPeriod?: { label: string; count: number };
  topItems: Array<{ label: string; count: number }>;
  uniqueItems: number;
  repeatItems: number;
};

export const computeHighlights = (orders: OrderSummary[], timeFilterValue?: string): Highlights => {
  const isNonCancelled = (status?: string) => {
    const normalized = (status ?? '').toLowerCase();
    return !normalized.includes('cancel') && !normalized.includes('return');
  };
  const safeOrders = orders.filter((order) => isNonCancelled(order.status));
  const totalSpend = safeOrders.reduce((sum, order) => {
    const amt = order.total.amount ?? 0;
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);
  const currency = safeOrders.find((o) => o.total.currencySymbol)?.total.currencySymbol ?? '';
  const avgOrderValue = safeOrders.length ? totalSpend / safeOrders.length : 0;
  const hasSpendData = safeOrders.length > 0;

  const parseLocalIsoDate = (value?: string) => {
    if (!value) return null;
    const parts = value.split('-').map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
      return null;
    }
    const [year, month, day] = parts;
    return new Date(year, month - 1, day);
  };

  const getDate = (order: OrderSummary) => {
    if (order.orderDateISO) {
      return parseLocalIsoDate(order.orderDateISO) ?? new Date(order.orderDateISO);
    }
    if (order.orderDateText) {
      return new Date(order.orderDateText);
    }
    return null;
  };

  const locale = typeof navigator !== 'undefined' ? navigator.languages?.[0] ?? navigator.language : 'en-IN';
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone });
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone });

  const dayCounts = new Map<string, number>();
  const periodCounts = new Map<string, number>();
  const periodLabels = new Map<string, string>();
  const useMonthly = timeFilterValue?.startsWith('year-');
  safeOrders.forEach((order) => {
    const date = getDate(order);
    if (!date || Number.isNaN(date.getTime())) return;
    const dayLabel = weekdayFormatter.format(date);
    dayCounts.set(dayLabel, (dayCounts.get(dayLabel) ?? 0) + 1);
    if (useMonthly) {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      periodCounts.set(key, (periodCounts.get(key) ?? 0) + 1);
      periodLabels.set(key, monthFormatter.format(date));
    } else {
      const week = getISOWeek(date);
      const key = `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
      periodCounts.set(key, (periodCounts.get(key) ?? 0) + 1);
      periodLabels.set(key, `Week ${week}, ${date.getFullYear()}`);
    }
  });

  const busiestDay = Array.from(dayCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topPeriodEntry = Array.from(periodCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const topPeriod = topPeriodEntry
    ? { label: periodLabels.get(topPeriodEntry[0]) ?? topPeriodEntry[0], count: topPeriodEntry[1] }
    : undefined;

  const itemCounts = new Map<string, { label: string; count: number }>();
  orders.forEach((order) => {
    order.shipments.forEach((shipment) => {
      shipment.items.forEach((item) => {
        const key = item.asin ?? item.title ?? '';
        if (!key) return;
        const current = itemCounts.get(key) ?? { label: item.title || key, count: 0 };
        current.count += 1;
        itemCounts.set(key, current);
      });
    });
  });
  const topItems = Array.from(itemCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const uniqueItems = Array.from(itemCounts.values()).filter((i) => i.count === 1).length;
  const repeatItems = Array.from(itemCounts.values()).filter((i) => i.count > 1).length;

  return {
    totalOrders: orders.length,
    nonCancelledOrders: safeOrders.length,
    totalSpend,
    avgOrderValue,
    currency,
    formattedSpend: hasSpendData ? formatCurrency(totalSpend, currency) : '',
    formattedAvg: hasSpendData ? formatCurrency(avgOrderValue, currency) : '',
    busiestDay,
    topPeriod,
    topItems,
    uniqueItems,
    repeatItems,
  };
};
