// Camada de dados com dois modos e a mesma interface para os apps:
//  • nuvem — Supabase (src/js/config.js preenchido): dados compartilhados entre aparelhos,
//            várias empresas no mesmo banco (cada uma só vê o que é dela), tempo real, fila offline.
//  • local — dados só neste navegador. Usado na demonstração (?demo=1) ou sem Supabase configurado.
// Os apps leem com get() e alteram com commit(fn): nunca falam com o banco diretamente.

import { seed } from '../seed.js';
import { CONFIG } from '../config.js';
import { SEGMENTO } from '../segmento.js';
import { criarNuvem } from './cloud.js';

const params = new URLSearchParams(location.search);
export const demo = params.has('demo') || !CONFIG.supabaseUrl || !CONFIG.supabaseKey;
export const modo = demo ? 'local' : 'nuvem';
export const COLECOES = Object.keys(SEGMENTO.colecoes);
// ?ver=<ref> no app de campo: a gestão vê o app de um usuário como ele vê, só leitura, com o login da própria gestão
export const espelho = params.get('ver') || null;

const KEY = `${SEGMENTO.id}:demo:v1`;
const SESSAO = (app) => `${SEGMENTO.id}:sessao:${app}`;
const channel = 'BroadcastChannel' in window ? new BroadcastChannel(SEGMENTO.id) : null;
const listeners = new Set();
let state = null;
let nuvem = null;
let appAtual = null;
let perfilLocal = null;
let erroHook = null;
let statusHook = null;
let recuperacaoHook = null;

const avisar = (msg, externo, info) => listeners.forEach((fn) => fn(get(), msg, externo, info));

// ---------- modo local ----------
function completar(s) {
  for (const c of COLECOES) s[c] ||= [];
  s.acessos ||= [];
  s.meta ||= {};
  return s;
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return completar(JSON.parse(raw)); } catch (e) { console.warn('Falha ao ler dados locais', e); }
  return null;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Falha ao salvar', e); } }
function reloadFromDisk(msg) { state = load() || state; avisar(msg, true); }
if (modo === 'local') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) reloadFromDisk(); });
  channel?.addEventListener('message', (e) => reloadFromDisk(e.data?.msg));
}
const empresaDemo = () => ({ nome: get().meta.empresa || 'Empresa de demonstração', situacao: 'teste', plano: 'teste', testeAte: null, pagoAte: null, liberada: true, demo: true });
function lerSessaoLocal() {
  try { const v = JSON.parse(localStorage.getItem(SESSAO(appAtual)) || 'null'); perfilLocal = v ? { ...v, empresaId: 'demo', empresa: empresaDemo() } : null; } catch { perfilLocal = null; }
}
function gravarSessaoLocal(v) { try { v ? localStorage.setItem(SESSAO(appAtual), JSON.stringify(v)) : localStorage.removeItem(SESSAO(appAtual)); } catch {} lerSessaoLocal(); }

// ---------- API ----------
export async function init(app) {
  appAtual = app;
  if (modo === 'local') {
    get(); lerSessaoLocal();
    if (espelho && app === 'usuario') perfilLocal = { papel: 'dono', ref: null, empresaId: 'demo', empresa: empresaDemo() };
    return !!perfilLocal;
  }
  nuvem = criarNuvem(espelho && app === 'usuario' ? 'gestao' : app, {
    onChange: (msg, externo, info) => avisar(msg, externo, info),
    onErro: (m) => erroHook?.(m),
    onStatus: (s, n) => statusHook?.(s, n),
    onRecuperacao: () => recuperacaoHook?.(),
  });
  return nuvem.iniciar();
}

export function get() {
  if (modo === 'nuvem') return nuvem?.state;
  if (!state) { state = load(); if (!state) { state = completar(seed()); persist(); } }
  return state;
}

// Aplica uma alteração e avisa as telas (e os outros aparelhos / abas)
let somenteLeitura = false;
export const setSomenteLeitura = (v) => { somenteLeitura = v; };
export const ehSomenteLeitura = () => somenteLeitura;
export function commit(mutator, msg) {
  if (somenteLeitura) { erroHook?.('somente consulta — alterações desativadas'); return false; }
  const s = get();
  mutator(s);
  if (modo === 'nuvem') { nuvem.registrarMudancas(); avisar(msg); return true; }
  s.meta.updatedAt = new Date().toISOString();
  persist();
  avisar(msg);
  channel?.postMessage({ type: 'changed', msg });
  return true;
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const onErro = (fn) => { erroHook = fn; };
export const onStatus = (fn) => { statusHook = fn; };
export const onRecuperacao = (fn) => { recuperacaoHook = fn; };
export const status = () => (modo === 'local' ? 'local' : nuvem?.status || 'offline');
export const pendentes = () => nuvem?.pendentes || 0;
export const perfil = () => (modo === 'local' ? perfilLocal : nuvem?.perfil || null);
export const ehGestao = () => ['dono', 'gestor'].includes(perfil()?.papel);
export const ehDono = () => perfil()?.papel === 'dono';
export const ehAdmin = () => !!perfil()?.admin;
// Visita de suporte do desenvolvedor (Plataforma › Abrir): { modo: 'leitura' | 'edicao', nome, ate }
export const suporte = () => (modo === 'nuvem' ? nuvem?.suporte || null : null);
export const mfa = { nivel: () => nuvem.mfa.nivel(), fator: () => nuvem.mfa.fator(), cadastrar: () => nuvem.mfa.cadastrar(), confirmar: (f, c) => nuvem.mfa.confirmar(f, c) };
export const abrirEmpresa = (id, m) => nuvem.abrirEmpresa(id, m);
export const sairSuporte = () => nuvem.sairSuporte();
export const meuRef = () => espelho || perfil()?.ref || null;
export const empresa = () => perfil()?.empresa || null;

// ---------- Entrada ----------
export const temSessao = async () => (modo === 'local' ? !!perfilLocal : !!(await nuvem?.temSessao()));
export const entrarEmail = (e, s) => nuvem.entrarEmail(e, s);
export const cadastrar = (e, s) => nuvem.cadastrar(e, s);
export const criarEmpresa = (n) => nuvem.criarEmpresa(n);
export const entrarConvite = (c) => nuvem.entrarConvite(c);
export const redefinirSenha = (e) => nuvem.redefinirSenha(e);
export const novaSenha = (s) => nuvem.novaSenha(s);
export const recarregar = () => nuvem?.recarregar();
export const reiniciar = () => nuvem?.reiniciar();
export const rpc = (fn, args) => nuvem.rpc(fn, args);
// Login atual (para as funções do Supabase chamadas com fetch, como o assistente)
export const token = async () => (modo === 'nuvem' ? (await nuvem?.sb.auth.getSession())?.data?.session?.access_token || null : null);
// Supabase Edge Function (ex.: integração com WhatsApp). Só no modo nuvem; manda o login junto.
export async function funcao(nome, corpo) {
  if (modo !== 'nuvem') throw new Error('Disponível só com o banco na nuvem');
  const { data, error } = await nuvem.sb.functions.invoke(nome, { body: corpo });
  if (error) throw new Error(error.message);
  return data;
}
export const renomearEmpresa = async (nome) => {
  if (somenteLeitura) throw new Error('somente consulta — alterações desativadas');
  if (modo === 'nuvem') await nuvem.renomearEmpresa(nome);
  commit((s) => { s.meta.empresa = nome; });
};

// Demonstração: gestão entra com PIN; usuário entra com código + PIN dos acessos de demonstração
export function entrarDemoGestao(pin) {
  if (String(pin) !== String(get().meta.pinGestao || '0000')) return false;
  gravarSessaoLocal({ papel: 'dono' }); return true;
}
export async function entrarCodigo(codigo, pin) {
  if (modo === 'nuvem') return nuvem.entrarCodigo(codigo, pin);
  const a = get().acessos.find((x) => x.codigo === String(codigo).trim().toUpperCase() && x.pin === String(pin).trim() && x.ativo !== false);
  if (!a) throw new Error('Código ou PIN incorreto');
  gravarSessaoLocal({ papel: 'usuario', ref: a.ref }); return true;
}
export async function sair() { if (modo === 'local') gravarSessaoLocal(null); else await nuvem?.sair(); }

// ---------- Acessos (código + PIN) dos usuários do app de campo ----------
const codigoAleatorio = (n) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const pinAleatorio = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');
function mudarAcessosLocal(fn) { const s = get(); fn(s.acessos); persist(); avisar('acessos'); channel?.postMessage({ type: 'changed', msg: 'acessos' }); }
export const acessos = {
  async listar() { return modo === 'nuvem' ? nuvem.acessos.listar() : get().acessos.map((a) => ({ ...a })); },
  async criar(ref, nome) {
    if (modo === 'nuvem') return nuvem.acessos.criar(ref, nome);
    const a = { codigo: codigoAleatorio(6), ref, nome, pin: pinAleatorio(), ativo: true };
    mudarAcessosLocal((l) => { const i = l.findIndex((x) => x.ref === ref); if (i >= 0) l.splice(i, 1); l.push(a); });
    return a;
  },
  async trocarPin(ref) { const pin = pinAleatorio(); if (modo === 'nuvem') await nuvem.acessos.alterar(ref, { pin }); else mudarAcessosLocal((l) => { const a = l.find((x) => x.ref === ref); if (a) a.pin = pin; }); return pin; },
  async ativar(ref, ativo) { if (modo === 'nuvem') return nuvem.acessos.alterar(ref, { ativo }); mudarAcessosLocal((l) => { const a = l.find((x) => x.ref === ref); if (a) a.ativo = ativo; }); },
  async renomear(ref, nome) { if (modo === 'nuvem') return nuvem.acessos.alterar(ref, { nome }); mudarAcessosLocal((l) => { const a = l.find((x) => x.ref === ref); if (a) a.nome = nome; }); },
  async apagar(ref) { if (modo === 'nuvem') return nuvem.acessos.apagar(ref); mudarAcessosLocal((l) => { const i = l.findIndex((x) => x.ref === ref); if (i >= 0) l.splice(i, 1); }); },
};

// ---------- Somente modo local (demonstração) ----------
export function reset(opcoes) { state = completar(seed(opcoes)); persist(); avisar(); channel?.postMessage({ type: 'changed' }); }
export function exportJSON() { const { acessos: _, ...resto } = get(); return JSON.stringify(resto, null, 2); }
export function importJSON(text) {
  if (modo === 'nuvem') throw new Error('Importação disponível só no modo local');
  const data = JSON.parse(text);
  if (!data?.meta) throw new Error('Arquivo inválido');
  state = completar({ ...data, acessos: get().acessos }); persist(); avisar(); channel?.postMessage({ type: 'changed' });
}
