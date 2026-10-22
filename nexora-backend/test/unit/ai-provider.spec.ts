import { describe, expect, it, vi } from 'vitest';
import {
  aiConfiguration,
  suggestQuestion,
  AiQuestionInput,
} from '../../src/modules/authoring/ai-provider';

const env = {
  OPENAI_API_KEY: 'synthetic-key',
  OPENAI_MODEL: 'configured-model',
  OPENAI_BASE_URL: 'https://provider.example/custom/v1/',
};
const input: AiQuestionInput = {
  subject: 'Math',
  grade: '10',
  language: 'en',
  topicNames: ['Algebra'],
  question: {
    type: 'mcq_single',
    stem: '2 + 2?',
    options: [
      { id: 'A', text: '4' },
      { id: 'B', text: '5' },
    ],
    correctOptionId: 'A',
  },
};
const suggestion = {
  primaryTopic: ' Algebra ',
  secondaryTopics: ['Algebra', '  Arithmetic  ', 'Arithmetic'],
  explanation: 'Two plus two is four.',
  keyConsistent: true,
  reviewFlags: [],
};
function response(content: unknown = suggestion, finish = 'stop') {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: finish, message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 100, completion_tokens: 30 },
    }),
  );
}

describe('configurable AI provider boundary', () => {
  const dual = {
    GROQ_API_KEY: 'synthetic-groq',
    GROQ_MODEL: 'openai/gpt-oss-120b',
    GEMINI_API_KEY: 'synthetic-gemini',
    GEMINI_MODEL: 'gemini-flash-latest',
  };
  it('uses Groq first and Gemini only on eligible failure, with separate credentials', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(response());
    const result = await suggestQuestion(input, { ...env, ...dual }, request);
    expect(result.model).toBe(dual.GEMINI_MODEL);
    expect(request.mock.calls.map(([url]) => new URL(String(url)).hostname)).toEqual([
      'api.groq.com',
      'generativelanguage.googleapis.com',
    ]);
    expect(request.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer synthetic-groq',
    });
    expect(request.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer synthetic-gemini',
    });
    expect(aiConfiguration(dual).attemptCount).toBe(2);
  });
  it('does not fall back on successful output or refusal', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response());
    expect((await suggestQuestion(input, dual, request)).model).toBe(dual.GROQ_MODEL);
    expect(request).toHaveBeenCalledTimes(1);
    request.mockClear().mockResolvedValue(response(suggestion, 'content_filter'));
    await expect(suggestQuestion(input, dual, request)).rejects.toThrow('AI_FILTERED');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not silently route incomplete provider settings to the legacy provider', () => {
    expect(() => aiConfiguration({ ...env, GROQ_API_KEY: 'synthetic' })).toThrow(
      'AI_NOT_CONFIGURED',
    );
  });
  it('uses the configured URL and model without exposing secrets in the returned metadata', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response());
    const original = JSON.stringify(input);
    const result = await suggestQuestion(input, env, request);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe('https://provider.example/custom/v1/chat/completions');
    expect(init?.redirect).toBe('error');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('configured-model');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.store).toBe(false);
    expect(JSON.parse(body.messages[1].content)).toEqual(input);
    expect(result.suggestion.secondaryTopics).toEqual(['Arithmetic']);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 30 });
    expect(JSON.stringify(result)).not.toContain(env.OPENAI_API_KEY);
    expect(JSON.stringify(input)).toBe(original);
  });
  it('fails explicitly without configuration and rejects insecure production URLs', () => {
    expect(() => aiConfiguration({})).toThrow('AI_NOT_CONFIGURED');
    for (const base of [
      'http://provider.example/v1',
      'https://user:secret@provider.example/v1',
      'https://provider.example/v1?key=secret',
      'http://localhost:8080/v1',
    ]) {
      expect(() =>
        aiConfiguration({ ...env, NODE_ENV: 'production', OPENAI_BASE_URL: base }),
      ).toThrow('AI_INVALID_BASE_URL');
    }
    expect(aiConfiguration({ ...env, OPENAI_BASE_URL: 'http://localhost:8080/v1' }).endpoint).toBe(
      'http://localhost:8080/v1/chat/completions',
    );
  });
  it('rejects extra output fields that could change the teacher key', async () => {
    await expect(
      suggestQuestion(
        input,
        env,
        vi.fn<typeof fetch>().mockResolvedValue(response({ ...suggestion, correctOptionId: 'B' })),
      ),
    ).rejects.toThrow('AI_INVALID_SUGGESTION');
  });
  it('rejects truncated output and malformed JSON without a fallback', async () => {
    await expect(
      suggestQuestion(
        input,
        env,
        vi.fn<typeof fetch>().mockResolvedValue(response(suggestion, 'length')),
      ),
    ).rejects.toThrow('AI_TRUNCATED');
    await expect(
      suggestQuestion(
        input,
        env,
        vi.fn<typeof fetch>().mockResolvedValue(new Response('secret-provider-body')),
      ),
    ).rejects.toThrow('AI_INVALID_JSON');
  });
  it('returns a sanitized retryable rate-limit error without retrying inside the adapter', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private error details', { status: 429 }));
    await expect(suggestQuestion(input, env, request)).rejects.toMatchObject({
      code: 'AI_HTTP_429',
      retryable: true,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('bounds custom provider output', async () => {
    await expect(
      suggestQuestion(
        input,
        env,
        vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(131073))),
      ),
    ).rejects.toThrow('AI_RESPONSE_TOO_LARGE');
  });
});
