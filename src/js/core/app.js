// Motor comum dos apps (Gestão e Usuário). Cada segmento só escreve as telas do negócio;
// login, cadastro da empresa, equipe, acessos por código + PIN, assinatura, registro de
// atividades, painel da plataforma, instalação, atualização e sincronização vêm prontos daqui.
//
// Uso (ver src/js/gestao/app.js):
//   const A = criarApp({ tipo: 'gestao', inicio: '#/painel', nav, tabs, rotas, acoes, badges, aposEntrar, aoMudar, configExtra, camposEmpresa });
//   function vPainel() { return A.tela('Painel', A.pageHead('Painel') + '...'); }
//   A.iniciar();

import * as store from './store.js';
import { SEGMENTO } from '../segmento.js';
import { esc, date, today, money0, int } from './fmt.js';
import { icon, router, delegate, modal, closeModal, confirmar, toast, empty, waLink, download, asset, instalar, bannerInstalar, dispensarBanner, registerSW, verificarAtualizacao, versaoApp, filtrarBusca, buscaInput, iniciais, badge, kpi, moneyInput, parseMoney, stepHandler } from './ui.js';
import { mountCharts, resetCharts } from './charts.js';
import { criarAssistente } from './assistente.js';
import { CONFIG } from '../config.js';
import { seed } from '../seed.js';

// Segmento sem app de campo (só Gestão): SEGMENTO.usuario = null
const TEM_USUARIO = !!SEGMENTO.usuario;
const U = SEGMENTO.usuario || { papel: 'Usuário', papelPlural: 'Usuários', curto: 'Usuário', nome: '', colecao: null };
// Níveis: Desenvolvedor (quem cuida da fábrica: plataforma_admins; abre empresas pela Plataforma › Ver / Corrigir),
// Administrador (o dono da empresa; papel 'dono' no banco), Gestor (delegado pelo Administrador; papel 'gestor')
// e Usuário (o pessoal de ponta, no app de campo com código + PIN: motorista, parceiro…; papel 'usuario')
// App exclusivo (de um cliente só, com a marca dele): sem cadastro livre, sem período de teste e sem planos
const EXCLUSIVO = !!SEGMENTO.exclusivo;
// Entrada única (src/js/core/entrada.js): o mesmo endereço abre a Gestão ou o app do usuário, conforme o login
const UNICA = !!window.EA_ENTRADA?.unica && TEM_USUARIO;
const lembrar = (k, v) => { try { v == null ? localStorage.removeItem(`${SEGMENTO.id}:${k}`) : localStorage.setItem(`${SEGMENTO.id}:${k}`, v); } catch {} };
const lembrado = (k) => { try { return localStorage.getItem(`${SEGMENTO.id}:${k}`) || ''; } catch { return ''; } };
const PAPEL = { dono: 'Administrador', gestor: 'Gestor', usuario: U.papel && U.papel !== 'Usuário' ? `Usuário (${U.papel})` : 'Usuário', suporte: 'Desenvolvedor' };

export function criarApp(def) {
  const tipo = def.tipo; // 'gestao' | 'usuario'
  const gestao = tipo === 'gestao';
  const root = document.getElementById('app');
  const S = () => store.get();
  const INICIO = def.inicio || (gestao ? '#/painel' : '#/inicio');
  let current = { view: null, params: {}, pattern: '' };
  const buscas = {};
  let tituloAtual = '';

  // ---------- Assistente (IA) e botão + ----------
  // segmento.js › assistente: false (desliga) | { usuario: false, instrucoes, gestao: { instrucoes, sugestoes }, usuario: {…} }
  // Telas: def.mais(pattern, params, s) → itens do + ({ icone, texto, act, dados } | { texto, h } | { texto, ia, enviar })
  //        def.sugestoes(pattern, params, s) → perguntas prontas para o assistente naquela tela
  //        def.iaExtras(s) → { nome: { nome, docs } }: números que as telas calculam (o assistente só lê)
  const CFG_IA = SEGMENTO.assistente === false ? null : { ...(SEGMENTO.assistente || {}) };
  const IA = !!CFG_IA && CFG_IA[tipo] !== false;
  const ia = IA ? criarAssistente({
    pasta: SEGMENTO.schema || 'public', app: tipo, idApp: SEGMENTO.id, nome: SEGMENTO.nome,
    descricao: (gestao ? SEGMENTO.gestao?.descricao : SEGMENTO.usuario?.descricao) || SEGMENTO.slogan || '',
    demo: store.modo === 'local', url: CONFIG.supabaseUrl, chave: CONFIG.supabaseKey, token: store.token,
    get: () => visivel(), commit: (fn, msg) => store.commit(fn, msg), toast,
    colecoes: () => {
      const leitura = !!(store.empresa() && !store.empresa().liberada) || store.suporte()?.modo === 'leitura' || (!gestao && !!store.espelho);
      return Object.fromEntries(Object.entries(SEGMENTO.colecoes).filter(([, c]) => gestao || (c.leitura || 'gestao') !== 'gestao')
        .map(([k, c]) => [k, { nome: c.nome || k, escrita: !leitura && (gestao || c.escrita === 'proprio') }]));
    },
    contexto: () => {
      const p = store.perfil() || {};
      const sub = (CFG_IA[tipo] && typeof CFG_IA[tipo] === 'object') ? CFG_IA[tipo] : {};
      return {
        empresa: store.empresa()?.nome || S()?.meta?.empresa || '',
        papel: gestao ? `${PAPEL[p.papel] || 'Gestão'}, no app de gestão (${SEGMENTO.gestao?.nome || 'Gestão'})` : `${U.papel}, no app ${U.nome || U.curto} (só vê e altera o que é dele)`,
        quem: gestao ? (p.email || '') : (def.nomeUsuario?.(S()) || ''),
        ref: gestao ? null : store.meuRef(),
        instrucoes: [CFG_IA.instrucoes, sub.instrucoes].filter(Boolean).join('\n'),
        campos: SEGMENTO.campos || {},
      };
    },
    tela: () => ({ rota: location.hash, titulo: tituloAtual.replace(/<[^>]+>/g, '') }),
    sugestoes: () => def.sugestoes?.(current.pattern, current.params, S()) || (CFG_IA[tipo] && CFG_IA[tipo].sugestoes) || [],
    extras: () => def.iaExtras?.(S()) || null,   // { nome: { nome, docs } } — números calculados pelas telas (só leitura)
  }) : null;
  // o que o usuário enxerga (na nuvem o banco já filtrou; na demonstração o aparelho tem tudo)
  function visivel() {
    const s = S();
    if (gestao || (store.modo === 'nuvem' && !store.espelho) || !s) return s;
    const ref = store.meuRef(), out = { ...s };
    for (const [k, c] of Object.entries(SEGMENTO.colecoes)) {
      const l = c.leitura || 'gestao';
      if (l === 'gestao') out[k] = [];
      else if (l === 'proprio') out[k] = (s[k] || []).filter((d) => (c.ref === 'id' ? d.id : d[c.ref]) === ref);
    }
    return out;
  }
  function itensMais() {
    return (def.mais?.(current.pattern, current.params, S()) || []).filter(Boolean).map((x) => ({ ...x, icone: x.icone?.startsWith?.('<') ? x.icone : icon(x.icone || 'plus') }));
  }
  function escolherMais(x) {
    if (x.h) { location.hash = x.h; return; }
    if (x.fn) return x.fn();
    const fn = def.acoes?.[x.act] || comuns[x.act];
    if (!fn) return;
    const el = document.createElement('button');
    Object.entries(x.dados || {}).forEach(([k, v]) => { el.dataset[k] = v; });
    fn(el, new Event('click'));
  }
  const temMais = () => IA || !!def.mais;

  // ---------- Navegação ----------
  const extrasNav = () => gestao ? [
    ['#/atividade', 'users', 'Atividade', () => SEGMENTO.atividade !== false && store.ehAdmin() && store.modo === 'nuvem'], // só o desenvolvedor // segmento.js: atividade: false tira do menu
    ['#/plataforma', 'building', 'Plataforma', () => store.ehAdmin()],
    ['#/config', 'gear', 'Configurações', () => true],
  ] : [['#/conta', 'user', 'Minha conta', () => true]];
  const navItens = () => [...def.nav, ...extrasNav().filter((x) => x[3]()).map((x) => x.slice(0, 3))];
  const tabs = () => def.tabs || [...def.nav.slice(0, 4), ['#/mais', 'menu', 'Mais']];

  function syncBadge() {
    const st = store.status();
    const t = { local: 'Demonstração (dados neste navegador)', online: 'Sincronizado', enviando: `Enviando ${store.pendentes()}…`, offline: `Sem internet · ${store.pendentes()} pendente(s)` }[st] || st;
    return `<span class="sync" style="${st === 'offline' ? 'color:var(--warn)' : st === 'local' ? 'color:var(--destaque)' : ''}">${t}</span>`;
  }
  // Marca da família EasyAPP (ou o logo próprio do segmento, se houver)
  const produto = SEGMENTO.produto || SEGMENTO.nome.replace(/^easy\s*app\s*/i, '') || SEGMENTO.nome;
  const barras = '<span class="ea-barras" aria-hidden="true"><i></i><i></i><i></i></span>';
  const nomeMarca = `<span class="ea-nome">EasyAPP<b>${esc(produto)}</b></span>`;
  const tile = `<span class="ea-tile" aria-hidden="true">${barras}</span>`;
  const marca = () => SEGMENTO.logo ? `<img src="${asset(SEGMENTO.logo)}" alt="${esc(SEGMENTO.nome)}">` : `<div class="ea-marca">${barras}${nomeMarca}</div>`;

  function avisoSuporte() {
    const sp = store.suporte();
    if (!sp) return '';
    const ate = sp.ate ? new Date(sp.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="aviso ${sp.modo === 'edicao' ? 'crit' : ''}">${icon('shield')}<span class="grow"><b>Suporte</b> · ${esc(sp.nome || '')} · ${sp.modo === 'edicao' ? 'ver e corrigir: o que você mudar fica na conta do cliente' : 'só ver'}${ate ? ` · até ${ate}` : ''}</span>
      ${gestao ? '<a href="#/plataforma" class="btn sm ghost">Trocar</a>' : ''}<button class="btn sm" data-act="sairSuporte">Sair</button></div>`;
  }
  // gestão vendo o app de um usuário (?ver=<ref>)
  function avisoEspelho() {
    if (gestao || !store.espelho) return '';
    return `<div class="aviso">${icon('info')}<span class="grow">Você está vendo o app de <b>${esc(def.nomeUsuario?.(S()) || U.papel)}</b> como ele vê, em tempo real. <b>Somente leitura.</b></span><button class="btn sm" data-act="fecharEspelho">Fechar</button></div>`;
  }
  function avisoAssinatura() {
    const e = store.empresa();
    if (!e || e.demo || interna()) return '';
    if (!e.liberada) return `<div class="aviso crit">${icon('alert')}<span class="grow"><b>Assinatura ${e.situacao === 'teste' ? 'do período de teste encerrada' : 'vencida'}.</b> Os dados estão disponíveis só para consulta.</span>${gestao ? '<a href="#/config" class="btn sm">Ver assinatura</a>' : ''}</div>`;
    if (gestao && !EXCLUSIVO && e.situacao === 'teste' && e.testeAte) {
      const dias = Math.round((new Date(e.testeAte + 'T12:00') - new Date(today() + 'T12:00')) / 86400000);
      if (dias <= 7) return `<div class="aviso">${icon('clock')}<span class="grow">Período de teste termina ${dias <= 0 ? 'hoje' : `em ${dias} dia${dias > 1 ? 's' : ''}`}.</span><a href="#/config" class="btn sm">Assinar</a></div>`;
    }
    return '';
  }

  function tela(title, content, { back } = {}) {
    const s = S();
    const route = '#' + (location.hash.slice(1).split('?')[0] || '');
    const isOn = (h) => route === h || route.startsWith(h + '/') || (def.ativo?.(h, route) ?? false);
    const bs = def.badges?.(s) || {};
    const b = (h) => (bs[h] ? `<span class="badge dot">${bs[h]}</span>` : '');
    const quem = gestao ? (store.empresa()?.nome || s.meta.empresa || SEGMENTO.gestao.curto) : (def.nomeUsuario?.(s) || U.papel);
    tituloAtual = title;
    const btIA = IA ? `<button class="eai-topo" data-act="eaiAbrir" aria-label="Assistente" title="Assistente"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg></button>` : '';
    return `<div class="shell">
      <aside class="side">
        <div class="brand">${marca()}<div class="who">${esc(gestao ? SEGMENTO.gestao.curto : U.curto)} · ${esc(quem)}</div></div>
        ${navItens().map(([h, ic, n]) => `<a class="nav-a ${isOn(h) ? 'on' : ''}" href="${h}">${icon(ic)}<span>${n}</span>${b(h)}</a>`).join('')}
        ${IA ? `<a class="nav-a" href="#" data-act="eaiAbrir">${icon('spark')}<span>Assistente</span></a>` : ''}
        <div class="foot">${syncBadge()}<br><a href="#" data-act="logout" style="color:inherit">Sair</a></div>
      </aside>
      <div>
        <header class="topbar">${back ? `<button data-act="back" aria-label="Voltar">${icon('arrowL')}</button><div class="t ellipsis">${title}</div>`
          : SEGMENTO.logo ? `<span style="display:grid;place-items:center">${icon(SEGMENTO.icone || 'home')}</span><div class="t ellipsis">${title}</div>`
          : `<div class="ea-marca t">${barras}${nomeMarca}</div>`}${def.topoDireita?.(s) || ''}${btIA}</header>
        <main class="main">${avisoSuporte()}${avisoEspelho()}${avisoAssinatura()}${store.modo === 'local' ? `<div class="demo-banner">${icon('info')}<span class="grow">Demonstração com dados fictícios, salvos só neste navegador.</span></div>` : ''}${bannerInstalar()}${content}</main>
      </div>
      <nav class="tabbar">${tabs().map(([h, ic, n]) => `<a href="${h}" class="${isOn(h) ? 'on' : ''}">${icon(ic)}<span>${n}</span>${b(h)}</a>`).join('')}</nav>
      ${temMais() ? '<button class="eai-fab" data-act="eaiMais" aria-label="Ações e assistente">+</button>' : ''}
    </div>`;
  }
  const pageHead = (title, sub = '', actions = '') => `<div class="pagehead"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="row wrap">${actions}</div></div>`;
  const busca = (ph) => buscaInput(buscas[current.pattern] || '', ph);
  const lerForm = (id) => { const f = typeof id === 'string' ? document.getElementById(id) : id; return f ? Object.fromEntries([...f.elements].filter((e) => e.name && (e.type !== 'checkbox' || e.checked)).map((e) => [e.name, e.type === 'checkbox' ? true : e.value])) : {}; };

  // ---------- Login ----------
  let telaLogin = 'entrar';
  // na entrada única, o topo do login troca entre e-mail e senha (Gestão) e código + PIN (usuário)
  const trocaEntrada = () => UNICA && !store.espelho ? `<div class="seg" style="align-self:center"><button type="button" class="${gestao ? 'on' : ''}" ${gestao ? '' : 'data-act="trocarEntrada" data-v="gestao"'}>${esc(SEGMENTO.gestao.curto)}</button><button type="button" class="${gestao ? '' : 'on'}" ${gestao ? 'data-act="trocarEntrada" data-v="usuario"' : ''}>${esc(U.curto)}</button></div>` : '';
  const caixa = (sub, corpo, acao, troca = false) => `<div class="login"><form class="box col" data-onsubmit="${acao}" style="gap:14px">
    ${SEGMENTO.logo ? `<img class="logo" src="${asset(SEGMENTO.logo)}" alt="" style="background:var(--primaria-escura);padding:12px;border-radius:14px">` : `<div class="ea-cab">${tile}${nomeMarca}<small>${esc(UNICA ? '' : sub)}</small></div>`}${troca ? trocaEntrada() : ''}${corpo}</form></div>`;

  function vLoginGestao() {
    if (store.modo === 'local') return caixa(`${SEGMENTO.gestao.curto} · demonstração`, `
      <div class="small muted center">Digite o PIN para entrar</div>
      <div class="pin">${[0, 1, 2, 3].map((i) => `<input inputmode="numeric" maxlength="1" name="p${i}" data-oninput="pin" autocomplete="off">`).join('')}</div>
      <button class="btn lg block">Entrar</button><div class="tiny muted center">Demonstração: PIN 0000 · dados fictícios, só neste navegador</div>`, 'loginDemo', true);
    const p = store.perfil();
    if (telaLogin === 'empresa' || (p && !p.empresaId)) return caixa(SEGMENTO.gestao.curto, `
      <div class="small center">Conta <b>${esc(p?.email || '')}</b> conectada. Falta ligar a uma empresa:</div>
      ${p?.admin ? `<div class="card col"><b>Desenvolvedor</b><div class="small muted">Entre na empresa de testes: acesso total, dados de demonstração e nenhum dado de cliente.</div><button class="btn block" data-act="empresaTestes">Entrar na empresa de testes</button></div>` : ''}
      ${EXCLUSIVO ? '' : `<div class="card col"><b>Sou o administrador (dono da empresa)</b><div class="small muted">Crie sua empresa e use grátis por ${SEGMENTO.diasTeste || 30} dias.</div>
        <label class="field"><span>Nome da empresa</span><input class="input" name="empresa" autocomplete="organization"></label><button class="btn block" data-act="criarEmpresa">Criar minha empresa</button></div>`}
      <div class="card col"><b>Recebi um convite</b><label class="field"><span>Código do convite</span><input class="input" name="convite" autocapitalize="characters" style="text-transform:uppercase"></label><button class="btn ghost block" data-act="usarConvite">Entrar com convite</button></div>
      ${p?.admin ? '<a class="btn ghost block" href="#/plataforma" data-act="abrirPlataforma">Plataforma: abrir a empresa de um cliente</a>' : ''}
      <a href="#" class="small center" data-act="logout">Usar outra conta</a>`, 'nada');
    const novo = telaLogin === 'novo' && !EXCLUSIVO;
    return caixa(SEGMENTO.gestao.curto, `
      ${EXCLUSIVO || UNICA ? '' : `<div class="seg" style="align-self:center"><button type="button" class="${novo ? '' : 'on'}" data-act="telaLogin" data-v="entrar">Entrar</button><button type="button" class="${novo ? 'on' : ''}" data-act="telaLogin" data-v="novo">Criar conta</button></div>`}
      <label class="field"><span>E-mail</span><input class="input" name="email" type="email" autocomplete="username" value="${esc(novo ? '' : lembrado('ultimo-email'))}" required></label>
      <label class="field"><span>Senha${novo ? ' (mínimo 8 caracteres)' : ''}</span><input class="input" name="senha" type="password" minlength="${novo ? 8 : 1}" autocomplete="${novo ? 'new-password' : 'current-password'}" required></label>
      <button class="btn lg block">${novo ? 'Criar conta' : 'Entrar'}</button>
      ${novo ? '' : '<a href="#" class="small center" data-act="esqueci">Esqueci minha senha</a>'}
      ${EXCLUSIVO ? '' : UNICA ? `<div class="tiny muted center">${novo ? 'Já tem conta? <a href="#" data-act="telaLogin" data-v="entrar">Entrar</a>' : 'Empresa nova? <a href="#" data-act="telaLogin" data-v="novo">Criar conta</a> · <a href="?demo=1">ver demonstração</a>'}</div>`
        : '<a class="tiny muted center" href="?demo=1">Ver demonstração com dados fictícios</a>'}`, novo ? 'cadastrar' : 'entrar', true);
  }
  function vLoginUsuario() {
    return caixa(U.curto, `
      <div class="small muted center">Use o código e o PIN que você recebeu${store.modo === 'local' ? ' (demonstração: veja os acessos em Gestão › Configurações)' : ''}.</div>
      <label class="field"><span>Código</span><input class="input" name="codigo" autocapitalize="characters" autocomplete="username" value="${esc(lembrado('ultimo-codigo'))}" style="text-transform:uppercase;font-size:20px;letter-spacing:.1em;text-align:center" required></label>
      <label class="field"><span>PIN</span><input class="input" name="pin" inputmode="numeric" maxlength="6" autocomplete="current-password" style="font-size:20px;letter-spacing:.3em;text-align:center" required></label>
      <button class="btn lg block">Entrar</button>
      ${store.modo === 'local' && def.dicaDemo ? `<div class="tiny muted center">${def.dicaDemo}</div>` : ''}`, 'entrarCodigo', true);
  }

  // ---------- Configurações (gestão) ----------
  // um endereço só (app/); ?entrar=usuario abre direto no login de código + PIN
  const linkUsuario = () => { const u = new URL('../app/', location.href); u.searchParams.set('entrar', 'usuario'); if (store.modo === 'local') u.searchParams.set('demo', '1'); return u.href; };
  // abrir o app de campo de um usuário como ele vê (só leitura)
  const linkVer = (ref) => { const u = new URL('../app/', location.href); u.searchParams.set('ver', ref); if (store.modo === 'local') u.searchParams.set('demo', '1'); return u.href; };
  const msgAcesso = (a, doc) => `Olá${doc?.nome ? ', ' + String(doc.nome).split(' ')[0] : ''}! Este é o app ${SEGMENTO.usuario.nome} da ${store.empresa()?.nome || S().meta.empresa || ''}:\n${linkUsuario()}\n\nCódigo: ${a.codigo}\nPIN: ${a.pin}\n\nPara instalar como app:\n• iPhone: abra o link no Safari › Compartilhar › Adicionar à Tela de Início\n• Android: abra no Chrome › menu ⋮ › Instalar app`;
  const msgConvite = (codigo, empresa = store.empresa()?.nome || '', dono = false) => `Convite${dono ? ' de administrador' : ''} para a ${SEGMENTO.gestao.nome} (${empresa}):\n${new URL('../app/?entrar=gestao', location.href).href}\n\n1. Toque em "Criar conta" e use seu e-mail\n2. Depois toque em "Entrar com convite"\n3. Código: ${codigo}\n\nO convite vale por 7 dias e pode ser usado uma única vez.`;

  async function pintarAcessos() {
    const el = document.getElementById('ea-acessos');
    if (!el) return;
    try {
      const lista = await store.acessos.listar();
      const docs = (S()[U.colecao] || []).filter((d) => d.ativo !== false);
      el.innerHTML = docs.length ? `<div class="list">${docs.map((d) => {
        const a = lista.find((x) => x.ref === d.id);
        return `<div class="li ${a && !a.ativo ? 'off' : ''}"><div class="avatar">${esc(iniciais(d.nome || '?'))}</div><div class="grow"><div class="t">${esc(d.nome || '—')}</div>
          <div class="s">${a ? `Código <b>${esc(a.codigo)}</b> · PIN <b>${esc(a.pin)}</b>${a.ativo ? '' : ' · bloqueado'}` : 'Sem acesso ao app'}</div></div>
          <div class="row gap-s wrap" style="justify-content:flex-end">${a ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${waLink(d.telefone, msgAcesso(a, d))}">${icon('whatsapp')}</a><button class="btn ghost sm" data-act="copiarAcesso" data-ref="${d.id}">Copiar</button><a class="btn ghost sm" target="_blank" rel="noopener" href="${linkVer(d.id)}" title="Ver o app como ele vê">Ver app</a><button class="btn ghost sm" data-act="trocarPin" data-ref="${d.id}">Novo PIN</button><button class="btn ghost sm" data-act="bloquearAcesso" data-ref="${d.id}" data-v="${a.ativo ? 0 : 1}">${a.ativo ? 'Bloquear' : 'Liberar'}</button>`
            : `<button class="btn sm" data-act="criarAcesso" data-ref="${d.id}">${icon('plus')} Gerar acesso</button>`}</div></div>`;
      }).join('')}</div>` : empty(`Cadastre ${U.papelPlural.toLowerCase()} para gerar os acessos ao app.`, 'users');
      el._lista = lista;
    } catch (e) { el.textContent = 'Não foi possível carregar os acessos: ' + e.message; }
  }

  async function pintarEquipe() {
    const el = document.getElementById('ea-equipe');
    if (!el) return;
    try {
      const eq = await store.rpc('equipe');
      el.innerHTML = `<div class="list">${eq.membros.map((m) => `<div class="li"><div class="avatar">${esc(iniciais(m.email || '?'))}</div><div class="grow"><div class="t">${esc(m.email)}${m.eu ? ' (você)' : ''}</div><div class="s">${PAPEL[m.papel]} · desde ${date(m.desde.slice(0, 10))}</div></div>${store.ehDono() && m.papel === 'gestor' ? `<button class="btn ghost sm" data-act="removerGestor" data-u="${m.userId}" data-e="${esc(m.email)}">Remover</button>` : ''}</div>`).join('')}
        ${eq.convites.map((c) => `<div class="li"><div class="avatar">${icon('link')}</div><div class="grow"><div class="t">Convite ${esc(c.codigo)}${c.nome ? ' · ' + esc(c.nome) : ''}</div><div class="s">Aguardando uso · vale até ${date(c.expira.slice(0, 10))}</div></div><a class="btn ghost sm" target="_blank" rel="noopener" href="${waLink('', msgConvite(c.codigo))}">${icon('whatsapp')}</a><button class="btn ghost sm" data-act="cancelarConvite" data-c="${c.codigo}">Cancelar</button></div>`).join('')}</div>`;
    } catch (e) { el.textContent = 'Não foi possível carregar a equipe: ' + e.message; }
  }

  const interna = () => store.empresa()?.plano === 'interno';   // empresa de testes do desenvolvedor
  function cardAssinatura() {
    const e = store.empresa();
    if (!e || e.demo || interna()) return '';
    if (EXCLUSIVO && e.liberada) return '';
    const sit = { teste: ['Período de teste', 'info'], ativa: ['Ativa', 'ok'], suspensa: ['Suspensa', 'crit'], cancelada: ['Cancelada', 'crit'] }[e.situacao] || [e.situacao, ''];
    const sup = SEGMENTO.suporte || {};
    const msg = `Olá! Quero assinar o ${SEGMENTO.nome} para a empresa ${e.nome}.`;
    return `<div class="card col"><div class="row between"><h2>Assinatura</h2>${badge(sit[0], e.liberada ? sit[1] : 'crit')}</div>
      <div class="small ink2">${e.situacao === 'teste' ? `Teste grátis até <b>${date(e.testeAte)}</b>.` : e.pagoAte ? `Pago até <b>${date(e.pagoAte)}</b>.` : ''} ${e.liberada ? '' : '<b>Gravações bloqueadas</b> até a regularização; os dados continuam disponíveis para consulta e exportação.'}</div>
      ${(SEGMENTO.planos || []).length ? `<div class="list">${SEGMENTO.planos.map((p) => `<div class="li"><div class="grow"><div class="t">${esc(p.nome)}${e.plano === p.id ? ' (seu plano)' : ''}</div><div class="s">${esc(p.descricao || '')}</div></div><b class="num">${money0(p.preco)}/mês</b></div>`).join('')}</div>` : ''}
      ${sup.whatsapp ? `<a class="btn" target="_blank" rel="noopener" href="${waLink(sup.whatsapp, msg)}">${icon('whatsapp')} Falar com ${esc(sup.nome || 'o suporte')}</a>` : sup.email ? `<a class="btn" href="mailto:${esc(sup.email)}?subject=${encodeURIComponent('Assinatura ' + SEGMENTO.nome)}&body=${encodeURIComponent(msg)}">Falar com ${esc(sup.nome || 'o suporte')}</a>` : ''}</div>`;
  }

  function vConfig() {
    const s = S();
    const nuvem = store.modo === 'nuvem';
    const campos = def.camposEmpresa || [];
    return tela('Configurações', `${pageHead('Configurações')}
      <div class="grid g2">
        <div class="col">
          ${TEM_USUARIO ? `<div class="card col"><h2>Acesso ${U.papelPlural ? 'dos ' + esc(U.papelPlural.toLowerCase()) : 'dos usuários'}</h2>
            <div class="small ink2">Cada ${esc(U.papel.toLowerCase())} entra no app <b>${esc(U.nome)}</b> com um código e um PIN. Envie pelo WhatsApp. Trocar o PIN ou bloquear desconecta os aparelhos dele.</div>
            <div id="ea-acessos" class="small muted">Carregando…</div>
            <a class="btn ghost" href="${linkUsuario()}" target="_blank" rel="noopener">${icon('link')} Abrir o app ${esc(U.curto)}</a></div>` : ''}
          ${def.configExtra?.(s) || ''}
        </div>
        <div class="col">
          ${cardAssinatura()}
          <div class="card col"><h2>Empresa</h2><form class="col" data-onsubmit="salvarEmpresa">
            <label class="field"><span>Nome</span><input class="input" name="empresa" value="${esc(store.empresa()?.nome || s.meta.empresa || '')}" ${store.ehDono() || !nuvem ? '' : 'disabled'}></label>
            ${campos.map(([k, label, ph = '']) => `<label class="field"><span>${label}</span><input class="input" name="${k}" value="${esc(s.meta[k] || '')}" placeholder="${esc(ph)}"></label>`).join('')}
            ${nuvem ? '' : `<label class="field"><span>PIN da gestão (demonstração)</span><input class="input" name="pinGestao" inputmode="numeric" maxlength="4" value="${esc(s.meta.pinGestao || '0000')}"></label>`}
            <button class="btn">Salvar</button></form></div>
          ${nuvem ? `<div class="card col"><h2>Pessoas na Gestão</h2><div id="ea-equipe" class="small muted">Carregando…</div>
            ${store.ehDono() ? `<button class="btn ghost" data-act="convidar">${icon('plus')} Convidar gestor (sócio, escritório)</button><div class="tiny muted">O gestor acessa toda a Gestão, mas não convida nem remove pessoas.</div>` : '<div class="tiny muted">Somente o administrador convida ou remove gestores.</div>'}</div>` : ''}
          <div class="card col"><h2>Dados</h2>
            ${nuvem && interna() ? `<div class="aviso">${icon('info')}<span class="grow"><b>Empresa de testes</b> do desenvolvedor: não é cliente e não entra no faturamento.</span></div><button class="btn ghost" data-act="recomecarTestes">${icon('refresh')} Recomeçar os dados de teste</button>` : ''}
            ${nuvem ? `<div class="small ink2">${icon('check')} Conectado à nuvem. Os dados ficam disponíveis em qualquer aparelho, em tempo real. Seu acesso: <b>${PAPEL[store.perfil()?.papel] || ''}</b>.</div>
              <div class="row wrap"><button class="btn ghost" data-act="backup">${icon('download')} Exportar backup</button><button class="btn ghost" data-act="install">${icon('download')} Instalar app</button><a class="btn ghost" href="?demo=1" target="_blank" rel="noopener">${icon('spark')} Demonstração</a></div>`
            : `<div class="small ink2">Você está na <b>demonstração</b>: dados fictícios salvos só neste navegador.</div>
              <div class="row wrap"><button class="btn ghost" data-act="backup">${icon('download')} Exportar</button><label class="btn ghost">${icon('upload')} Importar<input type="file" accept="application/json" hidden data-onchange="restore"></label><button class="btn ghost" data-act="install">${icon('download')} Instalar app</button></div>
              <div class="row wrap"><button class="btn ghost" data-act="resetDemo">${icon('refresh')} Recarregar demonstração</button><button class="btn ghost" data-act="zerar" style="color:var(--crit)">${icon('trash')} Começar do zero</button></div>`}
            <div class="tiny muted">Versão ${versaoApp()}</div></div>
        </div>
      </div>`);
  }

  // ---------- Registro de atividades (somente o desenvolvedor) ----------
  const atv = { chave: null, dados: null, erro: null };
  const ACAO = { insert: 'criou', update: 'alterou', delete: 'apagou' };
  const nomeColecao = (c) => SEGMENTO.colecoes[c]?.nome || { config: 'Configurações', acessos: 'Acessos', perfis: 'Perfis' }[c] || c;
  const nomeCampo = (k) => SEGMENTO.campos?.[k] || k;
  function descrever(x) {
    const proprio = def.descreverAtividade?.(x, S());   // o segmento pode descrever do jeito dele (texto em HTML)
    if (proprio) return proprio;
    if (x.acao === 'acesso') return x.papel === 'suporte' ? `abriu a empresa pelo suporte${x.depois?.modo ? ` (${x.depois.modo === 'edicao' ? 'ver e corrigir' : 'só ver'})` : ''}` : 'entrou no app';
    const doc = S()[x.colecao]?.find((d) => d.id === x.registro) || x.depois || x.antes || {};
    const nome = doc.nome || doc.titulo || doc.descricao || doc.placa || '';
    const campos = x.acao === 'update' ? Object.keys(x.depois || {}).filter((k) => !['atualizadoEm', 'updatedAt'].includes(k)) : [];
    return `${ACAO[x.acao] || x.acao} em ${esc(nomeColecao(x.colecao))}${nome ? ` · <b>${esc(String(nome).slice(0, 60))}</b>` : ''}${campos.length ? ` <span class="muted">(${esc(campos.map(nomeCampo).join(', '))})</span>` : ''}`;
  }
  async function carregarAtividade(query = {}) {
    const chave = JSON.stringify(query);
    if (atv.chave === chave && atv.dados) return pintarAtividade();
    atv.chave = chave; atv.dados = null; atv.erro = null;
    const dias = { hoje: 0, '7d': 6, '30d': 29 }[query.p || '7d'];
    const desde = dias == null ? null : new Date(new Date().setHours(0, 0, 0, 0) - dias * 86400000).toISOString();
    try { atv.dados = await store.rpc('atividade_log', { p_desde: desde, p_user: query.u || null, p_limite: 500 }); } catch (e) { atv.erro = e.message; }
    pintarAtividade();
  }
  function pintarAtividade() {
    const el = document.getElementById('ea-atividade');
    if (!el) return;
    if (atv.erro) { el.innerHTML = `<div class="card">${empty('Não foi possível carregar: ' + esc(atv.erro))}</div>`; return; }
    if (!atv.dados) { el.innerHTML = '<div class="card small muted">Carregando…</div>'; return; }
    const { itens, pessoas } = atv.dados;
    el.innerHTML = `<div class="grid g-2-1">
      <div class="card pad-0"><div class="list" style="padding:0 16px">${itens.map((x) => `<div class="li" data-busca="${esc(`${x.quem} ${x.colecao}`)}"><div class="avatar">${esc(iniciais(x.quem || '?'))}</div><div class="grow"><div class="small"><b>${esc((x.quem || '?').split('@')[0])}</b> ${descrever(x)}</div><div class="s">${new Date(x.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${PAPEL[x.papel] || ''}</div></div></div>`).join('') || empty('Nada registrado no período.')}</div></div>
      <div class="card"><div class="head"><h2>Pessoas (30 dias)</h2></div><div class="list">${pessoas.map((p) => `<a class="li" href="#/atividade?u=${p.userId}"><div class="avatar">${esc(iniciais(p.quem || '?'))}</div><div class="grow"><div class="t ellipsis">${esc(p.quem || '?')}</div><div class="s">${PAPEL[p.papel] || ''} · ${int(p.acoes)} ações · ${int(p.acessos)} acessos</div></div></a>`).join('') || empty('—')}</div></div></div>`;
  }
  function vAtividade({ query }) {
    const p = query.p || '7d';
    return tela('Atividade', `${pageHead('Registro de atividades', 'Quem fez o quê, em qualquer aparelho. Só o desenvolvedor vê.', busca('Buscar pessoa…'))}
      <div class="seg mb">${[['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['tudo', 'Tudo']].map(([v, n]) => `<button class="${p === v ? 'on' : ''}" data-act="goto" data-h="#/atividade?p=${v}${query.u ? '&u=' + query.u : ''}">${n}</button>`).join('')}${query.u ? '<button data-act="goto" data-h="#/atividade">Todas as pessoas ✕</button>' : ''}</div>
      <div id="ea-atividade"></div>`);
  }

  // ---------- Plataforma (desenvolvedor da fábrica) ----------
  const plat = { dados: null, erro: null };
  async function carregarPlataforma() {
    try { plat.dados = await store.rpc('plataforma_empresas'); plat.erro = null; } catch (e) { plat.erro = e.message; }
    pintarPlataforma();
    // vindo do painel de gestão: #/plataforma?abrir=<empresa>
    // #/plataforma?abrir=<empresa>&ver=<ref>: abre a empresa e mostra o app daquele usuário como ele vê (só leitura)
    const pedida = current.pattern === '/plataforma' && current.params?.query?.abrir;
    const ver = current.params?.query?.ver;
    if (pedida && plat.dados?.some((e) => e.id === pedida)) {
      history.replaceState(null, '', location.pathname + location.search + '#/plataforma');
      if (ver && TEM_USUARIO) { if (await abrirEmpresa(pedida, 'leitura', { semIr: true })) location.href = linkVer(ver); }
      else escolherModo(pedida);
    }
  }
  function escolherModo(id) {
    const e = plat.dados.find((x) => x.id === id);
    modal({ title: `Abrir ${esc(e.nome)}`, body: `<p class="small">O app mostra a empresa como o administrador dela vê, por 2 horas. A abertura fica no registro de atividades da empresa.</p>`,
      foot: `<button class="btn ghost" data-act="v">Só ver</button><button class="btn" data-act="c">Ver e corrigir</button>`,
      handlers: { v: () => { closeModal(); abrirEmpresa(id, 'leitura'); }, c: () => { closeModal(); abrirEmpresa(id, 'edicao'); } } });
  }
  async function abrirEmpresa(id, modo, { semIr = false } = {}) {
    const e = plat.dados?.find((x) => x.id === id);
    if (modo === 'edicao' && !(await confirmar(`Abrir ${esc(e?.nome || 'a empresa')} para ver e corrigir? O que você mudar fica na conta do cliente.`, { ok: 'Abrir' }))) return;
    try {
      const ok = await store.abrirEmpresa(id, modo);
      if (!ok) throw new Error('não consegui abrir a empresa');
      ia?.limpar();
      await def.aposEntrar?.();
      if (semIr) return true;
      toast(`${e?.nome || 'Empresa'} aberta ${modo === 'edicao' ? 'para ver e corrigir' : 'só para ver'}`);
      location.hash = INICIO; go();
      return true;
    } catch (err) { toast(/MFA/.test(err.message) ? 'Confirme a verificação em duas etapas' : err.message); return false; }
  }
  const SIT = { teste: ['Teste', 'info'], ativa: ['Ativa', 'ok'], suspensa: ['Suspensa', 'crit'], cancelada: ['Cancelada', ''] };
  function pintarPlataforma() {
    const el = document.getElementById('ea-plataforma');
    if (!el) return;
    if (plat.erro) { el.innerHTML = `<div class="card">${empty(esc(plat.erro))}</div>`; return; }
    if (!plat.dados) { el.innerHTML = '<div class="card small muted">Carregando…</div>'; return; }
    const es = plat.dados;
    const ativas = es.filter((e) => e.situacao === 'ativa');
    const mrr = ativas.reduce((a, e) => a + (+e.valorMensal || 0), 0);
    el.innerHTML = `<div class="grid g4">${kpi('Empresas', int(es.length), `${es.filter((e) => e.situacao === 'teste').length} em teste`)}${kpi('Pagantes', int(ativas.length), `${es.filter((e) => !e.liberada).length} bloqueadas`)}${kpi('Receita mensal', money0(mrr), 'soma das ativas')}${kpi('Usuários (app de campo)', int(es.reduce((a, e) => a + e.usuarios, 0)), 'acessos ativos')}</div>
      <div class="card pad-0 mt"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>Situação</th><th class="hide-m">Administrador</th><th class="r">Usuários</th><th class="r hide-m">Registros</th><th class="hide-m">Último uso</th><th>Vence</th><th class="r">Abrir</th></tr></thead>
      <tbody>${es.map((e) => `<tr class="click" data-act="editarEmpresa" data-id="${e.id}" data-busca="${esc(e.nome + ' ' + (e.dono || ''))}"><td><b>${esc(e.nome)}</b><div class="tiny muted">${esc(e.plano)}${e.valorMensal ? ' · ' + money0(e.valorMensal) : ''}</div></td><td>${badge(SIT[e.situacao]?.[0] || e.situacao, e.liberada ? SIT[e.situacao]?.[1] : 'crit')}</td><td class="hide-m small">${esc(e.dono || '—')}</td><td class="r">${int(e.usuarios)}</td><td class="r hide-m">${int(e.registros)}</td><td class="hide-m small">${e.ultimoUso ? date(e.ultimoUso.slice(0, 10)) : '—'}</td><td class="small">${date(e.situacao === 'teste' ? e.testeAte : e.pagoAte)}</td>
        <td class="r" style="white-space:nowrap"><button class="btn sm ghost" data-act="abrirEmpresa" data-id="${e.id}" data-modo="leitura" title="Abrir só para ver">Ver</button> <button class="btn sm ghost" data-act="abrirEmpresa" data-id="${e.id}" data-modo="edicao" title="Abrir para ver e corrigir">Corrigir</button></td></tr>`).join('') || `<tr><td colspan="8">${empty('Nenhuma empresa cadastrada ainda.')}</td></tr>`}</tbody></table></div></div>`;
  }
  function vPlataforma() {
    const html = `${pageHead('Plataforma', `Empresas que usam o ${esc(SEGMENTO.nome)}: situação, vencimento e uso. <b>Ver</b> e <b>Corrigir</b> abrem a empresa aqui no app, como o administrador dela vê, por 2 horas (fica no registro de atividades dela).`, busca('Buscar empresa…') + `<button class="btn ghost" data-act="recarregarPlataforma">${icon('refresh')}</button>`)}<div id="ea-plataforma"></div>`;
    return S() ? tela('Plataforma', html) : `<main class="main" style="margin:0 auto">${html}<div class="mt"><a href="#" data-act="logout">Sair</a></div></main>`;
  }
  function modalEmpresa(id) {
    const e = plat.dados.find((x) => x.id === id);
    modal({ title: esc(e.nome), body: `<form id="fpl" class="col">
      <div class="grid g2"><label class="field"><span>Situação</span><select class="input" name="situacao">${Object.entries(SIT).map(([k, [n]]) => `<option value="${k}" ${e.situacao === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field"><span>Plano</span><select class="input" name="plano"><option value="teste">Teste</option>${(SEGMENTO.planos || []).map((p) => `<option value="${p.id}" ${e.plano === p.id ? 'selected' : ''}>${esc(p.nome)} (${money0(p.preco)})</option>`).join('')}</select></label>
      <label class="field"><span>Teste até</span><input class="input" type="date" name="testeAte" value="${e.testeAte || ''}"></label>
      <label class="field"><span>Pago até</span><input class="input" type="date" name="pagoAte" value="${e.pagoAte || ''}"></label>
      <label class="field"><span>Valor mensal</span>${moneyInput('valor', e.valorMensal || 0)}</label></div>
      <label class="field"><span>Observações</span><textarea class="input" name="obs">${esc(e.obs || '')}</textarea></label>
      <div class="tiny muted">Administrador: ${esc(e.dono || '—')} · criada em ${date(e.criadoEm.slice(0, 10))} · ${int(e.gestores)} na Gestão (administrador e gestores), ${int(e.usuarios)} usuários no app de campo, ${int(e.registros)} registros. Ativa com "pago até" vencido há mais de 5 dias bloqueia as gravações.</div></form>`,
      foot: `<button class="btn ghost" data-act="conviteDono" style="margin-right:auto">${icon('plus')} Convite de administrador</button><button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="ok">Salvar</button>`,
      handlers: { conviteDono: async () => {
        try {
          const c = await store.rpc('plataforma_convite_dono', { p_empresa: id });
          modal({ title: 'Convite de administrador', body: `<div class="col"><div class="small">Quem usar este convite vira <b>administrador</b> (dono) de ${esc(e.nome)}. Vale 7 dias, uma vez só.</div><div class="grande center">${esc(c)}</div>
            <a class="btn" target="_blank" rel="noopener" href="${waLink('', msgConvite(c, e.nome, true))}">${icon('whatsapp')} Enviar pelo WhatsApp</a></div>` });
        } catch (err) { toast(err.message); }
      }, ok: async () => {
        const f = lerForm('fpl');
        try {
          await store.rpc('plataforma_atualizar', { p_empresa: id, p_situacao: f.situacao, p_plano: f.plano, p_teste_ate: f.testeAte || null, p_pago_ate: f.pagoAte || null, p_valor: parseMoney(f.valor) || null, p_obs: f.obs });
          closeModal(); toast('Empresa atualizada'); carregarPlataforma();
        } catch (err) { toast(err.message); }
      } } });
  }

  // ---------- Mais / conta ----------
  function vMais() {
    return tela('Mais', `<div class="card pad-0"><div class="list" style="padding:0 16px">${navItens().map(([h, ic, n]) => `<a class="li" href="${h}"><span class="avatar">${icon(ic)}</span><div class="grow t">${n}</div>${icon('arrowR', 'muted')}</a>`).join('')}
      <a class="li" href="#" data-act="install"><span class="avatar">${icon('download')}</span><div class="grow t">Instalar na tela inicial</div></a>
      <a class="li" href="#" data-act="atualizarApp"><span class="avatar">${icon('refresh')}</span><div class="grow"><div class="t">Procurar atualização</div><div class="s">Versão ${versaoApp()}</div></div></a>
      <a class="li" href="#" data-act="logout"><span class="avatar">${icon('logout')}</span><div class="grow t">Sair</div></a></div></div>`);
  }
  function vConta() {
    const s = S();
    return tela('Minha conta', `${pageHead('Minha conta')}<div class="card col">
      <div class="row"><div class="avatar">${esc(iniciais(def.nomeUsuario?.(s) || '?'))}</div><div><div class="t"><b>${esc(def.nomeUsuario?.(s) || '')}</b></div><div class="small muted">${esc(U.papel)} · ${esc(store.empresa()?.nome || s.meta.empresa || '')}</div></div></div>
      ${def.contaExtra?.(s) || ''}
      <div class="row wrap"><button class="btn ghost" data-act="install">${icon('download')} Instalar app</button><button class="btn ghost" data-act="atualizarApp">${icon('refresh')} Atualização</button><button class="btn ghost" data-act="logout">${icon('logout')} Sair</button></div>
      <div class="tiny muted">${syncBadge()} · versão ${versaoApp()}</div></div>`);
  }

  // ---------- Render ----------
  const ROTAS = [...def.rotas, ['/mais', vMais], ...(gestao ? [['/config', vConfig], ['/atividade', vAtividade], ['/plataforma', vPlataforma]] : [['/conta', vConta]])];
  function logado() {
    if (!S() || !store.perfil()) return false;
    if (!gestao && store.espelho) return store.modo === 'local' || store.ehGestao();
    return gestao ? store.ehGestao() : store.perfil()?.papel === 'usuario' && !!store.meuRef();
  }
  function render(view, params, pattern) {
    current = { view, params, pattern };
    resetCharts();
    const ok = logado();
    // desenvolvedor sem empresa (o normal): vai direto para a Plataforma
    if (gestao && !ok && store.ehAdmin() && !store.perfil()?.empresaId && pattern !== '/plataforma' && store.modo === 'nuvem') { entrarTestes(); return; }
    const adminSolto = gestao && pattern === '/plataforma' && store.ehAdmin();
    store.setSomenteLeitura(!!(ok && ((store.empresa() && !store.empresa().liberada) || store.suporte()?.modo === 'leitura' || (!gestao && store.espelho))));
    root.innerHTML = ok || adminSolto ? view(params) : gestao ? vLoginGestao() : vLoginUsuario();
    if (ok && buscas[pattern]) filtrarBusca(root, buscas[pattern]);
    if (ok && pattern === '/config') { pintarAcessos(); if (store.modo === 'nuvem') pintarEquipe(); }
    if (ok && pattern === '/atividade') carregarAtividade(params.query);
    if ((ok || adminSolto) && pattern === '/plataforma') { if (plat.dados) pintarPlataforma(); carregarPlataforma(); }
    mountCharts(root);
    def.aposRender?.(pattern, params);
    if (!ok) root.querySelector('[name=p0], [name=codigo], [name=email]')?.focus();
  }
  function rerender() { const y = scrollY; render(current.view, current.params, current.pattern); scrollTo(0, y); }
  const go = router(ROTAS.map(([p, v]) => [p, v]), render);

  // Desenvolvedor entrando direto no app: vai para a empresa de testes (criada na 1ª vez, com dados de demonstração)
  let testando = false;
  async function entrarTestes() {
    if (testando) return;
    testando = true;
    root.innerHTML = `<div class="ea-abertura">${tile}${nomeMarca}</div>`;
    try {
      await store.rpc('plataforma_empresa_testes');
      if (!(await store.reiniciar())) throw new Error('empresa de testes indisponível');
      if (COLECOES_SEG.every((c) => !(S()[c] || []).length)) preencherTestes();
      await def.aposEntrar?.();
      if (!location.hash || location.hash === '#/' || location.hash.startsWith('#/plataforma')) location.hash = INICIO;
    } catch (e) { console.warn(e); location.hash = '#/plataforma'; }
    testando = false;
    go();
  }
  const COLECOES_SEG = Object.keys(SEGMENTO.colecoes);
  function preencherTestes() { const d = seed(); store.commit((s) => { for (const c of COLECOES_SEG) s[c] = d[c] || []; }); }

  async function depoisDeEntrar() { if (!store.espelho) lembrar('entrada', tipo); await def.aposEntrar?.(); if (!location.hash || location.hash === '#/') location.hash = INICIO; go(); }
  const comAguarde = async (btn, fn) => { const b = btn?.querySelector?.('button.btn.lg, button.btn') || btn; if (b) b.disabled = true; try { await fn(); } catch (e) { toast(e.message); } finally { if (b) b.disabled = false; } };

  const comuns = {
    goto: (el) => (location.hash = el.dataset.h),
    busca: (el) => { buscas[current.pattern] = el.value; filtrarBusca(root, el.value); },
    step: stepHandler,
    qty: () => {},
    nada: () => {},
    back: () => (history.length > 1 ? history.back() : (location.hash = INICIO)),
    install: instalar,
    semBanner: () => { dispensarBanner(); rerender(); },
    atualizarApp: () => verificarAtualizacao(true),
    eaiAbrir: () => ia?.abrir(),
    eaiMais: () => { const itens = itensMais(); if (ia) ia.menuMais(itens, { aoEscolher: escolherMais }); else if (itens.length) escolherMais(itens[0]); },
    fecharEspelho: () => { window.close(); setTimeout(() => { location.href = new URL('../app/' + (store.modo === 'local' ? '?demo=1' : ''), location.href).href; }, 150); },
    logout: async () => {
      if (!gestao && store.espelho) return comuns.fecharEspelho(); ia?.limpar(); await store.sair(); telaLogin = 'entrar'; location.hash = INICIO; rerender(); },
    // login
    pin: (el) => { if (el.value && el.nextElementSibling) el.nextElementSibling.focus(); const f = el.form; if ([...f.querySelectorAll('.pin input')].every((i) => i.value)) f.requestSubmit(); },
    loginDemo: (f) => { const pin = [0, 1, 2, 3].map((i) => f.elements['p' + i].value).join(''); if (store.entrarDemoGestao(pin)) depoisDeEntrar(); else { toast('PIN incorreto'); f.reset(); f.elements.p0.focus(); } },
    telaLogin: (el) => { telaLogin = el.dataset.v; rerender(); },
    entrar: (f) => comAguarde(f, async () => { const ok = await store.entrarEmail(f.email.value.trim(), f.senha.value); lembrar('ultimo-email', f.email.value.trim()); if (!ok) telaLogin = 'empresa'; await depoisDeEntrar(); }),
    cadastrar: (f) => comAguarde(f, async () => {
      const temSessao = await store.cadastrar(f.email.value.trim(), f.senha.value);
      if (!temSessao) return modal({ title: 'Confirme seu e-mail', body: `<p class="small">Enviamos um link para <b>${esc(f.email.value)}</b>. Abra o e-mail, toque no link e depois entre com seu e-mail e senha.</p>` });
      await store.entrarEmail(f.email.value.trim(), f.senha.value); telaLogin = 'empresa'; rerender();
    }),
    criarEmpresa: (el) => comAguarde(el, async () => { const nome = el.form.empresa.value.trim(); if (nome.length < 2) throw new Error('Informe o nome da empresa'); await store.criarEmpresa(nome); toast('Empresa criada. Bem-vindo!'); await depoisDeEntrar(); }),
    usarConvite: (el) => comAguarde(el, async () => { await store.entrarConvite(el.form.convite.value.trim()); toast('Convite aceito'); await depoisDeEntrar(); }),
    abrirPlataforma: () => { location.hash = '#/plataforma'; go(); },
    trocarEntrada: (el) => { lembrar('entrada', el.dataset.v); const u = new URL(location.href); u.searchParams.delete('entrar'); u.hash = ''; location.replace(u.href); },
    empresaTestes: () => entrarTestes(),
    recomecarTestes: () => confirmar('Apagar o que está na empresa de testes e carregar os dados de demonstração de novo?', { ok: 'Recomeçar' }).then((y) => { if (y && interna()) { preencherTestes(); toast('Dados de teste recarregados'); } }),
    esqueci: () => modal({ title: 'Redefinir senha', body: '<form id="fes" class="col"><label class="field"><span>E-mail</span><input class="input" name="email" type="email"></label></form>', foot: '<button class="btn" data-act="ok">Enviar link</button>',
      handlers: { ok: async () => { try { await store.redefinirSenha(new FormData(document.getElementById('fes')).get('email')); closeModal(); toast('Link enviado para o seu e-mail'); } catch (e) { toast(e.message); } } } }),
    entrarCodigo: (f) => comAguarde(f, async () => { await store.entrarCodigo(f.codigo.value, f.pin.value); lembrar('ultimo-codigo', String(f.codigo.value).trim().toUpperCase()); if (store.modo === 'nuvem' || (await store.init(tipo))) await depoisDeEntrar(); }),
    // configurações
    salvarEmpresa: async (f) => {
      const d = lerForm(f);
      try {
        if (d.empresa && d.empresa !== (store.empresa()?.nome || S().meta.empresa)) await store.renomearEmpresa(d.empresa);
        const { empresa: _, ...resto } = d;
        store.commit((s) => Object.assign(s.meta, resto)); toast('Dados salvos');
      } catch (e) { toast(e.message); }
    },
    criarAcesso: async (el) => { const d = S()[U.colecao].find((x) => x.id === el.dataset.ref); try { await store.acessos.criar(d.id, d.nome); toast('Acesso criado'); pintarAcessos(); } catch (e) { toast(e.message); } },
    trocarPin: async (el) => { if (!(await confirmar('Gerar um PIN novo? Os aparelhos conectados com o PIN atual serão desconectados.', { ok: 'Gerar PIN' }))) return; try { await store.acessos.trocarPin(el.dataset.ref); toast('PIN trocado'); pintarAcessos(); } catch (e) { toast(e.message); } },
    bloquearAcesso: async (el) => { try { await store.acessos.ativar(el.dataset.ref, el.dataset.v === '1'); toast(el.dataset.v === '1' ? 'Acesso liberado' : 'Acesso bloqueado'); pintarAcessos(); } catch (e) { toast(e.message); } },
    copiarAcesso: (el) => { const a = document.getElementById('ea-acessos')._lista.find((x) => x.ref === el.dataset.ref); const d = S()[U.colecao].find((x) => x.id === el.dataset.ref); navigator.clipboard?.writeText(msgAcesso(a, d)); toast('Mensagem copiada'); },
    convidar: () => modal({ title: 'Convidar gestor', body: '<form id="fcv" class="col"><label class="field"><span>Nome (para você lembrar)</span><input class="input" name="nome"></label></form>', foot: '<button class="btn" data-act="ok">Gerar convite</button>',
      handlers: { ok: async () => { try { const c = await store.rpc('criar_convite', { p_nome: new FormData(document.getElementById('fcv')).get('nome') }); closeModal(); pintarEquipe();
        modal({ title: 'Convite criado', body: `<div class="col"><div class="grande center">${esc(c)}</div><a class="btn" target="_blank" rel="noopener" href="${waLink('', msgConvite(c))}">${icon('whatsapp')} Enviar pelo WhatsApp</a></div>` }); } catch (e) { toast(e.message); } } } }),
    removerGestor: async (el) => { if (!(await confirmar(`Remover o acesso de ${esc(el.dataset.e)}?`, { ok: 'Remover' }))) return; try { await store.rpc('remover_gestor', { p_user: el.dataset.u }); pintarEquipe(); toast('Acesso removido'); } catch (e) { toast(e.message); } },
    cancelarConvite: async (el) => { try { await store.rpc('cancelar_convite', { p_codigo: el.dataset.c }); pintarEquipe(); } catch (e) { toast(e.message); } },
    backup: () => download(`${SEGMENTO.id}-backup-${today()}.json`, store.exportJSON()),
    restore: (el) => { const file = el.files[0]; if (file) file.text().then((t) => { try { store.importJSON(t); toast('Backup restaurado'); } catch { toast('Arquivo inválido'); } }); },
    resetDemo: () => confirmar('Recarregar os dados de demonstração? O que foi lançado neste navegador será substituído.', { ok: 'Recarregar' }).then((y) => y && (store.reset(), toast('Demonstração recarregada'))),
    zerar: () => confirmar('Apagar todos os dados fictícios e começar do zero (só neste navegador)?', { ok: 'Começar do zero' }).then((y) => y && (store.reset({ vazio: true }), toast('Pronto, tudo zerado'))),
    // plataforma
    editarEmpresa: (el) => modalEmpresa(el.dataset.id),
    abrirEmpresa: (el) => abrirEmpresa(el.dataset.id, el.dataset.modo),
    sairSuporte: async () => { try { ia?.limpar(); const ok = await store.sairSuporte(); if (ok) await def.aposEntrar?.(); toast('Você saiu da empresa do cliente'); location.hash = ok ? INICIO : '#/plataforma'; go(); } catch (e) { toast(e.message); } },
    recarregarPlataforma: () => carregarPlataforma(),
  };
  delegate(root, new Proxy({}, { get: (_, k) => def.acoes?.[k] || comuns[k] }));

  store.subscribe((s, msg, externo, info) => {
    if (!S() || !current.view) return;
    def.aoMudar?.(msg, externo, info);
    if (msg === 'acessos') return pintarAcessos();
    if (document.querySelector('.overlay') && externo) return; // não fecha formulários abertos
    if (def.naoRedesenhar?.(current.pattern, externo)) return;
    rerender();
  });
  store.onErro((m) => toast('Não foi possível salvar: ' + m));
  store.onRecuperacao(() => modal({ title: 'Criar nova senha', body: '<form id="fns" class="col"><label class="field"><span>Nova senha (mínimo 8 caracteres)</span><input class="input" name="senha" type="password" minlength="8" autocomplete="new-password"></label></form>',
    foot: '<button class="btn" data-act="ok">Salvar senha</button>',
    handlers: { ok: async () => { const v = new FormData(document.getElementById('fns')).get('senha'); if (String(v).length < 8) return toast('Mínimo 8 caracteres'); try { await store.novaSenha(v); closeModal(); toast('Senha alterada'); } catch (e) { toast(e.message); } } } }));
  store.onStatus(() => { document.querySelectorAll('.sync').forEach((el) => { el.outerHTML = syncBadge(); }); });

  function iniciar() {
    registerSW();
    root.innerHTML = SEGMENTO.logo ? `<div class="login"><div class="marca" style="color:#fff">${esc(SEGMENTO.nome)}</div></div>` : `<div class="ea-abertura">${tile}${nomeMarca}</div>`;
    const erroLink = new URLSearchParams(location.hash.replace(/^#\/?/, '')).get('error_code');
    if (erroLink) history.replaceState(null, '', location.pathname + location.search);
    store.init(tipo).then(async (ok) => {
      if (ok) await def.aposEntrar?.();
      if (!location.hash || location.hash === '#/') location.hash = INICIO;
      go();
      if (erroLink) modal({ title: 'Link inválido ou expirado', body: '<p class="small">O link do e-mail já foi usado ou expirou. Tente entrar com seu e-mail e senha; se pedir confirmação, use "Criar conta" de novo para receber outro link.</p>' });
    });
  }

  return { S, tela, pageHead, busca, lerForm, rerender, iniciar, linkVer, linkUsuario, get current() { return current; }, store, U, ia };
}
