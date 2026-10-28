// Camada de dados com dois modos, mesma interface para os apps:
//  • nuvem — Supabase (src/js/config.js preenchido): dados compartilhados entre todos os aparelhos,
//            login real, tempo real, fila offline.
//  • local — dados só neste navegador. Usado na demonstração (?demo=1) ou sem Supabase configurado.

import { seed } from './seed.js';
import { CONFIG } from '../config.js';
import { criarNuvem } from './cloud.js';

const params = new URLSearchParams(location.search);
export const demo = params.has('demo') || !CONFIG.supabaseUrl || !CONFIG.supabaseKey;
export const modo = demo ? 'local' : 'nuvem';

const KEY = 'milterras:db:v1';
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('milterras') : null;
const listeners = new Set();
let state = null;
let nuvem = null;
let erroHook = null;
let statusHook = null;
let recuperacaoHook = null;

const avisar = (msg, externo) => listeners.forEach((fn) => fn(get(), msg, externo));

// ---------- modo local ----------
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { console.warn('Falha ao ler dados locais', e); }
  return null;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Falha ao salvar', e); } }
function reloadFromDisk(msg) { state = load() || state; avisar(msg, true); }
if (modo === 'local') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) reloadFromDisk(); });
  channel?.addEventListener('message', (e) => reloadFromDisk(e.data?.msg));
}

// ---------- API ----------
export async function init(app) {
  if (modo === 'local') { get(); return true; }
  nuvem = criarNuvem(app, {
    onChange: (msg, externo) => avisar(msg, externo),
    onErro: (m) => erroHook?.(m),
    onStatus: (s, n) => statusHook?.(s, n),
    onRecuperacao: () => recuperacaoHook?.(),
  });
  return nuvem.iniciar();
}

export function get() {
  if (modo === 'nuvem') return nuvem?.state;
  if (!state) { state = load(); if (!state) { state = seed(); persist(); } state.pedidos ||= []; }
  return state;
}

// Aplica uma alteração e avisa as telas (e os outros aparelhos / abas)
let somenteLeitura = false;
export const setSomenteLeitura = (v) => { somenteLeitura = v; };
export function commit(mutator, msg) {
  if (somenteLeitura) { erroHook?.('modo visualização — alterações desativadas'); return; }
  const s = get();
  mutator(s);
  if (modo === 'nuvem') { nuvem.registrarMudancas(); avisar(msg); return; }
  s.meta.updatedAt = new Date().toISOString();
  persist();
  avisar(msg);
  channel?.postMessage({ type: 'changed', msg });
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const onErro = (fn) => { erroHook = fn; };
export const onStatus = (fn) => { statusHook = fn; };
export const onRecuperacao = (fn) => { recuperacaoHook = fn; };
export const redefinirSenha = (e) => nuvem.redefinirSenha(e);
export const novaSenha = (s) => nuvem.novaSenha(s);
export const status = () => (modo === 'local' ? 'local' : nuvem?.status || 'offline');
export const pendentes = () => nuvem?.pendentes || 0;
export const perfil = () => nuvem?.perfil || null;

// Autenticação (modo nuvem)
export const entrarGestor = (e, s) => nuvem.entrarGestor(e, s);
export const cadastrarGestor = (e, s) => nuvem.cadastrarGestor(e, s);
export const ativarGestor = (c) => nuvem.ativarGestor(c);
export const entrarParceiro = (c, p) => nuvem.entrarParceiro(c, p);
export const sair = () => nuvem?.sair();
export const sessaoAtiva = async () => !!(await nuvem?.sb.auth.getSession())?.data?.session;
export const recarregar = () => nuvem?.recarregar();
export const rpc = (fn, args) => nuvem.rpc(fn, args);
export const atualizarDisponivel = () => nuvem?.atualizarDisponivel();
export const ehGestor = () => ['dono', 'gestor'].includes(nuvem?.perfil?.papel);
export const ehDono = () => nuvem?.perfil?.papel === 'dono';

// Somente modo local (demonstração)
export function reset() { state = seed(); persist(); avisar(); channel?.postMessage({ type: 'changed' }); }
export function exportJSON() { return JSON.stringify(get(), null, 2); }
export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data?.produtos || !data?.clientes) throw new Error('Arquivo inválido');
  if (modo === 'nuvem') throw new Error('Importação disponível só no modo local');
  state = data; persist(); avisar(); channel?.postMessage({ type: 'changed' });
}
