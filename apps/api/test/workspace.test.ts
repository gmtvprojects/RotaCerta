import { createSeed } from '@rotacerta/domain';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { loadWorkspace } from '../src/db/workspace';
import { readWorkspace } from '../src/db/unit-of-work';
import { createCompanyWithSchema, withTenant } from '../src/db/tenants';
import { COMPANY_ID, closeTestDbs, createTestDb } from './helpers';

afterAll(closeTestDbs);

describe('persistência do domínio', () => {
  it('o que sai do banco é idêntico ao seed do domínio', async () => {
    const db = await createTestDb();
    const { data, papers } = await readWorkspace(db, COMPANY_ID);
    expect(papers).toEqual([]);
    expect(data).toEqual(createSeed());
  });
});

describe('isolamento por empresa (banco)', () => {
  it('uma empresa nova nasce vazia e não enxerga os dados da outra', async () => {
    const db = await createTestDb();
    const other = await createCompanyWithSchema(db, 'Outra empresa');
    expect(other.id).not.toBe(COMPANY_ID);
    const empty = await readWorkspace(db, other.id);
    expect(empty.data.orders).toEqual([]);
    expect(empty.data.vehicles).toEqual([]);
    expect(empty.data.zones).toEqual([]);
    // a empresa de demonstração continua com os dados dela
    expect((await readWorkspace(db, COMPANY_ID)).data.orders.length).toBeGreaterThan(0);
  });

  it('ler a operação sem escolher a empresa falha em vez de devolver dados', async () => {
    const db = await createTestDb();
    await expect(loadWorkspace(db)).rejects.toThrow();
  });

  it('cada empresa tem a sua numeração de entregas e veículos', async () => {
    const db = await createTestDb();
    const other = await createCompanyWithSchema(db, 'Outra empresa');
    await withTenant(db, other.id, async (tx) => {
      await tx.execute(sql`insert into vehicles (id, name, plate, capacity) values (1, 'Van', 'AAA0A00', 10)`);
    });
    // o id 1 já existe na empresa de demonstração e nada colide
    const mine = await readWorkspace(db, COMPANY_ID);
    const theirs = await readWorkspace(db, other.id);
    expect(mine.data.vehicles.some((v) => v.id === 1)).toBe(true);
    expect(theirs.data.vehicles).toHaveLength(1);
    expect(theirs.data.vehicles[0].name).toBe('Van');
  });

  it('rejeita id de empresa inválido (nada de montar nome de schema com texto livre)', async () => {
    const db = await createTestDb();
    await expect(readWorkspace(db, 0)).rejects.toThrow('Empresa inválida');
    await expect(readWorkspace(db, Number.NaN)).rejects.toThrow('Empresa inválida');
  });
});
