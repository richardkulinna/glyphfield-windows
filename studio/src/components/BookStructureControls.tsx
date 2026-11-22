import { useState } from 'react';
import type { BookPageDefinition, BookSection } from '@/lib/brandBookModel';
import StudioSelect from './ui/StudioSelect';
import styles from './BrandBook.module.css';

export function BookStructureControls({
  sections,
  templates,
  currentSection,
  onCreate,
  onUndo,
}: {
  sections: BookSection[];
  templates: BookPageDefinition[];
  currentSection: string;
  onCreate: (mode: 'section' | 'page', name: string, group: string, template: string) => void;
  onUndo?: () => void;
}) {
  const [mode, setMode] = useState<'section' | 'page' | null>(null);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('blank');
  const [group, setGroup] = useState(currentSection);
  function start(next: 'section' | 'page') {
    setMode(next);
    setName('');
    setGroup(currentSection);
    setTemplate('blank');
  }
  return (
    <div className={styles.structureControls}>
      <div className={styles.editorActions}>
        <button type='button' onClick={() => start('section')}>
          + Section
        </button>
        <button type='button' onClick={() => start('page')}>
          + Page
        </button>
        {onUndo && (
          <button type='button' onClick={onUndo}>
            Undo removal
          </button>
        )}
      </div>
      {mode && (
        <form
          className={styles.layoutInspector}
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) {
              onCreate(mode, name.trim(), group, template);
              setMode(null);
            }
          }}
        >
          <label>
            {mode === 'section' ? 'Section title' : 'Page title'}
            <input autoFocus required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {mode === 'page' && (
            <>
              <label>
                Section
                <StudioSelect
                  ariaLabel='New page section'
                  value={group}
                  onValueChange={setGroup}
                  options={sections.map((s) => ({ label: s.name, value: s.id }))}
                />
              </label>
              <label>
                Start from
                <StudioSelect
                  ariaLabel='Page template'
                  value={template}
                  onValueChange={setTemplate}
                  options={[
                    { label: 'Blank page', value: 'blank' },
                    ...templates.map((p) => ({ label: p.title, value: p.id })),
                  ]}
                />
              </label>
            </>
          )}
          <div className={styles.editorActions}>
            <button type='submit' disabled={!name.trim()}>
              Add {mode}
            </button>
            <button type='button' onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
