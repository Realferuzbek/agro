import { describe, expect, it } from 'vitest';
import { copy } from '@/config/copy';
import { accessCopy, authCopy } from '@/config/access-copy';
import { translations } from '@/config/translations';

function missingPaths(reference: Record<string, unknown>, translated: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(reference).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!(key in translated)) return [path];
    return value !== null && typeof value === 'object' ? missingPaths(value as Record<string, unknown>, translated[key] as Record<string, unknown>, path) : [];
  });
}

describe('interface translations', () => {
  for (const locale of ['uz', 'ru'] as const) it(`${locale} covers all user interface messages`, () => {
    const bundle = translations[locale];
    expect(missingPaths(copy, bundle.copy)).toEqual([]);
    expect(missingPaths(accessCopy, bundle.access)).toEqual([]);
    expect(missingPaths(authCopy, bundle.auth)).toEqual([]);
  });
});
