import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { QuestionNavigator } from './QuestionNavigator';

it('supports keyboard collapse and selection across 200 questions without losing parent state', async () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ itemId: `q${i}` }));
  function Exam() {
    const [index, setIndex] = useState(0);
    return (
      <>
        <QuestionNavigator
          items={items}
          answers={[{ itemId: 'q199', value: 'true' }]}
          index={index}
          onSelect={setIndex}
        />
        <button onClick={() => setIndex((n) => n - 1)} disabled={!index}>
          Previous
        </button>
      </>
    );
  }
  render(<Exam />);
  const user = userEvent.setup();
  const toggle = screen.getByRole('button', { name: 'Show question numbers' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('navigation', { name: 'Questions' })).not.toBeInTheDocument();
  await user.tab();
  await user.keyboard('{Enter}');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await user.click(screen.getByRole('button', { name: 'Question 200, answered' }));
  expect(screen.getByText('Question 200 of 200')).toBeInTheDocument();
  await user.click(toggle);
  await user.click(screen.getByRole('button', { name: 'Previous' }));
  expect(screen.getByText('Question 199 of 200')).toBeInTheDocument();
  expect(screen.getByText('1 answered · 199 unanswered')).toBeInTheDocument();
  await user.click(toggle);
  expect(screen.getByRole('button', { name: 'Question 199, unanswered' })).toHaveAttribute(
    'aria-current',
    'step',
  );
  expect(screen.getByRole('button', { name: 'Question 200, answered' })).toBeInTheDocument();
});
