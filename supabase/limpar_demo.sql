-- =====================================================================
-- Mapa de Obras SINFRA: remove os dados de DEMONSTRAÇÃO
--
-- Rodar no SQL Editor antes da carga real. Apaga somente obras com
-- demo = true e tudo o que pende delas (lançamentos, eventos, documentos e
-- as linhas de auditoria correspondentes). Deixa uma única linha de
-- auditoria registrando a limpeza.
-- =====================================================================

begin;

create temp table _demo on commit drop as
  select id from public.obras where demo;

create temp table _demo_docs on commit drop as
  select id from public.documentos where obra_id in (select id from _demo);

create temp table _demo_orcamentos on commit drop as
  select id from public.orcamentos where obra_id in (select id from _demo);

-- Desliga a auditoria apenas nesta transação.
select set_config('app.sem_auditoria', 'on', true);

delete from public.auditoria a
 where coalesce(a.depois, a.antes) ->> 'obra_id' in (select id::text from _demo)
    or (a.tabela = 'obras'      and a.registro_id in (select id::text from _demo))
    or (a.tabela = 'documentos' and a.registro_id in (select id::text from _demo_docs))
    or (a.tabela in ('orcamentos', 'orcamento_itens')
        and (a.registro_id in (select id::text from _demo_orcamentos)
             or coalesce(a.depois, a.antes) ->> 'orcamento_id' in (select id::text from _demo_orcamentos)));

delete from public.documentos_gerados where obra_id in (select id from _demo);
delete from public.orcamento_itens    where orcamento_id in (select id from _demo_orcamentos);
delete from public.orcamentos         where id in (select id from _demo_orcamentos);
delete from public.eventos_obra where obra_id in (select id from _demo);
delete from public.atualizacoes where obra_id in (select id from _demo);
delete from public.documentos   where id in (select id from _demo_docs);
delete from public.obras        where id in (select id from _demo);

select set_config('app.sem_auditoria', '', true);

insert into public.auditoria (tabela, registro_id, operacao, usuario_id, depois)
select 'obras', null, 'LIMPEZA_DEMO', null,
       jsonb_build_object('obras_removidas', (select count(*) from _demo));

commit;
