import type { ContentBlock, Structure } from './schema';
export function Content({ blocks = [] }: { blocks?: ContentBlock[] }) {
  return (
    <div className="exam-question-text space-y-3">
      {blocks.map((block) => (
        <div key={block.id}>
          {block.kind === 'text' && <p className="whitespace-pre-wrap break-words">{block.text}</p>}
          {block.kind === 'image' && (
            <figure>
              <img className="h-auto max-w-full" src={block.data} alt={block.alt} />
              {block.caption && <figcaption>{block.caption}</figcaption>}
            </figure>
          )}
          {block.kind === 'table' && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {block.headers.map((h, i) => (
                      <th className="border p-2 text-left" scope="col" key={i}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td className="border p-2" key={c}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
export function QuestionContext({
  structure,
  item,
}: {
  structure?: Structure;
  item: { sectionId?: string | null; passageId?: string | null; content?: ContentBlock[] };
}) {
  const section = structure?.sections.find((s) => s.id === item.sectionId),
    passage = structure?.passages.find((p) => p.id === item.passageId);
  return (
    <div className="space-y-4">
      {section && (
        <section aria-label="Section instructions">
          <h3 className="font-semibold">{section.title}</h3>
          <Content blocks={section.blocks} />
        </section>
      )}
      {passage && (
        <section aria-label="Referenced passage" className="rounded border bg-muted p-3">
          <h3 className="font-semibold">{passage.title}</h3>
          <Content blocks={passage.blocks} />
        </section>
      )}
      <Content blocks={item.content} />
    </div>
  );
}
