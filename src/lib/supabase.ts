import { createClient } from '@supabase/supabase-js';

// Projeto Supabase reaproveitado (cardapio-digital-ditado) — tabelas do RR Bares usam prefixo rr_
const SUPABASE_URL = 'https://uazjtiafdcrhhadaucbd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AroaD7ZT3x12EL1DgjGWGw_k4sFYRdF';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const BUCKET_COMPROVANTES = 'rr-comprovantes';
