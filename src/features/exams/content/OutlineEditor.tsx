import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Item } from '../authoring/schemas';
import { itemSchema } from '../authoring/schemas';
import { structureSchema, structureProblems, type Structure } from './schema';
import { BlocksEditor } from './BlocksEditor';
import { QuestionContext } from './Content';
const field = 'w-full min-w-0 min-h-11 rounded border bg-background p-2';
export function OutlineEditor({
  initial,
  items,
  disabled,
  onDirty,
  onSave,
}: {
  initial?: Structure;
  items: Item[];
  disabled: boolean;
  onDirty: (dirty: boolean) => void;
  onSave: (structure: Structure, items: Item[]) => void;
}) {
  const [structure, setStructure] = useState<Structure>(initial ?? { sections: [], passages: [] });
  const [questions, setQuestions] = useState(items),
    [error, setError] = useState(''),
    [preview, setPreview] = useState(false);
  function change(s: Structure, q = questions) {
    setStructure(s);
    setQuestions(q);
    onDirty(true);
  }
  function question(index: number, item: Item) {
    change(
      structure,
      questions.map((q, i) => (i === index ? item : q)),
    );
  }
  function save() {
    const parsed = structureSchema.safeParse(structure);
    const valid = questions.every((q) => itemSchema.safeParse(q).success);
    if (!parsed.success || !valid) {
      setError('Check required image descriptions, question answers and table sizes.');
      return;
    }
    const issues = structureProblems(parsed.data, questions);
    if (issues.length) {
      setError(issues.join(' '));
      return;
    }
    setError('');
    onSave(parsed.data, questions);
  }
  return (
    <fieldset disabled={disabled} className="min-w-0 max-w-full space-y-5 rounded-xl border p-4">
      <legend className="max-w-full whitespace-normal font-semibold">
        Sections, passages and question content
      </legend>
      <p>
        Save these changes before continuing question review. Changing shared instructions or a
        passage clears review for its questions. Move questions before removing a section or
        passage.
      </p>
      {structure.sections.map((section, index) => (
        <section key={section.id} className="rounded border p-3 space-y-3">
          <label>
            Section title
            <input
              className={field}
              value={section.title}
              onChange={(e) =>
                change({
                  ...structure,
                  sections: structure.sections.map((s) =>
                    s.id === section.id ? { ...s, title: e.target.value } : s,
                  ),
                })
              }
            />
          </label>
          <label>
            Question type
            <select
              className={field}
              value={section.type}
              onChange={(e) =>
                change({
                  ...structure,
                  sections: structure.sections.map((s) =>
                    s.id === section.id
                      ? {
                          ...s,
                          type: e.target.value === 'true_false' ? 'true_false' : 'mcq_single',
                        }
                      : s,
                  ),
                })
              }
            >
              <option value="mcq_single">Multiple choice</option>
              <option value="true_false">True / false</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={section.shuffle}
              onChange={(e) =>
                change({
                  ...structure,
                  sections: structure.sections.map((s) =>
                    s.id === section.id ? { ...s, shuffle: e.target.checked } : s,
                  ),
                })
              }
            />{' '}
            Shuffle questions in this section when exam shuffling is enabled
          </label>
          <BlocksEditor
            value={section.blocks}
            onChange={(blocks) =>
              change({
                ...structure,
                sections: structure.sections.map((s) =>
                  s.id === section.id ? { ...s, blocks } : s,
                ),
              })
            }
          />
          <Button
            type="button"
            variant="outline"
            disabled={index === 0}
            onClick={() => {
              const sections = [...structure.sections];
              const previous = sections[index - 1];
              if (!previous) return;
              sections[index - 1] = section;
              sections[index] = previous;
              change({ ...structure, sections });
            }}
          >
            Move section up
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              questions.some((q) => q.sectionId === section.id) ||
              structure.passages.some((p) => p.sectionId === section.id)
            }
            onClick={() =>
              change({
                ...structure,
                sections: structure.sections.filter((s) => s.id !== section.id),
              })
            }
          >
            Remove empty section
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              change({
                ...structure,
                passages: [
                  ...structure.passages,
                  {
                    id: crypto.randomUUID(),
                    sectionId: section.id,
                    title: 'New passage',
                    blocks: [],
                  },
                ],
              })
            }
          >
            Add passage
          </Button>
          {structure.passages
            .filter((p) => p.sectionId === section.id)
            .map((p) => (
              <div key={p.id} className="border p-3 space-y-3">
                <label>
                  Passage title
                  <input
                    className={field}
                    value={p.title}
                    onChange={(e) =>
                      change({
                        ...structure,
                        passages: structure.passages.map((v) =>
                          v.id === p.id ? { ...v, title: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
                <p>
                  {questions.filter((q) => q.passageId === p.id).length} questions use this passage
                </p>
                <BlocksEditor
                  value={p.blocks}
                  onChange={(blocks) =>
                    change({
                      ...structure,
                      passages: structure.passages.map((v) =>
                        v.id === p.id ? { ...v, blocks } : v,
                      ),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={questions.some((q) => q.passageId === p.id)}
                  onClick={() =>
                    change({
                      ...structure,
                      passages: structure.passages.filter((v) => v.id !== p.id),
                    })
                  }
                >
                  Remove unused passage
                </Button>
              </div>
            ))}
        </section>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={structure.sections.length >= 40}
        onClick={() =>
          change({
            ...structure,
            sections: [
              ...structure.sections,
              {
                id: crypto.randomUUID(),
                title: 'New section',
                type: 'mcq_single',
                shuffle: true,
                blocks: [],
              },
            ],
          })
        }
      >
        Add section
      </Button>
      {questions.map((q, index) => (
        <details key={q.itemId} className="rounded border p-3">
          <summary className="min-h-11 cursor-pointer">
            Question {index + 1}: {q.stem.slice(0, 100)}
          </summary>
          <div className="space-y-3">
            <label>
              Section
              <select
                className={field}
                value={q.sectionId ?? ''}
                onChange={(e) =>
                  question(index, { ...q, sectionId: e.target.value || null, passageId: null })
                }
              >
                <option value="">Choose section</option>
                {structure.sections
                  .filter((s) => s.type === q.type)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Referenced passage
              <select
                className={field}
                value={q.passageId ?? ''}
                onChange={(e) => question(index, { ...q, passageId: e.target.value || null })}
              >
                <option value="">No passage</option>
                {structure.passages
                  .filter((p) => p.sectionId === q.sectionId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
              </select>
            </label>
            <BlocksEditor
              value={q.content ?? []}
              onChange={(content) => question(index, { ...q, content })}
            />
            <Button
              type="button"
              variant="outline"
              disabled={index === 0}
              onClick={() => {
                const next = [...questions];
                const previous = next[index - 1];
                if (!previous) return;
                next[index - 1] = q;
                next[index] = previous;
                change(structure, next);
              }}
            >
              Move question up
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (
                  window.confirm(
                    'Remove this question from this draft? Approved versions are preserved.',
                  )
                )
                  change(
                    structure,
                    questions.filter((i) => i.itemId !== q.itemId),
                  );
              }}
            >
              Remove question
            </Button>
          </div>
        </details>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={questions.length >= 200}
        onClick={() =>
          change(structure, [
            ...questions,
            {
              itemId: crypto.randomUUID(),
              externalId: 'Manual-' + crypto.randomUUID(),
              type: 'mcq_single',
              stem: 'New question — edit in question review after saving',
              options: [
                { id: 'a', text: 'Option A' },
                { id: 'b', text: 'Option B' },
              ],
              correctOptionId: 'a',
              marks: 1,
              primaryTopic: '',
              secondaryTopics: [],
              explanation: '',
              keyConsistent: null,
              reviewFlags: [],
              reviewed: false,
              reviewNote: '',
              sectionId: structure.sections.find((s) => s.type === 'mcq_single')?.id ?? null,
            },
          ])
        }
      >
        Add multiple-choice question
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={questions.length >= 200}
        onClick={() =>
          change(structure, [
            ...questions,
            {
              itemId: crypto.randomUUID(),
              externalId: 'Manual-' + crypto.randomUUID(),
              type: 'true_false',
              stem: 'New statement — edit in question review after saving',
              options: [
                { id: 'true', text: 'True' },
                { id: 'false', text: 'False' },
              ],
              correctOptionId: 'true',
              marks: 1,
              primaryTopic: '',
              secondaryTopics: [],
              explanation: '',
              keyConsistent: null,
              reviewFlags: [],
              reviewed: false,
              reviewNote: '',
              sectionId: structure.sections.find((s) => s.type === 'true_false')?.id ?? null,
            },
          ])
        }
      >
        Add true / false question
      </Button>
      <Button type="button" variant="outline" onClick={() => setPreview(!preview)}>
        Preview student content
      </Button>
      {preview &&
        questions.map((q) => (
          <section key={q.itemId} className="rounded border p-4">
            <QuestionContext structure={structure} item={q} />
            <p>{q.stem}</p>
            {q.options.map((o) => (
              <p key={o.id}>{o.text}</p>
            ))}
          </section>
        ))}
      {error && <p role="alert">{error}</p>}
      <Button type="button" onClick={save}>
        Save sections and content
      </Button>
    </fieldset>
  );
}
