import { describe, expect, it, vi } from 'vitest';
import { suggestQuestion, AiQuestionInput } from '../../src/modules/authoring/ai-provider';

describe('Amharic AI wire contract (synthetic, not language-quality acceptance)', () => {
  it('preserves Amharic questions and the teacher key while normalizing generated text', async () => {
    const input: AiQuestionInput = {
      subject: 'ታሪክ',
      grade: '10',
      language: 'am',
      topicNames: ['የኢትዮጵያ ታሪክ'],
      question: {
        type: 'mcq_single',
        stem: 'የኢትዮጵያ ዋና ከተማ የት ነው?',
        options: [
          { id: 'A', text: 'አዲስ አበባ' },
          { id: 'B', text: 'ባህር ዳር' },
        ],
        correctOptionId: 'A',
      },
    };
    const original = JSON.stringify(input);
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  primaryTopic: '  የኢትዮጵያ ታሪክ  ',
                  secondaryTopics: ['የኢትዮጵያ ታሪክ'],
                  explanation: 'አዲስ አበባ — cafe\u0301',
                  keyConsistent: true,
                  reviewFlags: ['cafe\u0301'],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 100 },
        }),
      ),
    );
    const result = await suggestQuestion(
      input,
      { OPENAI_API_KEY: 'synthetic', OPENAI_MODEL: 'synthetic-model' },
      request,
    );
    const payload = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(JSON.parse(payload.messages[1].content)).toEqual(input);
    expect(JSON.stringify(input)).toBe(original);
    expect(result.suggestion.explanation).toBe('አዲስ አበባ — café');
    expect(result.suggestion.reviewFlags).toEqual(['café']);
    expect(result.suggestion.secondaryTopics).toEqual([]);
    expect(result.suggestion).not.toHaveProperty('correctOptionId');
  });
});
