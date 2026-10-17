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
  const toggle = screen.getByRole('button', { name: 'Hide question numbers' });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('navigation', { name: 'Questions' })).toBeVisible();
  await user.tab();
  await user.keyboard('{Enter}');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
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

it('filters marked questions while keeping answered and review states separate', async () => {
  const user = userEvent.setup();
  render(
    <QuestionNavigator
      items={[{ itemId: 'one' }, { itemId: 'two' }]}
      answers={[{ itemId: 'one', value: 'A' }]}
      reviewItemIds={['two']}
      index={0}
      onSelect={() => undefined}
    />,
  );
  await user.click(screen.getByText('Review filters and status key'));
  await user.click(screen.getByRole('checkbox', { name: /Show marked for review only/ }));
  expect(screen.queryByRole('button', { name: 'Question 1, answered' })).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Question 2, unanswered, marked for review' }),
  ).toBeInTheDocument();
  expect(screen.getByText('1 answered · 1 unanswered')).toBeInTheDocument();
});
