import type { ClassifiedAnalyticsIntent } from './analytics-intents.js';
import type { AnalyticsPeriod } from './analytics-periods.js';

export type RuleClassification = { source: 'rules'; intents: ClassifiedAnalyticsIntent[] };

type IntentMatch = {
  name: ClassifiedAnalyticsIntent['name'];
  confidence: number;
};

export function classifyAnalyticsQuestionWithRules(question: string): RuleClassification | null {
  const normalizedQuestion = normalizeQuestion(question);
  const period = detectPeriod(normalizedQuestion);
  const matches = detectIntents(normalizedQuestion);

  if (matches.length === 0) {
    return null;
  }

  return {
    source: 'rules',
    intents: matches.map((match) => ({
      name: match.name,
      parameters: { period },
      confidence: match.confidence
    }))
  };
}

function normalizeQuestion(question: string): string {
  return question.toLocaleLowerCase('ru-RU').trim().replaceAll('ё', 'е').replace(/\s+/g, ' ');
}

function detectPeriod(question: string): AnalyticsPeriod {
  if (hasAny(question, ['сегодня', 'за сегодня'])) return 'today';
  if (hasAny(question, ['вчера', 'за вчера'])) return 'yesterday';
  if (hasAny(question, ['прошлую неделю', 'прошлой неделе', 'за прошлую неделю'])) return 'last_week';
  if (hasAny(question, ['последние 7 дней', 'последних 7 дней', 'за 7 дней'])) return 'last_7_days';
  if (hasAny(question, ['последние 30 дней', 'последних 30 дней', 'за 30 дней'])) return 'last_30_days';
  if (hasAny(question, ['прошлый месяц', 'прошлом месяце', 'за прошлый месяц'])) return 'last_month';
  if (hasAny(question, ['этот месяц', 'этом месяце', 'за месяц', 'месяц'])) return 'this_month';

  return 'this_week';
}

function detectIntents(question: string): IntentMatch[] {
  const matches: IntentMatch[] = [];

  addIntent(matches, question, 'distance_summary', ['километраж', 'дистанц', 'сколько я пробежал', 'сколько пробежал', 'км', 'километр'], distanceConfidence(question));
  addIntent(matches, question, 'run_count_summary', ['сколько раз', 'сколько пробежек', 'количество пробежек']);
  addIntent(matches, question, 'duration_summary', ['сколько времени', 'время бега', 'длительность', 'продолжительность']);
  addIntent(matches, question, 'pace_summary', ['темп', 'пейс']);
  addIntent(matches, question, 'longest_run', ['самая длинная', 'самый длинный', 'длиннейшая', 'максимальная дистанция']);
  addIntent(matches, question, 'effort_summary', ['нагрузк', 'усили', 'сложност', 'тяжело']);
  addIntent(matches, question, 'plan_adherence', ['выполнение плана', 'соблюдение плана', 'как выполняю план']);
  addIntent(matches, question, 'planned_vs_actual', ['план и факт', 'план факт', 'запланировано', 'реально пробежал']);
  addIntent(matches, question, 'workout_type_breakdown', ['по типам', 'разбивк', 'легких', 'темповых', 'интервальных']);
  addIntent(matches, question, 'workout_summary', ['сводк', 'итоги', 'обзор трениров']);
  addIntent(matches, question, 'lap_summary', ['интервал', 'круг', 'lap', 'сплит']);

  return matches;
}

function addIntent(
  matches: IntentMatch[],
  question: string,
  name: ClassifiedAnalyticsIntent['name'],
  keywords: string[],
  confidence = 0.9
): void {
  if (matches.some((match) => match.name === name) || !hasAny(question, keywords)) {
    return;
  }

  matches.push({ name, confidence });
}

function distanceConfidence(question: string): number {
  return hasAny(question, ['сколько я пробежал', 'сколько пробежал']) ? 0.95 : 0.9;
}

function hasAny(question: string, keywords: string[]): boolean {
  return keywords.some((keyword) => question.includes(keyword));
}
