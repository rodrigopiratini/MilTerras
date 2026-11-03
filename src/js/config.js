// Conexão com o banco na nuvem (Supabase › Project Settings › API).
// A chave "publishable"/"anon" é pública por natureza: quem protege os dados são as regras
// de segurança instaladas por supabase/instalar.sql. NUNCA coloque aqui a chave "service_role"/"secret".
// Com os campos vazios, os apps funcionam no modo local (dados só neste navegador).
export const CONFIG = {
  supabaseUrl: 'https://sizbmkvzcqiukprdlxxr.supabase.co',
  schema: 'milterras', // pasta da Mil Terras no projeto easyapp-fabrica
  supabaseKey: 'sb_publishable_q_RZZb3Uoz5DTweHbSueTA_MsvHJmVj',
};
