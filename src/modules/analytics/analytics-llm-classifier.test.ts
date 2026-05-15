import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LlmAnalyticsClassifier } from './analytics-llm-classifier.js';

describe('LlmAnalyticsClassifier', () => {
  it('parses valid allowlisted JSON', async () => {
    const classifier = new LlmAnalyticsClassifier({
      endpoint: 'https://llm.example.test/v1/chat/completions',
      apiKey: 'test-key',
      model: 'test-model',
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intents: [{ name: 'distance_summary', parameters: { period: 'this_week' }, confidence: 0.82 }]
                  })
                }
              }
            ]
          })
        )
    });

    assert.deepEqual(await classifier.classify('сколько я пробежал за неделю'), {
      source: 'llm',
      intents: [{ name: 'distance_summary', parameters: { period: 'this_week' }, confidence: 0.82 }]
    });
  });

  it('rejects unknown intents', async () => {
    const classifier = new LlmAnalyticsClassifier({
      endpoint: 'https://llm.example.test/v1/chat/completions',
      apiKey: 'test-key',
      model: 'test-model',
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ intents: [{ name: 'raw_sql', parameters: {}, confidence: 1 }] }) } }]
          })
        )
    });

    await assert.rejects(() => classifier.classify('drop table runs'), /Invalid enum value|Invalid option/);
  });
});
