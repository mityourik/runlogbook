import type { ClassifiedAnalyticsIntent } from './analytics-intents.js';
import type { AnalyticsQueryExecutor, AnalyticsQueryResult } from './analytics-query-executor.js';
import type { LlmAnalyticsClassifier } from './analytics-llm-classifier.js';
import { buildAnalyticsClarificationOptions, type AnalyticsClarificationOption } from './analytics-clarification.js';
import { resolveAnalyticsPeriod } from './analytics-periods.js';
import { classifyAnalyticsQuestionWithRules } from './analytics-rule-classifier.js';

export type AnalyticsQueryResponse =
  | {
      status: 'answered';
      question: string;
      resolved: { source: 'rules' | 'llm' | 'user_selection'; intents: ClassifiedAnalyticsIntent[] };
      results: AnalyticsQueryResult[];
    }
  | { status: 'needs_clarification'; question: string; options: AnalyticsClarificationOption[] };

type AnalyticsQueryInput = {
  userId: string;
  question: string;
  selectedOption?: { intents: ClassifiedAnalyticsIntent[] };
};

export class AnalyticsQueryService {
  constructor(
    private readonly executor: Pick<AnalyticsQueryExecutor, 'execute'>,
    private readonly llmClassifier: Pick<LlmAnalyticsClassifier, 'isConfigured' | 'classify'>,
    private readonly config: { now?: () => Date } = {}
  ) {}

  async query(input: AnalyticsQueryInput): Promise<AnalyticsQueryResponse> {
    if (input.selectedOption) {
      return this.answer(input.userId, input.question, input.selectedOption.intents, 'user_selection');
    }

    const ruleClassification = classifyAnalyticsQuestionWithRules(input.question);

    if (ruleClassification) {
      return this.answer(input.userId, input.question, ruleClassification.intents, 'rules');
    }

    if (this.llmClassifier.isConfigured()) {
      let resolvedIntents: ClassifiedAnalyticsIntent[] | null = null;

      try {
        const llmClassification = await this.llmClassifier.classify(input.question);

        if (llmClassification.intents.every((intent) => intent.confidence >= 0.7)) {
          resolvedIntents = this.resolveIntents(llmClassification.intents);
        }
      } catch {
        // Fall through to deterministic clarification options when LLM classification is unavailable.
      }

      if (resolvedIntents) {
        return this.answerResolved(input.userId, input.question, resolvedIntents, 'llm');
      }
    }

    return { status: 'needs_clarification', question: input.question, options: buildAnalyticsClarificationOptions(input.question) };
  }

  private async answer(
    userId: string,
    question: string,
    intents: ClassifiedAnalyticsIntent[],
    source: 'rules' | 'llm' | 'user_selection'
  ): Promise<AnalyticsQueryResponse> {
    const resolvedIntents = this.resolveIntents(intents);

    return this.answerResolved(userId, question, resolvedIntents, source);
  }

  private resolveIntents(intents: ClassifiedAnalyticsIntent[]): ClassifiedAnalyticsIntent[] {
    return intents.map((intent) => this.resolveIntent(intent));
  }

  private async answerResolved(
    userId: string,
    question: string,
    resolvedIntents: ClassifiedAnalyticsIntent[],
    source: 'rules' | 'llm' | 'user_selection'
  ): Promise<AnalyticsQueryResponse> {
    const results = await this.executor.execute({ userId, intents: resolvedIntents });

    return { status: 'answered', question, resolved: { source, intents: resolvedIntents }, results };
  }

  private resolveIntent(intent: ClassifiedAnalyticsIntent): ClassifiedAnalyticsIntent {
    if (intent.name === 'plan_adherence') {
      const resolved = hasPeriodInput(intent.parameters)
        ? resolveAnalyticsPeriod(intent.parameters, this.now())
        : todayPeriod(this.now());

      return { ...intent, parameters: { ...intent.parameters, ...resolved } };
    }

    if (intent.name === 'weekly_summary') {
      const resolved = resolveAnalyticsPeriod(
        intent.parameters.weekStart ? { startDate: intent.parameters.weekStart, endDate: intent.parameters.weekStart } : {},
        this.now()
      );
      const weekStart = intent.parameters.weekStart ?? resolved.startDate;

      return {
        ...intent,
        parameters: { ...intent.parameters, weekStart }
      };
    }

    const resolved = resolveAnalyticsPeriod(intent.parameters, this.now());

    return { ...intent, parameters: { ...intent.parameters, ...resolved } };
  }

  private now(): Date {
    return this.config.now?.() ?? new Date();
  }
}

function hasPeriodInput(parameters: ClassifiedAnalyticsIntent['parameters']): boolean {
  return parameters.period !== undefined || parameters.startDate !== undefined || parameters.endDate !== undefined;
}

function todayPeriod(now: Date): { startDate: string; endDate: string } {
  const today = now.toISOString().slice(0, 10);

  return { startDate: today, endDate: today };
}
