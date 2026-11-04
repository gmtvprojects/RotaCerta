import { createSeed } from '@rotacerta/domain';
import { describe, expect, it } from 'vitest';
import { loadWorkspace } from '../src/db/workspace';
import { createTestDb } from './helpers';

describe('persistência do domínio', () => {
  it('o que sai do banco é idêntico ao seed do domínio', async () => {
    const db = await createTestDb();
    const { data, papers } = await loadWorkspace(db);
    expect(papers).toEqual([]);
    expect(data).toEqual(createSeed());
  });
});
