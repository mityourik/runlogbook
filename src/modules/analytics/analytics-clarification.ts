import type { ClassifiedAnalyticsIntent } from './analytics-intents.js';

export type AnalyticsClarificationOption = { label: string; intents: ClassifiedAnalyticsIntent[] };

export function buildAnalyticsClarificationOptions(question: string): AnalyticsClarificationOption[] {
  const normalizedQuestion = question.toLocaleLowerCase('ru-RU').trim().replaceAll('ё', 'е').replace(/\s+/g, ' ');

  if (['интервал', 'круг', 'lap'].some((keyword) => normalizedQuestion.includes(keyword))) {
    return [
      option('Тренировки за эту неделю', 'workout_summary', { period: 'this_week' }),
      option('Тренировки за последние 30 дней', 'workout_summary', { period: 'last_30_days' }),
      option('Круги за последние 30 дней', 'lap_summary', { period: 'last_30_days' })
    ];
  }

  return [
    option('Километраж за эту неделю', 'distance_summary', { period: 'this_week' }),
    option('Выполнение плана', 'plan_adherence', {}),
    option('Разбивка по типам за эту неделю', 'workout_type_breakdown', { period: 'this_week' })
  ];
}

function option(
  label: string,
  name: ClassifiedAnalyticsIntent['name'],
  parameters: ClassifiedAnalyticsIntent['parameters']
): AnalyticsClarificationOption {
  return {
    label,
    intents: [{ name, parameters, confidence: 1 }]
  };
}
