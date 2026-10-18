import { describe, expect, it, vi } from 'vitest';
import { generateExam } from '../../src/modules/authoring/exam-generator';
const context = { subject: 'Math', grade: '10', language: 'en' as const };
const input = {
  revision: 1,
  topics: 'Algebra',
  guidance: '',
  difficulty: 'easy' as const,
  mcqCount: 1,
  trueFalseCount: 0,
  marksPerQuestion: 3,
  replaceExisting: false,
};
const item = {
  type: 'mcq_single',
  stem: 'What is 2 + 2?',
  options: [
    { id: 'A', text: '4' },
    { id: 'B', text: '5' },
    { id: 'C', text: '6' },
    { id: 'D', text: '7' },
  ],
  correctOptionId: 'A',
  primaryTopic: 'Arithmetic',
  explanation: 'Adding two and two gives four.',
};
const env = { OPENAI_API_KEY: 'private-test-key', OPENAI_MODEL: 'test-model' };
function provider(items: unknown[], finish = 'stop') {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: finish, message: { content: JSON.stringify({ items }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 200 },
      }),
    ),
  );
}
describe('AI exam generation provider', () => {
  it('creates unreviewed server identities and fixed marks without passing control fields or secrets', async () => {
    const request = provider([item]);
    const result = await generateExam(context, input, env, request);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      marks: 3,
      reviewed: false,
      keyConsistent: null,
      reviewFlags: [],
    });
    expect(result.items[0].itemId).toMatch(/^[0-9a-f-]{36}$/);
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    const sent = JSON.parse(body.messages[1].content);
    expect(sent).toMatchObject({ ...context, topics: 'Algebra', mcqCount: 1 });
    expect(sent.revision).toBeUndefined();
    expect(sent.replaceExisting).toBeUndefined();
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 200 });
    expect(JSON.stringify(result)).not.toContain(env.OPENAI_API_KEY);
  });
  it('rejects invalid keys, duplicate questions/options, wrong counts and injected review state', async () => {
    for (const items of [
      [],
      [item, item],
      [{ ...item, correctOptionId: 'X' }],
      [{ ...item, options: [...item.options.slice(0, 3), item.options[0]] }],
      [{ ...item, reviewed: true }],
    ]) {
      await expect(generateExam(context, input, env, provider(items))).rejects.toThrow();
    }
    await expect(
      generateExam(context, { ...input, mcqCount: 2 }, env, provider([item, item])),
    ).rejects.toThrow('AI_INVALID_EXAM');
  });
  it('rejects truncation and never returns partial exam content', async () => {
    await expect(generateExam(context, input, env, provider([item], 'length'))).rejects.toThrow(
      'AI_TRUNCATED',
    );
  });
  it('validates true/false identities and preserves requested language', async () => {
    const tf = {
      ...item,
      type: 'true_false',
      options: [
        { id: 'true', text: 'True' },
        { id: 'false', text: 'False' },
      ],
      correctOptionId: 'true',
    };
    const request = provider([tf]);
    const result = await generateExam(
      { ...context, language: 'am' },
      { ...input, mcqCount: 0, trueFalseCount: 1 },
      env,
      request,
    );
    expect(result.items[0].type).toBe('true_false');
    expect(
      JSON.parse(JSON.parse(String(request.mock.calls[0][1]?.body)).messages[1].content).language,
    ).toBe('am');
  });
});
