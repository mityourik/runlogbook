export const analyticsPeriods = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'last_7_days',
  'last_30_days'
] as const;

export type AnalyticsPeriod = (typeof analyticsPeriods)[number];

export type AnalyticsPeriodInput = {
  period?: AnalyticsPeriod;
  startDate?: string;
  endDate?: string;
};

export type ResolvedAnalyticsPeriod = {
  period?: AnalyticsPeriod;
  startDate: string;
  endDate: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolveAnalyticsPeriod(
  input: AnalyticsPeriodInput,
  now = new Date()
): ResolvedAnalyticsPeriod {
  if (input.startDate !== undefined || input.endDate !== undefined) {
    if (input.startDate === undefined || input.endDate === undefined) {
      throw new Error('startDate and endDate are both required');
    }

    if (input.startDate > input.endDate) {
      throw new Error('startDate must be before or equal to endDate');
    }

    return { startDate: input.startDate, endDate: input.endDate };
  }

  const period = input.period ?? 'this_week';
  const today = utcDateOnly(now);

  switch (period) {
    case 'today':
      return withPeriod(period, today, today);
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return withPeriod(period, yesterday, yesterday);
    }
    case 'this_week': {
      const startDate = startOfUtcWeek(today);
      return withPeriod(period, startDate, addDays(startDate, 6));
    }
    case 'last_week': {
      const startDate = addDays(startOfUtcWeek(today), -7);
      return withPeriod(period, startDate, addDays(startDate, 6));
    }
    case 'this_month': {
      const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const endDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
      return withPeriod(period, startDate, endDate);
    }
    case 'last_month': {
      const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const endDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return withPeriod(period, startDate, endDate);
    }
    case 'last_7_days':
      return withPeriod(period, addDays(today, -6), today);
    case 'last_30_days':
      return withPeriod(period, addDays(today, -29), today);
  }
}

function withPeriod(period: AnalyticsPeriod, startDate: Date, endDate: Date): ResolvedAnalyticsPeriod {
  return {
    period,
    startDate: formatUtcDate(startDate),
    endDate: formatUtcDate(endDate)
  };
}

function utcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function startOfUtcWeek(date: Date): Date {
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return addDays(date, -daysSinceMonday);
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
