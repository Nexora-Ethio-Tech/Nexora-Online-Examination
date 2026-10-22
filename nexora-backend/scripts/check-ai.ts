import { loadBackendEnvironment } from '../src/common/db/database-config';
import {
  aiConfigurations,
  suggestQuestion,
  AiProviderError,
} from '../src/modules/authoring/ai-provider';

loadBackendEnvironment();
async function main() {
  const configs = aiConfigurations();
  for (const config of configs) {
    const host = new URL(config.endpoint).hostname;
    process.stdout.write(`${host}: ${config.model} configured\n`);
    if (!process.argv.includes('--live')) continue;
    // Explicit operator action: one synthetic question per provider, no school data.
    try {
      const result = await suggestQuestion(
        {
          subject: 'Mathematics',
          grade: '10',
          language: 'en',
          topicNames: ['Arithmetic'],
          question: {
            type: 'true_false',
            stem: 'Two plus two equals four.',
            options: [
              { id: 'true', text: 'True' },
              { id: 'false', text: 'False' },
            ],
            correctOptionId: 'true',
          },
        },
        {
          OPENAI_API_KEY: config.apiKey,
          OPENAI_MODEL: config.model,
          OPENAI_BASE_URL: config.endpoint.replace(/\/chat\/completions$/, ''),
        },
      );
      process.stdout.write(
        `${host}: structured response verified (${result.usage.outputTokens} output tokens)\n`,
      );
    } catch (error) {
      process.stderr.write(
        `${host}: ${error instanceof AiProviderError ? error.code : 'AI_CHECK_FAILED'}\n`,
      );
      process.exitCode = 1;
    }
  }
}
main().catch(() => {
  process.stderr.write('AI configuration is incomplete or invalid.\n');
  process.exitCode = 1;
});
