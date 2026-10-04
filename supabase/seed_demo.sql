-- =====================================================================
-- Mapa de Obras SINFRA: dados de DEMONSTRAÇÃO (10 obras fictícias)
--
-- Rodar depois do schema.sql. Remover com limpar_demo.sql antes da carga real.
--
-- Todas as datas são relativas ao dia em que o script roda, para que cada
-- obra caia na situação planejada no dia da demonstração. Com o passar dos
-- dias a situação muda naturalmente, como numa obra real.
--
-- Coordenadas das obras pontuais: centro dos bairros no OpenStreetMap
-- (Nominatim, 02/10/2026). Obras com trecho: ruas reais do OpenStreetMap
-- (consulta de 03/10/2026), recortadas, com o pino no meio do segmento mais
-- longo. As obras, empresas, contratos e valores são fictícios.
--
-- Situação esperada no dia da carga (tolerância de 10 pontos):
--   01 Centro           Concluída       100%, prazo já vencido
--   02 Bacuri           Não iniciada    início daqui a 20 dias
--   03 Nova Imperatriz  Atrasada        prazo vencido há 15 dias, 85%
--   04 Vila Lobão       Atrasada        50% do prazo, 25% executado
--   05 Santa Rita       Em dia          25% do prazo, 22% executado
--   06 Bom Sucesso      Em dia          33% do prazo, 40% executado (adiantada)
--   07 Vila Nova        Paralisada      sem documento: pendência documental
--   08 Parque Alvorada  Em dia          prorrogada por aditivo (com documento)
--   09 Vila Redenção    Em dia          + alerta: sem atualização há 18 dias
--   10 Santa Inês       Em dia          limite exato: 50% do prazo, 40% executado
-- =====================================================================

begin;

-- Horários de cadastro (meia-noite) no fuso de Imperatriz, qualquer que seja o
-- fuso da sessão (o Supabase e o GitHub Actions rodam em UTC).
set local time zone 'America/Fortaleza';

-- Dados fictícios não entram na auditoria (ela registra atos de usuários).
select set_config('app.sem_auditoria', 'on', true);

do $$
begin
  if exists (select 1 from public.obras where demo) then
    raise exception 'Os dados de demonstração já foram carregados.';
  end if;
end;
$$;

-- Lançamento de percentual com data no passado.
create function pg_temp.lancar(p_obra uuid, p_pct numeric, p_dias_atras integer, p_obs text default null)
returns void language sql as $$
  insert into public.atualizacoes (obra_id, percentual_executado, observacao, autor_nome, criado_em)
  values (p_obra, p_pct, p_obs, 'Fiscal (demonstração)',
          now() - make_interval(days => p_dias_atras));
$$;

-- Obra de demonstração com evento de cadastro e ordem de serviço.
create function pg_temp.obra(p_nome text, p_tipo text, p_bairro text, p_empresa text,
                             p_contrato text, p_valor numeric,
                             p_inicio integer, p_termino integer,
                             p_lat double precision, p_lon double precision,
                             p_fiscal text, p_termino_original integer default null,
                             p_trecho jsonb default null)
returns uuid language plpgsql as $$
declare
  d      date := public.hoje();
  v_id   uuid;
  v_doc  uuid;
  v_cad  date := least(d + p_inicio, d) - 5;
begin
  insert into public.obras (nome, tipo, bairro, empresa, numero_processo, numero_contrato,
                            valor_contrato, data_inicio, data_termino_prevista,
                            data_termino_original, latitude, longitude, trecho,
                            fiscal_responsavel, demo, criado_em)
  values (p_nome, p_tipo, p_bairro, p_empresa,
          case when p_contrato is not null then 'PA-DEMO-' || p_contrato end,
          p_contrato, p_valor, d + p_inicio, d + p_termino,
          d + coalesce(p_termino_original, p_termino),
          p_lat, p_lon, p_trecho, p_fiscal, true, v_cad::timestamptz)
  returning id into v_id;

  if p_contrato is not null then
    insert into public.documentos (obra_id, tipo, numero, numero_protocolo, data_protocolo,
                                   data_documento, orgao_origem, numero_processo, criado_em)
    values (v_id, 'ordem_servico', 'OS-DEMO-' || p_contrato, 'PROT-DEMO-' || p_contrato,
            v_cad, v_cad, 'SINFRA', 'PA-DEMO-' || p_contrato, v_cad::timestamptz)
    returning id into v_doc;
  end if;

  insert into public.eventos_obra (obra_id, tipo, data_evento, descricao, documento_id,
                                   autor_nome, criado_em)
  values (v_id, 'cadastro', v_cad, 'Obra cadastrada', v_doc,
          'Gabinete (demonstração)', v_cad::timestamptz);
  return v_id;
end;
$$;

do $$
declare
  d   date := public.hoje();
  o   uuid;
  doc uuid;
begin
  -- 01 Concluída
  o := pg_temp.obra('Revitalização da Praça do Centro', 'praca', 'Centro',
                    'Construtora Exemplo Ltda (fictícia)', '001/2026', 480000.00,
                    -150, -10, -5.5273, -47.4794, 'Eng. Fiscal Demonstração A');
  perform pg_temp.lancar(o, 30, 110);
  perform pg_temp.lancar(o, 70, 60);
  perform pg_temp.lancar(o, 100, 12, 'Serviços concluídos; aguardando recebimento provisório.');

  -- 02 Não iniciada
  o := pg_temp.obra('Drenagem pluvial no Bacuri', 'drenagem', 'Bacuri',
                    'Drenar Engenharia Ltda (fictícia)', '002/2026', 1250000.00,
                    20, 140, -5.536816, -47.479116, 'Eng. Fiscal Demonstração B',
                    p_trecho => '{"type":"LineString","coordinates":[[-47.477953,-5.537881],[-47.478941,-5.536997],[-47.479522,-5.536399],[-47.480249,-5.535719]]}'::jsonb);

  -- 03 Atrasada: prazo vencido
  o := pg_temp.obra('Pavimentação asfáltica de 3 ruas na Nova Imperatriz', 'pavimentacao', 'Nova Imperatriz',
                    'Pavimenta Fictícia S.A.', '003/2026', 3800000.00,
                    -210, -15, -5.514886, -47.487732, 'Eng. Fiscal Demonstração A',
                    p_trecho => '{"type":"MultiLineString","coordinates":[[[-47.489942,-5.515412],[-47.489742,-5.515219],[-47.489359,-5.514825],[-47.489026,-5.514519],[-47.488209,-5.513955],[-47.487402,-5.513457]],[[-47.486095,-5.513686],[-47.486854,-5.514224],[-47.487624,-5.514795],[-47.488394,-5.515445],[-47.489287,-5.516188]],[[-47.486393,-5.511745],[-47.487108,-5.512273],[-47.487862,-5.512794],[-47.488655,-5.513349],[-47.489324,-5.51385]]]}'::jsonb);
  perform pg_temp.lancar(o, 40, 120);
  perform pg_temp.lancar(o, 70, 50);
  perform pg_temp.lancar(o, 85, 5, 'Falta capa asfáltica em uma das ruas.');

  -- 04 Atrasada: desvio maior que a tolerância
  o := pg_temp.obra('Pavimentação em bloquete na Vila Lobão', 'pavimentacao', 'Vila Lobão',
                    'Pavimenta Fictícia S.A.', '004/2026', 620000.00,
                    -60, 60, -5.510821, -47.465645, 'Eng. Fiscal Demonstração B',
                    p_trecho => '{"type":"LineString","coordinates":[[-47.466807,-5.512151],[-47.466246,-5.511626],[-47.465694,-5.510899],[-47.465468,-5.51054],[-47.465109,-5.509941],[-47.464972,-5.509723],[-47.464801,-5.509431],[-47.464766,-5.509369],[-47.464717,-5.509312]]}'::jsonb);
  perform pg_temp.lancar(o, 10, 30);
  perform pg_temp.lancar(o, 25, 3, 'Equipe reduzida nas últimas semanas.');

  -- 05 Em dia
  o := pg_temp.obra('Construção de Unidade Básica de Saúde', 'edificacao', 'Santa Rita',
                    'Edifica Demonstração Ltda (fictícia)', '005/2026', 2100000.00,
                    -45, 135, -5.4992, -47.4914, 'Eng. Fiscal Demonstração C');
  perform pg_temp.lancar(o, 8, 25);
  perform pg_temp.lancar(o, 22, 4);

  -- 06 Em dia, adiantada
  o := pg_temp.obra('Iluminação pública em LED no Bom Sucesso', 'iluminacao', 'Bom Sucesso',
                    'Luz Exemplo Instalações (fictícia)', '006/2026', 390000.00,
                    -30, 60, -5.499481, -47.484589, 'Eng. Fiscal Demonstração C',
                    p_trecho => '{"type":"LineString","coordinates":[[-47.487248,-5.498242],[-47.486509,-5.498599],[-47.485942,-5.498872],[-47.484409,-5.499562],[-47.484094,-5.499715],[-47.484001,-5.499757],[-47.483906,-5.499808],[-47.483842,-5.499862],[-47.483779,-5.499929],[-47.483436,-5.500296],[-47.483164,-5.500572],[-47.483033,-5.500727],[-47.482745,-5.501067],[-47.482456,-5.501423]]}'::jsonb);
  perform pg_temp.lancar(o, 15, 16);
  perform pg_temp.lancar(o, 40, 2);

  -- 07 Paralisada, sem documento (pendência documental)
  o := pg_temp.obra('Galeria de drenagem na Vila Nova', 'drenagem', 'Vila Nova',
                    'Drenar Engenharia Ltda (fictícia)', '007/2026', 1750000.00,
                    -90, 90, -5.520454, -47.457195, 'Eng. Fiscal Demonstração A',
                    p_trecho => '{"type":"LineString","coordinates":[[-47.455821,-5.522723],[-47.456228,-5.521961],[-47.456637,-5.5212],[-47.456983,-5.520548],[-47.457034,-5.520508],[-47.457085,-5.52048],[-47.457207,-5.520452],[-47.457291,-5.520417],[-47.457412,-5.520344],[-47.457967,-5.519816],[-47.458807,-5.518922],[-47.459134,-5.518588]]}'::jsonb);
  perform pg_temp.lancar(o, 20, 40);
  perform pg_temp.lancar(o, 30, 14);
  update public.obras
     set paralisada = true,
         paralisada_desde = d - 12,
         motivo_paralisacao = 'Interferência com a rede de abastecimento de água; aguardando remanejamento pela concessionária.'
   where id = o;
  insert into public.eventos_obra (obra_id, tipo, data_evento, descricao, autor_nome, criado_em)
  values (o, 'paralisacao', d - 12,
          'Interferência com a rede de abastecimento de água; aguardando remanejamento pela concessionária.',
          'Fiscal (demonstração)', now() - interval '12 days');

  -- 08 Prorrogada por aditivo (término original d-5, vigente d+55), em dia
  o := pg_temp.obra('Pavimentação e drenagem no Parque Alvorada', 'pavimentacao', 'Parque Alvorada',
                    'Construtora Exemplo Ltda (fictícia)', '008/2026', 2950000.00,
                    -120, 55, -5.529378, -47.440738, 'Eng. Fiscal Demonstração B',
                    p_termino_original => -5,
                    p_trecho => '{"type":"LineString","coordinates":[[-47.441576,-5.532806],[-47.441567,-5.53279],[-47.441496,-5.532645],[-47.441358,-5.532424],[-47.441251,-5.532228],[-47.441188,-5.532115],[-47.441148,-5.532031],[-47.441082,-5.531826],[-47.440979,-5.531469],[-47.440966,-5.531411],[-47.440829,-5.531035],[-47.440791,-5.5309],[-47.440742,-5.530547],[-47.440735,-5.530414],[-47.440743,-5.530152],[-47.440745,-5.530045],[-47.440742,-5.529979],[-47.440738,-5.529679],[-47.440737,-5.529423],[-47.440741,-5.529231],[-47.440728,-5.529141],[-47.440736,-5.528907],[-47.440754,-5.528803],[-47.440775,-5.528725],[-47.440812,-5.528641],[-47.44086,-5.528582],[-47.44097,-5.528432],[-47.441195,-5.528135],[-47.441532,-5.527681],[-47.441863,-5.527237],[-47.442496,-5.526391],[-47.442521,-5.526357]]}'::jsonb);
  perform pg_temp.lancar(o, 30, 80);
  perform pg_temp.lancar(o, 55, 30);
  insert into public.documentos (obra_id, tipo, numero, numero_protocolo, data_protocolo,
                                 data_documento, orgao_origem, numero_processo, criado_em)
  values (o, 'termo_aditivo', '1º TA ao Contrato 008/2026 (DEMO)', 'PROT-DEMO-008-TA1',
          d - 10, d - 11, 'SINFRA', 'PA-DEMO-008/2026', now() - interval '10 days')
  returning id into doc;
  insert into public.eventos_obra (obra_id, tipo, data_evento, descricao, dados, documento_id,
                                   autor_nome, criado_em)
  values (o, 'aditivo_prazo', d - 10, 'Prorrogação de 60 dias por chuvas acima da média.',
          jsonb_build_object('termino_anterior', d - 5, 'termino_novo', d + 55),
          doc, 'Gabinete (demonstração)', now() - interval '10 days');
  perform pg_temp.lancar(o, 65, 6);

  -- 09 Em dia, mas sem atualização há 18 dias
  o := pg_temp.obra('Reforma e ampliação de escola municipal', 'edificacao', 'Vila Redenção',
                    'Edifica Demonstração Ltda (fictícia)', '009/2026', 1380000.00,
                    -50, 150, -5.5071, -47.4608, 'Eng. Fiscal Demonstração C');
  perform pg_temp.lancar(o, 10, 35);
  perform pg_temp.lancar(o, 20, 18);

  -- 10 Limite exato da tolerância (desvio = 10 pontos = em dia); sem contrato e sem valor
  o := pg_temp.obra('Construção de quadra poliesportiva', 'outro', 'Santa Inês',
                    'Esporte Obras Ltda (fictícia)', null, null,
                    -50, 50, -5.5036, -47.4984, null);
  perform pg_temp.lancar(o, 20, 25);
  perform pg_temp.lancar(o, 40, 1);
end;
$$;

commit;
