'use client';

import { createContext } from 'react';
import type { BrandColor } from '@/lib/brandIdentity';

/** Each mounted workspace owns its palette, including its unsaved edits. */
export const BrandPaletteContext = createContext<readonly BrandColor[]>([]);
