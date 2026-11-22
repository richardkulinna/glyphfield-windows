import { useState } from 'react';
import type { BookPageDefinition, BookSection } from '@/lib/brandBookModel';
import StudioSelect from './ui/StudioSelect';
import styles from './BrandBook.module.css';

export type ArchivedBookEntry = { id: string; group: string; title: string; kind: 'page' | 'section' };

export function BookStructureControls({ sections, templates, currentSection, archived, onCreate, onRestore }: {
  sections: BookSection[];
  templates: BookPageDefinition[];
  currentSection: string;
  archived: ArchivedBookEntry[];
  onCreate: (mode: 'section' | 'page', name: string, group: string, template: string) => void;
  onRestore: (entry: ArchivedBookEntry) => void;
}) {
  const [mode, setMode] = useState<'page' | 'section' | 'restore' | null>(null);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('blank');
  const [group, setGroup] = useState(currentSection);
  function open(next: typeof mode) {
    setMode(mode === next ? null : next);
    setGroup(currentSection);
    setTemplate('blank');
    setName('');
  }
  const suggested = templates.find(page => page.id === template)?.title ?? 'Untitled page';
  const title = name.trim() || (mode === 'section' ? '' : suggested);
  return (
    <div className={styles.structureControls}>
      <div className={styles.editorActions}>
        <button type="button" aria-expanded={mode === 'page'} onClick={() => open('page')}>Add page</button>
        <button type="button" aria-expanded={mode === 'section'} onClick={() => open('section')}>Add section</button>
        {archived.length > 0 && <button type="button" aria-expanded={mode === 'restore'} onClick={() => open('restore')}>Restore ({archived.length})</button>}
      </div>
      {mode === 'restore' ? (
        <ul className={styles.restoreList}>
          {archived.map(entry => (
            <li key={entry.kind + entry.id}><button type="button" onClick={() => { onRestore(entry); setMode(null); }}>
              <span>{entry.title}</span><small>Restore {entry.kind}</small>
            </button></li>
          ))}
        </ul>
      ) : mode && (
        <form className={styles.layoutInspector} onSubmit={event => {
          event.preventDefault();
          if (title) { onCreate(mode, title, group, template); setMode(null); }
        }}>
          {mode === 'page' && <>
            <label>Page template
              <StudioSelect ariaLabel="Page template" value={template} onValueChange={setTemplate}
                options={[{ label: 'Blank page', value: 'blank' }, ...templates.map(page => ({ label: page.title, value: page.id }))]}/>
            </label>
            <label>Section
              <StudioSelect ariaLabel="New page section" value={group} onValueChange={setGroup}
                options={sections.map(section => ({ label: section.name, value: section.id }))}/>
            </label>
          </>}
          <label>{mode === 'section' ? 'Section title' : 'Page title'}
            <input aria-label={mode === 'section' ? 'Section title' : 'Page title'} placeholder={mode === 'page' ? suggested : ''} value={name} maxLength={200} required={mode === 'section'} onChange={event => setName(event.target.value)}/>
          </label>
          <div className={styles.editorActions}>
            <button type="submit" disabled={!title}>Create {mode}</button>
            <button type="button" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
