import { z } from 'zod';
import { analyticsIntentCatalog, classifiedAnalyticsIntentsSchema } from './analytics-intents.js';
import { analyticsPeriods } from './analytics-periods.js';

type FetchLike = typeof fetch;

export type LlmClassification = {
  source: 'llm';
  intents: z.infer<typeof classifiedAnalyticsIntentsSchema>;
};

export class LlmAnalyticsClassifier {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly config: {
      endpoint?: string;
      apiKey?: string;
      model: string;
      timeoutMs?: number;
      fetch?: FetchLike;
    }
  ) {
    this.fetchImpl = config.fetch ?? fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.config.endpoint && this.config.apiKey);
  }

  async classify(question: string): Promise<LlmClassification> {
    if (!this.config.endpoint || !this.config.apiKey) {
      throw new Error('Analytics LLM is not configured');
    }

    const signal = AbortSignal.timeout(this.config.timeoutMs ?? 10000);

    const response = await this.fetchImpl(this.config.endpoint, {
      method: 'POST',
      signal,
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: [
              'You classify Russian running analytics questions.',
              'Return strict JSON only with shape {"intents":[{"name":"...","parameters":{},"confidence":0.0}]}.',
              'Never return SQL. Never invent intent names or parameter names.',
              `Allowed periods: ${analyticsPeriods.join(', ')}.`,
              `Allowed intents: ${JSON.stringify(analyticsIntentCatalog)}.`
            ].join('\n')
          },
          { role: 'user', content: question }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Analytics LLM request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Analytics LLM returned no content');
    }

    let parsedContent: unknown;

    try {
      parsedContent = JSON.parse(content);
    } catch {
      throw new Error('Analytics LLM returned invalid JSON');
    }

    const parsed = z.object({ intents: classifiedAnalyticsIntentsSchema }).strict().parse(parsedContent);

    return { source: 'llm', intents: parsed.intents };
  }
}
