/**
 * Dois conjuntos de tabelas:
 * - plataforma (`schema-platform.ts`): schema `public`, compartilhado (empresas, usuários, sessões, auditoria);
 * - empresa (`schema-tenant.ts`): uma cópia por empresa, em `tenant_<id>`.
 */
export * from './schema-platform';
export * from './schema-tenant';
