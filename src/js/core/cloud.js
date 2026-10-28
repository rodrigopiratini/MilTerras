// Adaptador Supabase: carrega os documentos permitidos ao usuário (RLS), grava as alterações
// feitas pelo app (diferença antes/depois de cada commit) e recebe mudanças em tempo real.
// Gravações passam por uma fila persistente: se a internet cair, são reenviadas depois.

import { CONFIG } from '../config.js';

const TABELAS = ['produtos', 'clientes', 'movs', 'vendas', 'fechamentos', 'despesas'];
const PAGINA = 1000;

export function criarNuvem(app, hooks) {
  const sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    auth: { storageKey: `mt-auth-${app}`, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const OUTBOX = `mt-outbox-${app}`;
  let state = null;
  let perfil = null;
  let snap = {};
  let canal = null;
  let enviando = false;
  let fila = lerFila();
  let status = 'online';
  const ehGestor = () => perfil?.papel === 'gestor' || perfil?.papel === 'dono';

  function lerFila() { try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]'); } catch { return []; } }
  function salvarFila() { try { localStorage.setItem(OUTBOX, JSON.stringify(fila)); } catch {} }
  const setStatus = (s) => { if (s !== status) { status = s; hooks.onStatus?.(s, fila.length); } };

  async function buscarTudo(tabela, colunas = 'id,data') {
    const out = [];
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await sb.from(tabela).select(colunas).order('id').range(de, de + PAGINA - 1);
      if (error) throw error;
      out.push(...data);
      if (data.length < PAGINA) return out;
    }
  }

  function fotografar() {
    snap = { meta: JSON.stringify(state.meta) };
    for (const t of TABELAS) snap[t] = new Map(state[t].map((x) => [x.id, JSON.stringify(x)]));
  }

  async function carregar() {
    const gestor = ehGestor();
    const [cfg, ...docs] = await Promise.all([buscarTudo('config'), ...TABELAS.map((t) => (t === 'despesas' && !gestor ? [] : buscarTudo(t)))]);
    const custos = gestor ? Object.fromEntries((await buscarTudo('custos', 'id,custo')).map((r) => [r.id, +r.custo])) : {};
    state = { meta: { ...(cfg.find((r) => r.id === 'geral')?.data || {}), demo: false } };
    TABELAS.forEach((t, i) => { state[t] = docs[i].map((r) => r.data); });
    for (const p of state.produtos) if (gestor) p.custo = custos[p.id] ?? p.custo ?? 0; else delete p.custo;
    // documentos pendentes na fila (ainda não enviados) prevalecem sobre o servidor
    for (const op of fila) aplicarLocal(op);
    fotografar();
    return state;
  }

  function aplicarLocal(op) {
    if (op.tabela === 'config') { state.meta = { ...state.meta, ...op.data }; return; }
    if (op.tabela === 'custos') { const p = state.produtos.find((x) => x.id === op.id); if (p) p.custo = op.custo; return; }
    const arr = state[op.tabela];
    const i = arr.findIndex((x) => x.id === op.id);
    if (op.op === 'delete') { if (i >= 0) arr.splice(i, 1); return; }
    const doc = op.tabela === 'produtos' && i >= 0 ? { ...op.data, custo: arr[i].custo } : op.data;
    if (i >= 0) arr[i] = doc; else arr.push(doc);
  }

  // Compara o estado com a última fotografia e enfileira o que mudou
  function registrarMudancas() {
    const ops = [];
    for (const t of TABELAS) {
      const atual = new Map(state[t].map((x) => [x.id, x]));
      for (const [id, doc] of atual) {
        const j = JSON.stringify(doc);
        const antes = snap[t].get(id);
        if (antes === j) continue;
        let data = doc;
        if (t === 'produtos') {
          const { custo, ...resto } = doc;
          data = resto;
          const antigo = antes ? JSON.parse(antes) : {};
          if (ehGestor() && custo !== antigo.custo) ops.push({ tabela: 'custos', op: 'upsert', id, custo: +custo || 0 });
          if (antes && JSON.stringify(resto) === JSON.stringify((({ custo: _, ...r }) => r)(antigo))) continue;
        }
        ops.push({ tabela: t, op: antes ? 'update' : 'insert', id, data });
      }
      for (const id of snap[t].keys()) if (!atual.has(id)) ops.push({ tabela: t, op: 'delete', id });
    }
    const metaJ = JSON.stringify(state.meta);
    if (metaJ !== snap.meta && ehGestor()) { const { demo, ...data } = state.meta; ops.push({ tabela: 'config', op: 'upsert', id: 'geral', data }); }
    // custos precisam do produto já gravado
    ops.sort((a, b) => (a.tabela === 'custos') - (b.tabela === 'custos'));
    fotografar();
    if (ops.length) { fila.push(...ops); salvarFila(); enviar(); }
  }

  async function executar(op) {
    const q = sb.from(op.tabela);
    if (op.tabela === 'custos') return q.upsert({ id: op.id, custo: op.custo });
    if (op.tabela === 'config') return q.upsert({ id: op.id, data: op.data });
    if (op.op === 'insert') {
      const r = await q.insert({ id: op.id, data: op.data });
      if (r.error?.code === '23505') return q.update({ data: op.data }).eq('id', op.id); // já existia (reenvio)
      return r;
    }
    if (op.op === 'update') return q.update({ data: op.data }).eq('id', op.id);
    return q.delete().eq('id', op.id);
  }

  async function enviar() {
    if (enviando || !fila.length) { if (!fila.length) setStatus('online'); return; }
    enviando = true;
    setStatus('enviando');
    try {
      while (fila.length) {
        // agrupa inserções seguidas da mesma tabela num único envio
        const op = fila[0];
        let lote = [op];
        if (op.op === 'insert' && op.tabela !== 'custos' && op.tabela !== 'config') {
          lote = [];
          for (const x of fila) { if (x.op !== 'insert' || x.tabela !== op.tabela || lote.length >= 200) break; lote.push(x); }
        }
        let r;
        try {
          if (lote.length > 1) {
            r = await sb.from(op.tabela).insert(lote.map((x) => ({ id: x.id, data: x.data })));
            if (r.error?.code === '23505') { for (const x of lote) { r = await executar(x); if (r.error) break; } }
          } else r = await executar(op);
        } catch (e) { r = { error: { rede: true, message: e.message } }; }
        if (r.error) {
          const rede = r.error.rede || !r.error.code || /fetch|network|Failed/i.test(r.error.message || '');
          if (rede) { setStatus('offline'); setTimeout(() => { enviando = false; enviar(); }, 15000); return; }
          // recusado pelo servidor (permissão/regra): descarta e recarrega a verdade do servidor
          console.warn('Gravação recusada', op, r.error);
          fila.splice(0, lote.length); salvarFila();
          hooks.onErro?.(r.error.message || 'Operação recusada pelo servidor');
          await carregar();
          hooks.onChange?.('recarregado', true);
          continue;
        }
        fila.splice(0, lote.length); salvarFila();
      }
      setStatus('online');
    } finally { enviando = false; }
  }
  window.addEventListener('online', () => enviar());
  sb.auth.onAuthStateChange((evento) => { if (evento === 'PASSWORD_RECOVERY') setTimeout(() => hooks.onRecuperacao?.(), 300); });

  function ouvir() {
    canal?.unsubscribe();
    canal = sb.channel('mt-' + app);
    for (const t of [...TABELAS, 'config']) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => {
        if (!state) return;
        if (t === 'config') { if (p.new?.data) { state.meta = { ...state.meta, ...p.new.data }; snap.meta = JSON.stringify(state.meta); hooks.onChange?.('config', true); } return; }
        const id = p.new?.id || p.old?.id;
        if (fila.some((op) => op.tabela === t && op.id === id)) return; // alteração local ainda pendente
        const arr = state[t];
        const i = arr.findIndex((x) => x.id === id);
        if (p.eventType === 'DELETE') { if (i < 0) return; arr.splice(i, 1); snap[t].delete(id); hooks.onChange?.(t, true); return; }
        const doc = p.new.data;
        if (t === 'produtos') { if (ehGestor()) doc.custo = i >= 0 ? arr[i].custo : 0; }
        const j = JSON.stringify(doc);
        if (snap[t].get(id) === j) return; // eco da própria gravação
        const antes = i >= 0 ? arr[i] : null;
        if (i >= 0) arr[i] = doc; else arr.push(doc);
        snap[t].set(id, j);
        let msg = t;
        if (t === 'fechamentos' && doc.status !== antes?.status) msg = doc.status === 'enviado' ? 'fechamento' : doc.status === 'aprovado' || doc.status === 'pago' ? 'aprovado' : t;
        hooks.onChange?.(msg, true);
      });
    }
    canal.subscribe();
  }

  async function lerPerfil() {
    const { data, error } = await sb.rpc('meu_perfil');
    if (error) throw error;
    perfil = data || null;
    return perfil;
  }

  async function iniciarSessao() {
    await lerPerfil();
    if (!perfil) return false;
    await carregar();
    ouvir();
    enviar();
    return true;
  }

  return {
    sb,
    get state() { return state; },
    get perfil() { return perfil; },
    get status() { return fila.length && status === 'online' ? 'enviando' : status; },
    get pendentes() { return fila.length; },
    registrarMudancas,
    async iniciar() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return false;
      try { return await iniciarSessao(); } catch (e) { console.warn(e); hooks.onErro?.('Sem conexão com o servidor. Tente novamente.'); return false; }
    },
    async entrarGestor(email, senha) {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos' : error.message === 'Email not confirmed' ? 'Confirme o e-mail antes de entrar (veja sua caixa de entrada)' : error.message);
      return iniciarSessao();
    },
    async cadastrarGestor(email, senha) {
      const { data, error } = await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw new Error(error.message);
      return !!data.session; // false = precisa confirmar e-mail
    },
    async ativarGestor(codigo) {
      const { data, error } = await sb.rpc('tornar_gestor', { p_codigo: codigo });
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Código de instalação incorreto');
      return iniciarSessao();
    },
    async entrarParceiro(codigo, pin) {
      const { data: s } = await sb.auth.getSession();
      if (!s.session) {
        const { error } = await sb.auth.signInAnonymously();
        if (error) throw new Error(/anonymous/i.test(error.message) ? 'Login de parceiros desativado no servidor (ative "Anonymous sign-ins" no Supabase).' : error.message);
      }
      const { data, error } = await sb.rpc('vincular_parceiro', { p_codigo: codigo, p_pin: pin });
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Código ou PIN incorreto');
      return iniciarSessao();
    },
    async redefinirSenha(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw new Error(error.message);
    },
    async novaSenha(senha) {
      const { error } = await sb.auth.updateUser({ password: senha });
      if (error) throw new Error(error.message);
    },
    async sair() {
      canal?.unsubscribe();
      await sb.auth.signOut();
      perfil = null; state = null;
    },
    rpc: async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(error.message); return data; },
    recarregar: async () => { await carregar(); hooks.onChange?.('recarregado', true); },
  };
}
