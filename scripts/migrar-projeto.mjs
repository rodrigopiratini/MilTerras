// Copia os dados de um app de um projeto Supabase para outro (ex.: Mil Terras → easyapp-fabrica).
// Copia as tabelas de uma pasta (schema) e os logins de e-mail (com as senhas já usadas).
// Logins anônimos (código + PIN) não são copiados: no banco novo a pessoa digita o código e o PIN de novo.
//
// Uso:
//   node scripts/migrar-projeto.mjs --de <ref-origem> --para <ref-destino> [--schema public] [--executar]
//   Sem --executar, só mostra o que seria copiado (ensaio).
//   Antes, rode o instalar.sql do app no destino (cria as tabelas vazias).
//   Em dois tempos (quando a origem precisa ser pausada antes de criar o destino):
//     node scripts/migrar-projeto.mjs --de <ref> --para-arquivo foto.json            (fotografa a origem)
//     node scripts/migrar-projeto.mjs --de-arquivo foto.json --para <ref> --executar  (carrega no destino)
//   Sem acesso ao destino pela API: gere um .sql para colar no SQL Editor (depois do instalar.sql do app):
//     node scripts/migrar-projeto.mjs --de-arquivo foto.json --para-sql carga.sql
//   O arquivo contém senhas criptografadas e PINs: guarde fora do repositório e apague depois.
// Acesso: Management API do Supabase (api.supabase.com/v1/projects/<ref>/database/query) com o token em
// SUPABASE_ACCESS_TOKEN (Dashboard › Account › Access Tokens). Nunca grave o token em arquivo do repositório.
// Teste local: --local-de "<dsn>" --local-para "<dsn>" usa o psql no lugar da API.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (k, padrao) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : padrao; };
const tem = (k) => process.argv.includes('--' + k);
const DE = arg('de'), PARA = arg('para'), SCHEMA = arg('schema', 'public'), EXECUTAR = tem('executar');
const LOCAL_DE = arg('local-de'), LOCAL_PARA = arg('local-para'), PARA_ARQ = arg('para-arquivo'), DE_ARQ = arg('de-arquivo'), PARA_SQL = arg('para-sql');
if (!(DE || LOCAL_DE || DE_ARQ) || !(PARA || LOCAL_PARA || PARA_ARQ || PARA_SQL)) { console.error('Informe a origem (--de, --local-de ou --de-arquivo) e o destino (--para, --local-para ou --para-arquivo)'); process.exit(1); }
if (!/^[a-z_][a-z0-9_]*$/.test(SCHEMA)) throw new Error('schema inválido');

async function sql(alvo, local, query) {
  if (local) {
    const out = execFileSync('psql', [local, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: `select coalesce(json_agg(x), '[]') from (${query}) x`, encoding: 'utf8', maxBuffer: 1 << 28 });
    return JSON.parse(out.trim() || '[]');
  }
  // curl (e não fetch): respeita o proxy HTTPS do ambiente, quando houver
  const args = ['-sS', '-X', 'POST', `https://api.supabase.com/v1/projects/${alvo}/database/query`, '-H', `Authorization: Bearer ${process.env.SUPABASE_ACCESS_TOKEN || 'x'}`,
    '-H', 'Content-Type: application/json', '--data-binary', '@-', '-w', '\n%{http_code}'];
  const saida = execFileSync('curl', args, { input: JSON.stringify({ query }), encoding: 'utf8', maxBuffer: 1 << 28 });
  const i = saida.lastIndexOf('\n'); const t = saida.slice(0, i), status = +saida.slice(i + 1);
  if (status < 200 || status >= 300) throw new Error(`${alvo}: ${status} ${t.slice(0, 500)}`);
  return JSON.parse(t || '[]');
}
async function exec(alvo, local, query) {
  if (local) { execFileSync('psql', [local, '-X', '-q', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', maxBuffer: 1 << 28 }); return; }
  await sql(alvo, null, query);
}
const lerDe = (q) => sql(DE, LOCAL_DE, q);
const lerPara = (q) => sql(PARA, LOCAL_PARA, q);
const gravarPara = (q) => exec(PARA, LOCAL_PARA, q);
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const id = (n) => `"${String(n).replace(/"/g, '""')}"`;

// Colunas que podem ser gravadas (sem colunas geradas) e se há coluna identity "always"
async function colunas(schema, tabela) {
  const cs = await lerPara(`select column_name c, is_generated g, identity_generation i from information_schema.columns where table_schema = ${lit(schema)} and table_name = ${lit(tabela)} order by ordinal_position`);
  return { gravaveis: cs.filter((x) => x.g === 'NEVER').map((x) => x.c), identity: cs.some((x) => x.i === 'ALWAYS') };
}
// Ordem respeitando as chaves estrangeiras (pais antes dos filhos)
async function ordemTabelas(schema) {
  const ts = (await lerDe(`select tablename t from pg_tables where schemaname = ${lit(schema)} order by 1`)).map((x) => x.t);
  const fks = await lerDe(`select tc.table_name filho, ccu.table_name pai from information_schema.table_constraints tc join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = ${lit(schema)} and ccu.table_schema = ${lit(schema)}`);
  const out = [], visto = new Set();
  const visitar = (t, pilha = new Set()) => { if (visto.has(t) || pilha.has(t)) return; pilha.add(t); for (const f of fks.filter((x) => x.filho === t && x.pai !== t)) visitar(f.pai, pilha); visto.add(t); out.push(t); };
  ts.forEach((t) => visitar(t));
  return out;
}

async function copiarTabela(schema, tabela, filtro = 'true') {
  const destino = await lerPara(`select 1 from information_schema.tables where table_schema = ${lit(schema)} and table_name = ${lit(tabela)}`);
  if (!destino.length) { console.log(`  · ${schema}.${tabela}: não existe no destino (pulada)`); return 0; }
  const { gravaveis, identity } = await colunas(schema, tabela);
  const linhas = FOTO ? (FOTO.tabelas[`${schema}.${tabela}`] || []).map((r) => Object.fromEntries(gravaveis.filter((c) => c in r).map((c) => [c, r[c]])))
    : await lerDe(`select ${gravaveis.map(id).join(', ')} from ${id(schema)}.${id(tabela)} where ${filtro}`);
  console.log(`  · ${schema}.${tabela}: ${linhas.length} linha(s)`);
  if (!EXECUTAR || !linhas.length) return linhas.length;
  const cols = gravaveis.map(id).join(', ');
  for (let i = 0; i < linhas.length; i += 500) {
    const json = lit(JSON.stringify(linhas.slice(i, i + 500)));
    await gravarPara(`insert into ${id(schema)}.${id(tabela)} (${cols}) ${identity ? 'overriding system value' : ''}
      select ${cols} from jsonb_populate_recordset(null::${id(schema)}.${id(tabela)}, ${json}::jsonb) on conflict do nothing`);
  }
  return linhas.length;
}

// ---------- Modo fotografia: grava a origem num arquivo e termina ----------
if (PARA_ARQ) {
  const foto = { schema: SCHEMA, origem: DE || 'local', em: new Date().toISOString(), tabelas: {} };
  const tudo = async (schema, tabela, filtro = 'true') => {
    const cs = (await lerDe(`select column_name c from information_schema.columns where table_schema = ${lit(schema)} and table_name = ${lit(tabela)} and is_generated = 'NEVER' order by ordinal_position`)).map((x) => x.c);
    foto.tabelas[`${schema}.${tabela}`] = await lerDe(`select ${cs.map(id).join(', ')} from ${id(schema)}.${id(tabela)} where ${filtro}`);
    console.log(`  · ${schema}.${tabela}: ${foto.tabelas[`${schema}.${tabela}`].length} linha(s)`);
  };
  const fu = `not coalesce(is_anonymous, false) and id in (select user_id from ${id(SCHEMA)}.perfis)`;
  console.log(`FOTOGRAFANDO ${DE || 'local'} · pasta ${SCHEMA} → ${PARA_ARQ}`);
  await tudo('auth', 'users', fu);
  await tudo('auth', 'identities', `user_id in (select id from auth.users where ${fu})`);
  foto.ordem = await ordemTabelas(SCHEMA);
  for (const t of foto.ordem) await tudo(SCHEMA, t, t === 'perfis' ? 'user_id in (select id from auth.users where not coalesce(is_anonymous, false))' : t === 'tentativas_login' ? 'false' : 'true');
  writeFileSync(PARA_ARQ, JSON.stringify(foto));
  console.log('Fotografia salva.'); process.exit(0);
}
const FOTO = DE_ARQ ? JSON.parse(readFileSync(DE_ARQ, 'utf8')) : null;
if (FOTO && FOTO.schema !== SCHEMA) { console.error(`A fotografia é da pasta ${FOTO.schema}; use --schema ${FOTO.schema}`); process.exit(1); }

// ---------- Modo SQL: transforma a fotografia num script para colar no SQL Editor ----------
if (PARA_SQL) {
  if (!FOTO) { console.error('--para-sql precisa de --de-arquivo'); process.exit(1); }
  const S = id(FOTO.schema);
  const ins = (chave, linhas) => {
    if (!linhas?.length) return '';
    const [sc, tb] = chave.split('.');
    const cols = Object.keys(linhas[0]).map(id).join(', ');
    return `insert into ${id(sc)}.${id(tb)} (${cols}) overriding system value\n  select ${cols} from jsonb_populate_recordset(null::${id(sc)}.${id(tb)}, ${lit(JSON.stringify(linhas))}::jsonb) on conflict do nothing;\n`;
  };
  const partes = [
    `-- Carga dos dados de ${FOTO.origem} (fotografia de ${FOTO.em}) na pasta ${FOTO.schema}.`,
    '-- Rode DEPOIS do instalar.sql do app, num projeto onde ninguém usa o app ainda. Contém senhas criptografadas: apague o arquivo depois.',
    'begin;',
    `do $$ begin if exists (select 1 from ${S}.perfis) then raise exception 'O destino já tem perfis: carga cancelada para não misturar dados'; end if; end $$;`,
    ins('auth.users', FOTO.tabelas['auth.users']), ins('auth.identities', FOTO.tabelas['auth.identities']),
    ...FOTO.ordem.map((t) => `alter table ${S}.${id(t)} disable trigger user;`),
    ...[...FOTO.ordem].reverse().map((t) => `delete from ${S}.${id(t)};`),
    ...FOTO.ordem.map((t) => ins(`${FOTO.schema}.${t}`, FOTO.tabelas[`${FOTO.schema}.${t}`])),
    ...FOTO.ordem.map((t) => `alter table ${S}.${id(t)} enable trigger user;`),
    `do $$ declare r record; begin for r in select c.relname t, a.attname col, pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) s from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = ${lit(FOTO.schema)} and a.attnum > 0 and (a.attidentity <> '' or pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) is not null) loop
       if r.s is not null then execute format('select setval(%L, greatest(1, (select coalesce(max(%I), 0) from ${FOTO.schema}.%I)))', r.s, r.col, r.t); end if; end loop; end $$;`,
    'commit;',
    `select ${FOTO.ordem.filter((t) => FOTO.tabelas[`${FOTO.schema}.${t}`]?.length).map((t) => `(select count(*) from ${S}.${id(t)}) ${id(t)}`).join(', ')}, (select count(*) from auth.users where id in (select user_id from ${S}.perfis)) logins;`,
  ];
  writeFileSync(PARA_SQL, partes.filter(Boolean).join('\n'));
  console.log('Script de carga gerado:', PARA_SQL); process.exit(0);
}

console.log(`${EXECUTAR ? 'MIGRANDO' : 'ENSAIO (nada é gravado; use --executar)'}: ${DE_ARQ || DE || 'local'} → ${PARA || 'local'} · pasta ${SCHEMA}`);
// 0. confere o destino antes de qualquer gravação
{ const n = await lerPara(`select count(*)::int n from information_schema.tables where table_schema = ${lit(SCHEMA)} and table_name = 'perfis'`); if (!n[0]?.n) { console.error('Rode antes o instalar.sql do app no destino.'); process.exit(1); } }
// 1. logins de e-mail (as senhas vão junto, criptografadas como estão)
const filtroUsuarios = `not coalesce(is_anonymous, false) and id in (select user_id from ${id(SCHEMA)}.perfis)`;
console.log('Logins:');
await copiarTabela('auth', 'users', filtroUsuarios);
await copiarTabela('auth', 'identities', `user_id in (select id from auth.users where ${filtroUsuarios})`);
// 2. tabelas do app, sem disparar os gatilhos (o registro de atividades já vem copiado)
const tabelas = FOTO ? FOTO.ordem : await ordemTabelas(SCHEMA);
// o destino precisa estar recém-instalado (sem ninguém usando): o que o instalar.sql gravou é substituído pelo da origem
const emUso = await lerPara(`select count(*)::int n from ${id(SCHEMA)}.perfis`).catch(() => [{ n: 0 }]);
if (emUso[0]?.n > 0) { console.error(`O destino já tem ${emUso[0].n} perfil(is) em ${SCHEMA}.perfis: migração cancelada para não misturar dados.`); process.exit(1); }
if (EXECUTAR) {
  for (const t of tabelas) await gravarPara(`alter table ${id(SCHEMA)}.${id(t)} disable trigger user`);
  for (const t of [...tabelas].reverse()) if ((await lerPara(`select 1 from information_schema.tables where table_schema = ${lit(SCHEMA)} and table_name = ${lit(t)}`)).length) await gravarPara(`delete from ${id(SCHEMA)}.${id(t)}`);
}
console.log('Tabelas:');
try {
  for (const t of tabelas) {
    // perfis de usuários anônimos não vão (o login anônimo não existe no banco novo)
    const filtro = t === 'perfis' ? `user_id in (select id from auth.users where not coalesce(is_anonymous, false))` : t === 'tentativas_login' ? 'false' : 'true';
    await copiarTabela(SCHEMA, t, filtro);
  }
} finally {
  if (EXECUTAR) for (const t of tabelas) await gravarPara(`alter table ${id(SCHEMA)}.${id(t)} enable trigger user`);
}
// 3. contadores identity (ex.: registro de atividades) continuam de onde pararam
if (EXECUTAR) for (const t of tabelas) {
  const seqs = await lerPara(`select column_name c, pg_get_serial_sequence(${lit(SCHEMA + '.' + t)}, column_name) s from information_schema.columns where table_schema = ${lit(SCHEMA)} and table_name = ${lit(t)} and (is_identity = 'YES' or column_default like 'nextval%')`);
  for (const { c, s } of seqs) if (s) await gravarPara(`select setval(${lit(s)}, greatest(1, (select coalesce(max(${id(c)}), 0) from ${id(SCHEMA)}.${id(t)})))`);
}
console.log(EXECUTAR ? 'Pronto.' : 'Ensaio concluído.');
