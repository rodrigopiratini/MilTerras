// Gera supabase/instalar.sql (arquivo único para colar no SQL Editor do Supabase)
// Uso: node supabase/gerar.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { PRODUTOS } from '../src/js/core/catalogo.js';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const linhas = [];
for (const p of PRODUTOS) {
  const { custo, ...data } = p;
  linhas.push(`insert into public.produtos (id, data) values (${q(p.id)}, ${q(JSON.stringify(data))}::jsonb) on conflict (id) do nothing;`);
  linhas.push(`insert into public.custos (id, custo) values (${q(p.id)}, ${custo}) on conflict (id) do nothing;`);
}
const config = { empresa: 'Mil Terras', whatsapp: '5554991165105', instagram: '@milterrasvinhos' };
linhas.push(`insert into public.config (id, data) values ('geral', ${q(JSON.stringify(config))}::jsonb) on conflict (id) do nothing;`);

const base = readFileSync(new URL('./setup.sql', import.meta.url), 'utf8');
const out = base.replace('\\ir catalogo.sql', linhas.join('\n'));
writeFileSync(new URL('./instalar.sql', import.meta.url), out);
console.log('supabase/instalar.sql gerado:', out.length, 'bytes');
