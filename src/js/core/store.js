// Camada de dados.
// Nesta versão os dados ficam no próprio aparelho (localStorage) e os dois apps
// (Gestão e Parceiro) compartilham o mesmo banco quando abertos no mesmo endereço.
// Em produção, este módulo é trocado por um adaptador Supabase (ver supabase/schema.sql)
// mantendo a mesma interface: get(), commit(), subscribe().

import { seed } from './seed.js';

const KEY = 'milterras:db:v1';
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('milterras') : null;
const listeners = new Set();
let state = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('Falha ao ler dados locais', e); }
  return null;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Falha ao salvar', e); }
}

export function get() {
  if (!state) {
    state = load();
    if (!state) { state = seed(); persist(); }
  }
  return state;
}

// Aplica uma alteração e avisa as telas (deste e de outros apps abertos)
export function commit(mutator, msg) {
  const s = get();
  mutator(s);
  s.meta.updatedAt = new Date().toISOString();
  persist();
  listeners.forEach((fn) => fn(s, msg));
  channel?.postMessage({ type: 'changed', msg });
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function reloadFromDisk(msg) {
  state = load() || state;
  listeners.forEach((fn) => fn(state, msg, true));
}
window.addEventListener('storage', (e) => { if (e.key === KEY) reloadFromDisk(); });
channel?.addEventListener('message', (e) => reloadFromDisk(e.data?.msg));

export function reset() { state = seed(); persist(); listeners.forEach((fn) => fn(state)); channel?.postMessage({ type: 'changed' }); }

export function exportJSON() { return JSON.stringify(get(), null, 2); }
export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data?.produtos || !data?.clientes) throw new Error('Arquivo inválido');
  state = data; persist(); listeners.forEach((fn) => fn(state)); channel?.postMessage({ type: 'changed' });
}
