// Formulários e cadastros a partir de uma lista de campos — o atalho para telas de cadastro.
//
//   const CAMPOS = [
//     { k: 'nome', label: 'Nome', obrig: true },
//     { k: 'telefone', label: 'WhatsApp', tipo: 'tel' },
//     { k: 'valor', label: 'Valor', tipo: 'money' },
//     { k: 'tipo', label: 'Tipo', tipo: 'select', opcoes: [['a', 'Opção A'], ['b', 'Opção B']] },
//   ];
//   editar({ titulo: 'Cliente', colecao: 'clientes', campos: CAMPOS, doc });   // novo (doc null) ou edição
//   editar({ ..., inicial: { clienteId } })                                       // novo já preenchido
//
// Tipos: text (padrão) | tel | email | number | inteiro (ponto de milhar: km, hodômetro) | money | date | select | textarea | checkbox
// Opções extras de cada campo: ph (placeholder), dica, col: 2 (ocupa a linha toda), padrao, min, max, passo,
// se: (valores) => boolean (só mostra quando…), opcoes também pode ser função (s) => [[v, label]].

import * as store from './store.js';
import { esc, uid } from './fmt.js';
import { modal, closeModal, confirmar, toast, moneyInput, parseMoney, intInput, parseInt0, icon } from './ui.js';

const valorInicial = (c, doc) => (doc && doc[c.k] !== undefined ? doc[c.k] : typeof c.padrao === 'function' ? c.padrao() : c.padrao ?? '');

export function campoHTML(c, doc, s = store.get()) {
  const v = valorInicial(c, doc);
  const req = c.obrig ? 'required' : '';
  const ph = c.ph ? `placeholder="${esc(c.ph)}"` : '';
  let input;
  switch (c.tipo) {
    case 'money': input = moneyInput(c.k, v || 0, { width: '100%' }); break;
    case 'inteiro': input = intInput(c.k, v, `${req} ${ph}`); break;
    case 'number': input = `<input class="input num" type="number" inputmode="decimal" name="${c.k}" value="${esc(v)}" ${c.min != null ? `min="${c.min}"` : ''} ${c.max != null ? `max="${c.max}"` : ''} step="${c.passo || 'any'}" ${req} ${ph}>`; break;
    case 'date': input = `<input class="input" type="date" name="${c.k}" value="${esc(v)}" ${req}>`; break;
    case 'textarea': input = `<textarea class="input" name="${c.k}" ${req} ${ph}>${esc(v)}</textarea>`; break;
    case 'checkbox': return `<label class="row small" style="${c.col === 2 ? 'grid-column:1/-1' : ''}"><input type="checkbox" name="${c.k}" ${v ? 'checked' : ''}> ${c.label}</label>`;
    case 'select': {
      const ops = typeof c.opcoes === 'function' ? c.opcoes(s) : c.opcoes || [];
      input = `<select class="input" name="${c.k}" ${req}>${c.obrig ? '' : '<option value="">—</option>'}${ops.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`; break;
    }
    default: input = `<input class="input" type="${c.tipo || 'text'}" name="${c.k}" value="${esc(v)}" ${c.tipo === 'tel' ? 'inputmode="tel"' : ''} ${req} ${ph} ${c.maiusculas ? 'style="text-transform:uppercase"' : ''}>`;
  }
  return `<label class="field" style="${c.col === 2 ? 'grid-column:1/-1' : ''}"><span>${c.label}${c.obrig ? ' *' : ''}</span>${input}${c.dica ? `<span class="tiny muted" style="font-weight:400">${c.dica}</span>` : ''}</label>`;
}

export const formHTML = (id, campos, doc) => `<form id="${id}" class="grid g2" style="gap:12px" onsubmit="return false">${campos.filter((c) => !c.se || c.se(doc || {})).map((c) => campoHTML(c, doc)).join('')}</form>`;

// Lê o formulário convertendo os tipos; devolve { dados, erro }
export function lerCampos(id, campos) {
  const f = document.getElementById(id);
  const dados = {};
  for (const c of campos) {
    const el = f.elements[c.k];
    if (!el) continue;
    let v;
    if (c.tipo === 'checkbox') v = el.checked;
    else if (c.tipo === 'money') v = parseMoney(el.value);
    else if (c.tipo === 'inteiro') v = parseInt0(el.value);
    else if (c.tipo === 'number') v = el.value === '' ? null : +String(el.value).replace(',', '.');
    else v = String(el.value ?? '').trim();
    if (c.maiusculas && typeof v === 'string') v = v.toUpperCase();
    if (c.obrig && (v === '' || v == null || (c.tipo === 'money' && !v && c.min > 0))) return { dados, erro: `Preencha: ${c.label}` };
    dados[c.k] = v;
  }
  return { dados };
}

// Cadastro completo (novo ou edição) de um documento de uma coleção
// antesDeApagar(doc): devolva um texto para impedir a exclusão (ex.: registro ainda usado em outro lugar)
export function editar({ titulo, colecao, campos, doc = null, inicial = null, prefixo = colecao.slice(0, 2), antesDeSalvar, antesDeApagar, onSalvo, apagar = true, extra = '', largo = true }) {
  const novo = !doc;
  modal({
    title: (novo ? 'Novo: ' : '') + titulo, wide: largo,
    body: formHTML('fed', campos, doc || inicial) + extra,
    foot: `${!novo && apagar ? `<button class="btn ghost" data-act="apagar" style="margin-right:auto;color:var(--crit)">${icon('trash')} Excluir</button>` : ''}<button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="salvar">Salvar</button>`,
    handlers: {
      salvar: () => {
        const { dados, erro } = lerCampos('fed', campos);
        if (erro) return toast(erro);
        const final = { ...(doc || { id: uid(prefixo), criadoEm: new Date().toISOString() }), ...dados };
        const msg = antesDeSalvar?.(final, doc);
        if (typeof msg === 'string') return toast(msg);
        const ok = store.commit((s) => { const arr = s[colecao]; const i = arr.findIndex((x) => x.id === final.id); if (i >= 0) arr[i] = final; else arr.push(final); });
        if (ok === false) return;
        closeModal(); toast(novo ? `${titulo}: cadastrado` : 'Alterações salvas');
        onSalvo?.(final, novo);
      },
      apagar: async () => {
        const bloqueio = antesDeApagar?.(doc);
        if (bloqueio) return confirmar(bloqueio, { ok: 'Entendi', titulo: 'Não dá para excluir' });
        if (!(await confirmar(`Apagar este registro de ${esc(titulo.toLowerCase())}? Não dá para desfazer.`, { ok: 'Apagar' }))) return;
        store.commit((s) => { s[colecao] = s[colecao].filter((x) => x.id !== doc.id); });
        toast('Apagado'); onSalvo?.(null, false);
      },
    },
  });
}
