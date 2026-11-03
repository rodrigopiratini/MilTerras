// Gera supabase/instalar.sql: o arquivo único que se cola no SQL Editor do Supabase.
//   base.sql (comum a todos os segmentos) + regras das coleções (src/js/segmento.js) + segmento.sql
// Uso: node supabase/gerar.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { SEGMENTO } from '../src/js/segmento.js';

const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const arr = (a) => `array[${(a || []).map(q).join(', ')}]::text[]`;
const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
// Cada segmento fica na sua pasta (schema) do banco: vários apps convivem no mesmo projeto Supabase.
const SCHEMA = SEGMENTO.schema || 'public';
if (!/^[a-z][a-z0-9_]*$/.test(SCHEMA)) throw new Error('segmento.schema inválido: ' + SCHEMA);
const naPasta = (sql) => SCHEMA === 'public' ? sql : sql
  .replace(/\bpublic\./g, SCHEMA + '.')
  .replace(/search_path = public\b/g, `search_path = ${SCHEMA}, public, extensions`)
  .replace(/schemaname = 'public'/g, `schemaname = '${SCHEMA}'`);

const colecoes = Object.entries(SEGMENTO.colecoes).map(([nome, c]) =>
  `insert into ${SCHEMA}.colecoes (nome, leitura, escrita, campo_ref, protegidos, trava) values (${q(nome)}, ${q(c.leitura || 'gestao')}, ${q(c.escrita || 'gestao')}, ${q(c.ref)}, ${arr(c.protegidos)}, ${q(c.trava)})
  on conflict (nome) do update set leitura = excluded.leitura, escrita = excluded.escrita, campo_ref = excluded.campo_ref, protegidos = excluded.protegidos, trava = excluded.trava;`);
const admins = (SEGMENTO.plataforma?.admins || []).map((e) => `insert into ${SCHEMA}.plataforma_admins (email) values (${q(e.toLowerCase())}) on conflict do nothing;`);

const out = [
  `-- ${SEGMENTO.nome} — instalação do banco no Supabase (gerado por supabase/gerar.mjs; não edite à mão)`,
  '-- Como usar: Supabase › SQL Editor › New query › cole este arquivo inteiro › Run. Pode rodar de novo sem perder dados.',
  `-- Pasta (schema) deste app: ${SCHEMA}. Depois de rodar, inclua "${SCHEMA}" em Project Settings › Data API › Exposed schemas.`,
  '',
  SCHEMA === 'public' ? '' : `create schema if not exists ${SCHEMA};\ngrant usage on schema ${SCHEMA} to anon, authenticated, service_role;\n`,
  naPasta(ler('./base.sql')),
  '-- ---------- Coleções do segmento (src/js/segmento.js) ----------',
  ...colecoes,
  '',
  '-- ---------- Período de teste das empresas novas (segmento.js › diasTeste) ----------',
  `alter table ${SCHEMA}.empresas alter column teste_ate set default (current_date + ${Math.max(1, Math.round(+SEGMENTO.diasTeste || 30))});`,
  '',
  '-- ---------- Administradores da plataforma ----------',
  ...admins,
  '',
  '-- ---------- Regras específicas do segmento (supabase/segmento.sql) ----------',
  naPasta(ler('./segmento.sql')),
  '',
  "select 'Instalação concluída' as resultado;",
].join('\n');
writeFileSync(new URL('./instalar.sql', import.meta.url), out);
console.log('supabase/instalar.sql gerado:', out.length, 'bytes · pasta (schema):', SCHEMA);
