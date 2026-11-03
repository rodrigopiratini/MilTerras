// Adaptador Supabase (comum a todos os segmentos): carrega os documentos que o usuário pode ver
// (as regras ficam no banco), grava o que o app alterou (diferença antes/depois de cada commit)
// e recebe as mudanças dos outros aparelhos em tempo real.
// Gravações passam por uma fila persistente: se a internet cair, são reenviadas depois.

import { CONFIG } from '../config.js';
import { SEGMENTO } from '../segmento.js';

const COLECOES = Object.keys(SEGMENTO.colecoes);
const PAGINA = 1000;
const LOTE = 200;
const SCHEMA = SEGMENTO.schema || 'public'; // pasta do app no banco (vários apps no mesmo projeto)

export function criarNuvem(app, hooks) {
  const sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    db: { schema: SCHEMA },
    auth: { storageKey: `${SEGMENTO.id}-auth-${app}`, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const OUTBOX = `${SEGMENTO.id}-fila-${app}`;
  let state = null;
  let perfil = null;
  let snap = {};
  let canal = null;
  let enviando = false;
  let fila = lerFila();
  let status = 'online';
  const empresa = () => perfil?.empresaId;
  const ehGestao = () => perfil?.papel === 'dono' || perfil?.papel === 'gestor';
  // Visita de suporte: o administrador da plataforma abriu uma empresa (Plataforma › Abrir). Vem do banco em meu_perfil.
  const suporte = () => (perfil?.suporte ? { ...perfil.suporte, nome: perfil.empresa?.nome || '' } : null);
  let fimVisita = null;

  function lerFila() { try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]'); } catch { return []; } }
  function salvarFila() { try { localStorage.setItem(OUTBOX, JSON.stringify(fila)); } catch {} }
  const setStatus = (s) => { if (s !== status) { status = s; hooks.onStatus?.(s, fila.length); } };

  async function buscarTudo() {
    const out = [];
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await sb.from('docs').select('id,colecao,data').eq('empresa_id', empresa()).order('id').range(de, de + PAGINA - 1);
      if (error) throw error;
      out.push(...data);
      if (data.length < PAGINA) return out;
    }
  }

  function fotografar() {
    snap = { meta: JSON.stringify(state.meta) };
    for (const c of COLECOES) snap[c] = new Map(state[c].map((x) => [x.id, JSON.stringify(x)]));
  }

  async function carregar() {
    const docs = await buscarTudo();
    state = { meta: { demo: false } };
    for (const c of COLECOES) state[c] = [];
    for (const d of docs) {
      if (d.colecao === 'config') { if (d.id === 'geral') state.meta = { ...d.data, demo: false }; }
      else if (state[d.colecao]) state[d.colecao].push({ ...d.data, id: d.id }); // o id da linha manda (dados importados podem vir sem ele)
    }
    state.meta.empresa ||= perfil.empresa?.nome || '';
    for (const op of fila) aplicarLocal(op); // o que ainda não foi enviado prevalece sobre o servidor
    fotografar();
    return state;
  }

  function aplicarLocal(op) {
    if (op.colecao === 'config') { if (op.op !== 'delete') state.meta = { ...state.meta, ...op.data }; return; }
    const arr = state[op.colecao];
    if (!arr) return;
    const i = arr.findIndex((x) => x.id === op.id);
    if (op.op === 'delete') { if (i >= 0) arr.splice(i, 1); return; }
    if (i >= 0) arr[i] = op.data; else arr.push(op.data);
  }

  // Compara o estado com a última fotografia e enfileira o que mudou
  function registrarMudancas() {
    const ops = [];
    for (const c of COLECOES) {
      const atual = new Map(state[c].map((x) => [x.id, x]));
      for (const [id, doc] of atual) if (snap[c].get(id) !== JSON.stringify(doc)) ops.push({ colecao: c, op: 'upsert', id, data: doc });
      for (const id of snap[c].keys()) if (!atual.has(id)) ops.push({ colecao: c, op: 'delete', id });
    }
    if (JSON.stringify(state.meta) !== snap.meta && ehGestao()) { const { demo, ...data } = state.meta; ops.push({ colecao: 'config', op: 'upsert', id: 'geral', data }); }
    fotografar();
    if (ops.length) { fila.push(...ops.map((o) => ({ ...o, empresa: empresa() }))); salvarFila(); enviar(); }
  }

  const linha = (op) => ({ empresa_id: op.empresa, id: op.id, colecao: op.colecao, data: op.data });
  async function enviar() {
    if (enviando || !fila.length) { if (!fila.length) setStatus('online'); return; }
    enviando = true;
    setStatus('enviando');
    try {
      while (fila.length) {
        const op = fila[0];
        let lote = [op];
        if (op.op === 'upsert') { lote = []; for (const x of fila) { if (x.op !== 'upsert' || x.empresa !== op.empresa || lote.length >= LOTE || lote.some((y) => y.id === x.id)) break; lote.push(x); } }
        let r;
        try {
          r = op.op === 'upsert'
            ? await sb.from('docs').upsert(lote.map(linha), { onConflict: 'empresa_id,id' })
            : await sb.from('docs').delete().eq('empresa_id', op.empresa).eq('id', op.id);
        } catch (e) { r = { error: { rede: true, message: e.message } }; }
        if (r.error) {
          const rede = r.error.rede || !r.error.code || /fetch|network|Failed/i.test(r.error.message || '');
          if (rede) { setStatus('offline'); setTimeout(() => { enviando = false; enviar(); }, 15000); return; }
          // recusado pelo banco (permissão/regra): descarta e recarrega a verdade do servidor
          console.warn('Gravação recusada', op, r.error);
          fila.splice(0, lote.length); salvarFila();
          hooks.onErro?.(traduzir(r.error.message));
          await carregar();
          hooks.onChange?.('recarregado', true);
          continue;
        }
        fila.splice(0, lote.length); salvarFila();
      }
      setStatus('online');
    } finally { enviando = false; }
  }
  const traduzir = (m = '') => (/row-level security/i.test(m) ? (perfil?.empresa?.liberada === false ? 'assinatura vencida: os dados estão só para consulta' : 'sem permissão para esta alteração') : m || 'operação recusada pelo servidor');
  window.addEventListener('online', () => enviar());
  sb.auth.onAuthStateChange((evento) => { if (evento === 'PASSWORD_RECOVERY') setTimeout(() => hooks.onRecuperacao?.(), 300); });

  function ouvir() {
    canal?.unsubscribe();
    canal = sb.channel(`${SEGMENTO.id}-${app}`);
    canal.on('postgres_changes', { event: '*', schema: SCHEMA, table: 'docs', filter: `empresa_id=eq.${empresa()}` }, (p) => {
      if (!state) return;
      const id = p.new?.id || p.old?.id;
      if (fila.some((op) => op.id === id)) return; // alteração local ainda pendente
      if (p.eventType === 'DELETE') {
        for (const c of COLECOES) { const i = state[c].findIndex((x) => x.id === id); if (i >= 0) { state[c].splice(i, 1); snap[c].delete(id); hooks.onChange?.(c, true); } }
        return;
      }
      const c = p.new.colecao;
      if (c === 'config') { if (id === 'geral') { state.meta = { ...p.new.data, demo: false }; snap.meta = JSON.stringify(state.meta); hooks.onChange?.('config', true); } return; }
      if (!state[c]) return;
      const doc = { ...p.new.data, id };
      const j = JSON.stringify(doc);
      if (snap[c].get(id) === j) return; // eco da própria gravação
      const i = state[c].findIndex((x) => x.id === id);
      const antes = i >= 0 ? state[c][i] : null;
      if (i >= 0) state[c][i] = doc; else state[c].push(doc);
      snap[c].set(id, j);
      hooks.onChange?.(c, true, { colecao: c, doc, antes, novo: !antes });
    });
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
    clearTimeout(fimVisita);
    // a visita vence sozinha (2 h): o app volta para a conta do próprio administrador
    if (perfil?.suporte?.ate) fimVisita = setTimeout(() => recomecar().then(() => hooks.onChange?.('recarregado', true)), Math.max(1000, new Date(perfil.suporte.ate) - Date.now() + 1000));
    if (!perfil?.empresaId) { canal?.unsubscribe(); state = null; return false; }
    await carregar();
    ouvir();
    enviar();
    sb.rpc('registrar_acesso').then(({ error }) => error && console.warn('registrar_acesso', error.message));
    sinalPresenca();
    return true;
  }
  // Presença: enquanto o app está aberto e visível, avisa o banco a cada 2 minutos (o painel mostra quem está conectado).
  // O modo suporte não conta como presença do cliente.
  let presenca = null;
  function sinalPresenca() {
    if (suporte() || presenca) return;
    const bater = () => { if (document.visibilityState === 'visible') sb.rpc('sinal').then(() => {}, () => {}); };
    bater();
    presenca = setInterval(bater, 120000);
    document.addEventListener('visibilitychange', bater);
  }

  // troca de empresa (visita de suporte): recarrega perfil, dados e o canal de tempo real
  async function recomecar() { canal?.unsubscribe(); return iniciarSessao(); }

  const erroLogin = (m) => (m === 'Invalid login credentials' ? 'E-mail ou senha incorretos' : m === 'Email not confirmed' ? 'Confirme o e-mail antes de entrar (veja sua caixa de entrada)' : m);

  return {
    sb,
    get state() { return state; },
    get perfil() { return perfil; },
    get status() { return fila.length && status === 'online' ? 'enviando' : status; },
    get pendentes() { return fila.length; },
    registrarMudancas,
    get suporte() { return suporte(); },
    async iniciar() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return false;
      try { return await iniciarSessao(); } catch (e) { console.warn(e); hooks.onErro?.('Sem conexão com o servidor. Tente novamente.'); return false; }
    },
    async entrarEmail(email, senha) {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error(erroLogin(error.message));
      return iniciarSessao();
    },
    async cadastrar(email, senha) {
      const { data, error } = await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw new Error(error.message);
      return !!data.session; // false = precisa confirmar o e-mail
    },
    async criarEmpresa(nome) {
      const { error } = await sb.rpc('criar_empresa', { p_nome: nome });
      if (error) throw new Error(error.message);
      return iniciarSessao();
    },
    async entrarConvite(codigo) {
      const { data, error } = await sb.rpc('entrar_convite', { p_codigo: codigo });
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Convite inválido, expirado ou já usado');
      return iniciarSessao();
    },
    async entrarCodigo(codigo, pin) {
      const { data: s } = await sb.auth.getSession();
      if (!s.session) {
        const { error } = await sb.auth.signInAnonymously();
        if (error) throw new Error(/anonymous/i.test(error.message) ? 'Login por código desativado no servidor (ative "Anonymous sign-ins" no Supabase).' : error.message);
      }
      const { data, error } = await sb.rpc('vincular_usuario', { p_codigo: codigo, p_pin: pin });
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
      clearTimeout(fimVisita);
      if (suporte()) await sb.rpc('suporte_sair').then(() => {}, () => {});
      await sb.auth.signOut();
      perfil = null; state = null;
    },
    async temSessao() { return !!(await sb.auth.getSession())?.data?.session; },
    lerPerfil,
    // Acessos (código + PIN) dos usuários do app de campo
    acessos: {
      async listar() { const { data, error } = await sb.from('acessos').select('codigo,ref,nome,pin,ativo').eq('empresa_id', empresa()); if (error) throw new Error(error.message); return data; },
      async criar(ref, nome) { const { data, error } = await sb.from('acessos').insert({ empresa_id: empresa(), ref, nome }).select('codigo,ref,nome,pin,ativo').single(); if (error) throw new Error(traduzir(error.message)); return data; },
      async alterar(ref, campos) { const { error } = await sb.from('acessos').update(campos).eq('empresa_id', empresa()).eq('ref', ref); if (error) throw new Error(traduzir(error.message)); },
      async apagar(ref) { const { error } = await sb.from('acessos').delete().eq('empresa_id', empresa()).eq('ref', ref); if (error) throw new Error(error.message); },
    },
    async renomearEmpresa(nome) { const { error } = await sb.from('empresas').update({ nome }).eq('id', empresa()); if (error) throw new Error(error.message); perfil.empresa.nome = nome; },
    // ---- Visita de suporte (administrador) ----
    // Verificação em duas etapas (app autenticador): o banco só abre empresas com a sessão em aal2.
    mfa: {
      async nivel() { const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); return data?.currentLevel || 'aal1'; },
      async fator() { const { data } = await sb.auth.mfa.listFactors(); return (data?.totp || []).find((f) => f.status === 'verified') || null; },
      async cadastrar() {
        const { data: l } = await sb.auth.mfa.listFactors();
        for (const f of l?.all || []) if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
        const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `${SEGMENTO.nome} ${new Date().toISOString().slice(0, 10)}` });
        if (error) throw new Error(error.message);
        return { id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret };
      },
      async confirmar(factorId, code) {
        const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: String(code).replace(/\D/g, '') });
        if (error) throw new Error(/invalid|expired/i.test(error.message) ? 'Código incorreto ou vencido' : error.message);
      },
    },
    async abrirEmpresa(id, modo) {
      const { error } = await sb.rpc('suporte_abrir', { p_empresa: id, p_modo: modo });
      if (error) throw new Error(error.message);
      return recomecar();
    },
    async sairSuporte() {
      await sb.rpc('suporte_sair');
      return recomecar();
    },
    rpc: async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(error.message); return data; },
    recarregar: async () => { await lerPerfil(); await carregar(); hooks.onChange?.('recarregado', true); },
  };
}
