// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { ListField, TagsField } from '../BrandIdentityFields';

it('retains separators and trailing spaces during typing while the project receives complete values', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  function Editor() {
    const [lines, setLines] = useState<string[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    return <><ListField label="Rules" values={lines} onChange={setLines} />
      <TagsField label="Tags" values={tags} onChange={setTags} />
      <output>{JSON.stringify({ lines, tags })}</output></>;
  }
  try {
    await act(() => root.render(<Editor />));
    const list = host.querySelector('textarea')!;
    const tags = host.querySelector('input')!;
    async function type(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
      await act(() => {
        field.focus();
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')!.set!.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    for (const value of ['Upper ', 'Upper third', 'Upper third\n', 'Upper third\nLeft aligned']) {
      await type(list, value);
      expect(list.value).toBe(value);
    }
    await type(tags, 'green, ');
    expect(tags.value).toBe('green, ');
    await type(tags, 'green, swirl');
    expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual({ lines: ['Upper third', 'Left aligned'], tags: ['green', 'swirl'] });
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
