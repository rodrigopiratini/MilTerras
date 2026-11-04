// Entrada única: um endereço e um ícone por app. Quem entra decide o que abre:
//  • e-mail e senha (administrador e gestor) → a Gestão
//  • código + PIN (usuário: motorista, parceiro, técnico…) → o app do usuário
// As duas sessões ficam guardadas no aparelho, cada uma na sua chave (o login não se perde ao fechar o app).
// Quem decide o que cada um vê é o banco: a sessão de código + PIN não lê nada da Gestão (regras em base.sql).
//
// Ordem da escolha: ?ver=<ref> (gestão vendo o app de um usuário) › ?entrar=gestao|usuario (link enviado)
// › o último login feito neste aparelho › a sessão que existir › Gestão.
import { SEGMENTO } from '../segmento.js';
import { CONFIG } from '../config.js';

const q = new URLSearchParams(location.search);
const demo = q.has('demo') || !CONFIG.supabaseUrl || !CONFIG.supabaseKey;
const ESCOLHA = `${SEGMENTO.id}:entrada`;
const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const temSessao = (app) => !!ler(demo ? `${SEGMENTO.id}:sessao:${app}` : `${SEGMENTO.id}-auth-${app}`);

function escolher() {
  if (!SEGMENTO.usuario) return 'gestao';
  if (q.get('ver')) return 'usuario';
  const pedido = q.get('entrar');
  if (pedido === 'gestao' || pedido === 'usuario') { gravar(ESCOLHA, pedido); return pedido; }
  const ult = ler(ESCOLHA);
  if (ult === 'gestao' || ult === 'usuario') return ult;
  if (temSessao('gestao')) return 'gestao';
  if (temSessao('usuario')) return 'usuario';
  // endereço antigo do app de campo (…/usuario/), já instalado em celulares: abre no login de código + PIN
  return /\/usuario\/?$/.test(location.pathname) ? 'usuario' : 'gestao';
}

// O Chrome avisa cedo que o app pode ser instalado (beforeinstallprompt). O app de verdade carrega um passo
// depois (import abaixo), então guardamos o aviso aqui para o botão "Instalar" usar (src/js/core/ui.js).
// "entrar como" do painel EasyAPP Gestão: a sessão vem no fim do endereço (#sessao=…); o app entra com ela
// (src/js/core/cloud.js) e o endereço é limpo na hora, para a sessão não ficar no histórico.
try {
  const m = location.hash.match(/^#sessao=([^&]+)/);
  if (m) { window.EA_SESSAO = JSON.parse(atob(decodeURIComponent(m[1]))); history.replaceState(null, '', location.pathname + location.search); }
} catch { /* endereço inválido: segue para o login */ }
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.EA_INSTALAR = e; });
window.EA_ENTRADA = { unica: true, chave: ESCOLHA };
const app = escolher();
document.documentElement.dataset.app = app;
import(app === 'usuario' ? '../usuario/app.js' : '../gestao/app.js');
