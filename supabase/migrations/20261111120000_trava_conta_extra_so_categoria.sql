-- A trava de extra pegava salário, férias e vale de colaborador cujo cadastro é do tipo "extra".
-- Agora olha a categoria: só barra conta avulsa em categoria de extra (ou sem categoria, em cadastro de extra).
create or replace function public.fn_contas_pagar_trava_extra()
returns trigger language plpgsql set search_path = public as $$
begin
  if not (new.origem_modulo = 'outros' and new.origem_id is not null)
     and (new.categoria_id in (select categoria_financeira_id from extras_tipos where categoria_financeira_id is not null
                               union select '6f030239-f3df-4ecd-a5c6-2aaa3992669b'::uuid)
          or (new.categoria_id is null and exists (select 1 from fornecedores f where f.id = new.fornecedor_id and f.tipo = 'extra'))) then
    raise exception 'Conta de extra nasce da diária no módulo Extras. Use "Pagar conta aberta" e escolha a diária. Salário, férias e vale: escolha a categoria certa.';
  end if;
  return new;
end $$;
