// Formatação e utilidades gerais (pt-BR)

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('pt-BR');
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

export const money = (v) => brl.format(v || 0);
export const money0 = (v) => brl0.format(Math.round(v || 0));
export const moneyK = (v) => {
  const a = Math.abs(v || 0);
  if (a >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (a >= 1e4) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return money0(v);
};
export const int = (v) => num.format(Math.round(v || 0));
export const percent = (v) => pct.format(v || 0);

// Datas são guardadas como 'YYYY-MM-DD' (dia local)
export const iso = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const parse = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => iso(new Date());
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 86400000);
export const date = (s) => s ? parse(s).toLocaleDateString('pt-BR') : '—';
export const dateShort = (s) => s ? parse(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') : '—';
export const monthKey = (s) => s.slice(0, 7);
export const monthLabel = (k) => {
  const [y, m] = k.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(y).slice(2);
};
export const relDays = (s) => {
  const n = diffDays(s, today());
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
};

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (f(x) || 0), 0);
export const groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] ||= []).push(x); return m; }, {});
export const sortBy = (arr, f, desc = false) => [...arr].sort((a, b) => (f(a) > f(b) ? 1 : f(a) < f(b) ? -1 : 0) * (desc ? -1 : 1));
export const plural = (n, s, p) => `${int(n)} ${Math.abs(n) === 1 ? s : (p || s + 's')}`;
