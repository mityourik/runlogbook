import { z } from 'zod';
import { analyticsPeriods } from './analytics-periods.js';

export const analyticsIntentNames = [
  'distance_summary',
  'run_count_summary',
  'duration_summary',
  'pace_summary',
  'weekly_summary',
  'longest_run',
  'effort_summary',
  'plan_adherence',
  'planned_vs_actual',
  'workout_type_breakdown',
  'workout_summary',
  'lap_summary'
] as const;

export type AnalyticsIntentName = (typeof analyticsIntentNames)[number];

export const workoutKinds = ['easy', 'workout', 'long', 'race', 'other'] as const;

export type WorkoutKind = (typeof workoutKinds)[number];

export type AnalyticsIntentCatalogEntry = {
  name: AnalyticsIntentName;
  description: string;
  parameters: Array<keyof z.infer<typeof analyticsIntentParametersSchema>>;
  examples: string[];
};

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const analyticsIntentParametersSchema = z
  .object({
    period: z.enum(analyticsPeriods).optional(),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    weekStart: isoDateSchema.optional(),
    workoutKind: z.enum(workoutKinds).optional(),
    runId: z.string().uuid().optional()
  })
  .strict();

export const analyticsIntentCatalog: AnalyticsIntentCatalogEntry[] = [
  {
    name: 'distance_summary',
    description: 'Summarizes total running distance for a selected period or date range.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['Сколько километров я пробежал на этой неделе?', 'Покажи дистанцию за последние 30 дней']
  },
  {
    name: 'run_count_summary',
    description: 'Counts completed runs for a selected period or date range.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['Сколько пробежек было в этом месяце?', 'Сколько раз я бегал за прошлую неделю?']
  },
  {
    name: 'duration_summary',
    description: 'Summarizes total running time for a selected period or date range.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['Сколько времени я бегал за неделю?', 'Покажи общий объем времени за месяц']
  },
  {
    name: 'pace_summary',
    description: 'Reports average pace trends for a selected period or date range.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['Какой у меня средний темп за последние 7 дней?', 'Покажи темп за этот месяц']
  },
  {
    name: 'weekly_summary',
    description: 'Provides a weekly training summary anchored to a week start date when supplied.',
    parameters: ['weekStart'],
    examples: ['Сделай сводку за эту неделю', 'Покажи итоги недели с 2026-05-11']
  },
  {
    name: 'longest_run',
    description: 'Finds the longest run in a selected period or date range.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['Какая была самая длинная пробежка в этом месяце?', 'Найди мой самый длинный забег за 30 дней']
  },
  {
    name: 'effort_summary',
    description: 'Summarizes perceived or recorded training effort for a selected period.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['Какой была нагрузка за неделю?', 'Покажи усилие по тренировкам за месяц']
  },
  {
    name: 'plan_adherence',
    description: 'Summarizes how well completed runs matched the training plan.',
    parameters: ['period'],
    examples: ['Как я выполняю план на этой неделе?', 'Покажи соблюдение плана за месяц']
  },
  {
    name: 'planned_vs_actual',
    description: 'Compares planned workouts with actual completed runs.',
    parameters: ['period', 'startDate', 'endDate'],
    examples: ['Сравни план и факт за неделю', 'Что было запланировано и что я реально пробежал?']
  },
  {
    name: 'workout_type_breakdown',
    description: 'Breaks runs down by workout kind for a selected period or date range.',
    parameters: ['period', 'startDate', 'endDate', 'workoutKind'],
    examples: ['Сколько было легких и темповых тренировок?', 'Покажи разбивку по типам пробежек за месяц']
  },
  {
    name: 'workout_summary',
    description: 'Summarizes workouts, optionally filtered by workout kind or a specific run.',
    parameters: ['period', 'startDate', 'endDate', 'workoutKind', 'runId'],
    examples: ['Покажи сводку по тренировкам за неделю', 'Расскажи про эту тренировку']
  },
  {
    name: 'lap_summary',
    description: 'Summarizes lap or split details for a specific run or selected period.',
    parameters: ['runId', 'period', 'startDate', 'endDate'],
    examples: ['Покажи круги по последней тренировке', 'Какие были сплиты в этой пробежке?']
  }
];

const allowedParameterKeysByIntent = {
  distance_summary: ['period', 'startDate', 'endDate'],
  run_count_summary: ['period', 'startDate', 'endDate'],
  duration_summary: ['period', 'startDate', 'endDate'],
  pace_summary: ['period', 'startDate', 'endDate'],
  weekly_summary: ['weekStart'],
  longest_run: ['period', 'startDate', 'endDate'],
  effort_summary: ['period', 'startDate', 'endDate'],
  plan_adherence: ['period'],
  planned_vs_actual: ['period', 'startDate', 'endDate'],
  workout_type_breakdown: ['period', 'startDate', 'endDate', 'workoutKind'],
  workout_summary: ['period', 'startDate', 'endDate', 'workoutKind', 'runId'],
  lap_summary: ['period', 'startDate', 'endDate', 'runId']
} satisfies Record<AnalyticsIntentName, Array<keyof z.infer<typeof analyticsIntentParametersSchema>>>;

export const classifiedAnalyticsIntentSchema = z
  .object({
    name: z.enum(analyticsIntentNames),
    parameters: analyticsIntentParametersSchema.default({}),
    confidence: z.number().min(0).max(1).default(1)
  })
  .strict()
  .superRefine((intent, context) => {
    const allowedKeys = new Set(allowedParameterKeysByIntent[intent.name]);

    for (const parameterKey of Object.keys(intent.parameters)) {
      if (!allowedKeys.has(parameterKey as keyof typeof intent.parameters)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parameters', parameterKey],
          message: `${parameterKey} is not allowed for ${intent.name}`
        });
      }
    }
  });

export type ClassifiedAnalyticsIntent = z.infer<typeof classifiedAnalyticsIntentSchema>;

export const classifiedAnalyticsIntentsSchema = z.array(classifiedAnalyticsIntentSchema).min(1).max(4);
