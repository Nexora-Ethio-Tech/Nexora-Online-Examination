import { loadBackendEnvironment } from '../src/common/db/database-config';
import { AiProviderError, suggestQuestion } from '../src/modules/authoring/ai-provider';

async function main() {
  loadBackendEnvironment();
  for (const language of ['en', 'am'] as const) {
    if (process.argv[2] && process.argv[2] !== language) continue;
    const result = await suggestQuestion({
      subject: 'Mathematics',
      grade: 'Grade 10',
      language,
      topicNames: language === 'en' ? ['Linear equations'] : ['መስመራዊ እኩልታዎች'],
      question: {
        type: 'mcq_single',
        stem: language === 'en' ? 'Solve 2x + 3 = 11.' : '2x + 3 = 11 ከሆነ የx ዋጋ ስንት ነው?',
        options: [
          { id: 'A', text: '3' },
          { id: 'B', text: '4' },
          { id: 'C', text: '7' },
        ],
        correctOptionId: 'B',
      },
    });
    process.stdout.write(`${JSON.stringify({ language, ...result })}\n`);
  }
}

main().catch((error) => {
  // Do not print arbitrary provider messages, environment values or URLs.
  process.stderr.write(`${error instanceof AiProviderError ? error.code : 'AI_CHECK_FAILED'}\n`);
  process.exitCode = 1;
});
