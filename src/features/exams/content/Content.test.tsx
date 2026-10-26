import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
import { QuestionContext } from './Content';
it('shows the referenced passage and section for each question without rendering HTML', () => {
  render(
    <QuestionContext
      item={{ sectionId: 's', passageId: 'p' }}
      structure={{
        sections: [
          {
            id: 's',
            title: 'Reading section',
            type: 'mcq_single',
            shuffle: false,
            blocks: [{ id: 'b', kind: 'text', text: 'Choose one answer' }],
          },
        ],
        passages: [
          {
            id: 'p',
            sectionId: 's',
            title: 'Story',
            blocks: [{ id: 'p1', kind: 'text', text: '<script>not executable</script>' }],
          },
        ],
      }}
    />,
  );
  expect(screen.getByText('Choose one answer')).toBeInTheDocument();
  expect(screen.getByText('<script>not executable</script>')).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
});
