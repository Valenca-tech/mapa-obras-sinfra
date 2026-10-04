-- =====================================================================
-- Mapa de Obras SINFRA: schema do banco (Supabase / Postgres 15+)
--
-- Rodar inteiro, uma única vez, no SQL Editor de um projeto Supabase novo.
-- Depois, opcionalmente, rodar seed_demo.sql (dados fictícios) e, antes da
-- carga real, limpar_demo.sql.
--
-- Princípios:
--   * nada se apaga: não há DELETE liberado para nenhum usuário;
--   * autor e data são gravados pelo banco, nunca pelo navegador;
--   * todo ato formal aponta para um documento (nº, protocolo, data) ou
--     fica marcado como pendência documental;
--   * toda alteração gera linha na tabela auditoria.
--
-- Atenção ao criar tabelas novas no futuro: o Supabase concede, por padrão,
-- todos os privilégios a anon e authenticated. Toda migração deve repetir o
-- bloco de REVOKE da seção 9 para as tabelas e funções que criar.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Papéis, permissões e perfis de usuário
-- ---------------------------------------------------------------------

create table public.papeis (
  codigo     text primary key,
  nome       text not null,
  descricao  text
);

create table public.permissoes (
  codigo     text primary key,
  descricao  text not null
);

create table public.papel_permissoes (
  papel      text not null references public.papeis (codigo) on update cascade,
  permissao  text not null references public.permissoes (codigo) on update cascade,
  primary key (papel, permissao)
);

-- Um registro por usuário do Supabase Auth, criado automaticamente (seção 8.1),
-- já DESATIVADO: só ganha acesso quando a Concretta define papel e ativo = true.
-- Assim, mesmo que o cadastro público seja religado por engano, quem se
-- cadastrar sozinho não vê nada. Usuário não se exclui: desativa-se, para
-- preservar a autoria do histórico.
create table public.perfis (
  id         uuid primary key references auth.users (id) on delete restrict,
  nome       text not null,
  papel      text not null default 'leitura' references public.papeis (codigo),
  ativo      boolean not null default false,
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Configuração e tabelas de apoio
-- ---------------------------------------------------------------------

create table public.configuracao (
  id                           boolean primary key default true,
  tolerancia_atraso_pontos     numeric(5,2) not null default 10,
  dias_sem_atualizacao_alerta  integer not null default 10,
  -- Papel timbrado e assinatura dos documentos gerados (o secretário mantém).
  orgao_nome                   text not null default 'Secretaria Municipal de Infraestrutura e Serviços Públicos',
  orgao_sigla                  text not null default 'SINFRA',
  orgao_endereco               text,
  orgao_telefone               text,
  orgao_email                  text,
  prefeitura_cnpj              text,
  secretario_nome              text,
  secretario_cargo             text not null default 'Secretário Municipal de Infraestrutura e Serviços Públicos',
  secretario_matricula         text,
  secretario_ato               text, -- ato de nomeação (ex.: 'Portaria nº 12/2025-GAB')
  atualizado_em                timestamptz not null default now(),
  constraint configuracao_linha_unica check (id),
  constraint configuracao_tolerancia_valida check (tolerancia_atraso_pontos between 0 and 100),
  constraint configuracao_dias_validos check (dias_sem_atualizacao_alerta > 0)
);

create table public.tipos_obra (
  codigo  text primary key,
  nome    text not null,
  ordem   integer not null default 0,
  ativo   boolean not null default true
);

create table public.tipos_documento (
  codigo  text primary key,
  nome    text not null,
  ordem   integer not null default 0,
  ativo   boolean not null default true
);

create table public.tipos_instalacao (
  codigo  text primary key,
  nome    text not null,
  grupo   text not null default 'Outros', -- área (Educação, Saúde...): organiza a escolha no mapa
  ordem   integer not null default 0,
  ativo   boolean not null default true
);

-- ---------------------------------------------------------------------
-- 2b. Instalações públicas da Prefeitura (sede, pátio de máquinas, usina,
--     almoxarifado, escolas, unidades de saúde, praças...): referência no
--     mapa e vínculo opcional com obras. Não se excluem: desativam-se.
-- ---------------------------------------------------------------------

create table public.instalacoes (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  tipo           text not null references public.tipos_instalacao (codigo),
  bairro         text,
  endereco       text,
  observacao     text,
  latitude       double precision not null,
  longitude      double precision not null,
  ativa          boolean not null default true,
  criado_por     uuid default auth.uid() references public.perfis (id),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  constraint instalacoes_nome_obrigatorio check (length(btrim(nome)) > 0),
  constraint instalacoes_latitude_valida  check (latitude between -90 and 90),
  constraint instalacoes_longitude_valida check (longitude between -180 and 180)
);

-- ---------------------------------------------------------------------
-- 3. Obras
-- ---------------------------------------------------------------------

create table public.obras (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null,
  tipo                   text not null references public.tipos_obra (codigo),
  bairro                 text,
  empresa                text,
  numero_processo        text,
  numero_contrato        text,
  valor_contrato         numeric(14,2),
  data_inicio            date not null,
  -- término vigente: muda por aditivo de prazo
  data_termino_prevista  date not null,
  -- término do contrato original: preenchido no cadastro e preservado
  data_termino_original  date not null,
  -- ponto da obra no mapa (o pino). Em obra com trecho, é o meio do trecho.
  latitude               double precision not null,
  longitude              double precision not null,
  -- trecho de via (pavimentação, drenagem...): GeoJSON LineString ou
  -- MultiLineString, coordenadas [longitude, latitude]. Nulo = obra pontual.
  trecho                 jsonb,
  -- instalação pública atendida pela obra (reforma de escola, praça...)
  instalacao_id          uuid references public.instalacoes (id),
  empresa_cnpj           text,
  fiscal_responsavel     text,
  -- para a assinatura do fiscal nas declarações (ex.: 'Engenheiro Civil', 'CREA-MA 1234567')
  fiscal_titulo          text,
  fiscal_registro        text,
  fiscal_matricula       text,

  -- mantidos pelo banco (gatilhos e funções); o usuário não edita
  percentual_executado   numeric(5,2) not null default 0,
  ultima_atualizacao_em  timestamptz,
  paralisada             boolean not null default false,
  paralisada_desde       date,
  motivo_paralisacao     text,
  arquivada              boolean not null default false,
  arquivada_em           timestamptz,
  demo                   boolean not null default false,
  criado_por             uuid references public.perfis (id),
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),

  constraint obras_nome_obrigatorio      check (length(btrim(nome)) > 0),
  constraint obras_termino_apos_inicio   check (data_termino_prevista > data_inicio),
  constraint obras_original_apos_inicio  check (data_termino_original > data_inicio),
  constraint obras_valor_nao_negativo    check (valor_contrato is null or valor_contrato >= 0),
  constraint obras_latitude_valida       check (latitude between -90 and 90),
  constraint obras_longitude_valida      check (longitude between -180 and 180),
  constraint obras_percentual_valido     check (percentual_executado between 0 and 100),
  constraint obras_paralisacao_coerente  check (paralisada = (paralisada_desde is not null)),
  constraint obras_arquivamento_coerente check (arquivada = (arquivada_em is not null)),
  -- ano entre 2000 e 2099: barra ano digitado com 2 ou 5 dígitos (0026, 20266)
  constraint obras_datas_plausiveis      check (
    data_inicio           between date '2000-01-01' and date '2099-12-31' and
    data_termino_prevista between date '2000-01-01' and date '2099-12-31' and
    data_termino_original between date '2000-01-01' and date '2099-12-31' and
    (paralisada_desde is null or paralisada_desde between date '2000-01-01' and date '2099-12-31'))
);

-- ---------------------------------------------------------------------
-- 4. Documentos de suporte (protocolo para auditoria)
-- ---------------------------------------------------------------------

-- Um documento fica "pendente" enquanto não tiver número e número de
-- protocolo. A partir do módulo M2, ganha também o arquivo anexo.
create table public.documentos (
  id                uuid primary key default gen_random_uuid(),
  obra_id           uuid references public.obras (id) on delete restrict,
  tipo              text not null references public.tipos_documento (codigo),
  numero            text,
  numero_protocolo  text,
  data_protocolo    date,
  data_documento    date,
  orgao_origem      text,
  numero_processo   text,
  observacao        text,
  pendente          boolean generated always as (numero is null or numero_protocolo is null) stored,
  criado_por        uuid references public.perfis (id),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz,
  constraint documentos_datas_plausiveis check (
    (data_protocolo is null or data_protocolo between date '2000-01-01' and date '2099-12-31') and
    (data_documento is null or data_documento between date '2000-01-01' and date '2099-12-31'))
);

create index documentos_obra_idx on public.documentos (obra_id);

-- ---------------------------------------------------------------------
-- 4b. Planilha de serviços da obra (orçamento do contrato)
--     Importada do Excel do contrato. Cada importação é uma versão nova; a
--     anterior fica guardada (inativa). Etapas agrupam itens (serviços ou
--     materiais), na ordem da planilha.
-- ---------------------------------------------------------------------

create table public.orcamentos (
  id              uuid primary key default gen_random_uuid(),
  obra_id         uuid not null references public.obras (id) on delete restrict,
  descricao       text not null default 'Planilha orçamentária do contrato',
  data_base       text,              -- referência de preços, ex.: 'SINAPI 03/2026 desonerado'
  bdi_percentual  numeric(6,2),
  arquivo_origem  text,              -- nome do arquivo importado
  ativo           boolean not null default true,
  criado_por      uuid default auth.uid() references public.perfis (id),
  criado_em       timestamptz not null default now(),
  constraint orcamentos_bdi_valido check (bdi_percentual is null or bdi_percentual between 0 and 100)
);

-- Uma planilha vigente por obra.
create unique index orcamentos_um_ativo_por_obra on public.orcamentos (obra_id) where ativo;

create table public.orcamento_itens (
  id              uuid primary key default gen_random_uuid(),
  orcamento_id    uuid not null references public.orcamentos (id) on delete restrict,
  ordem           integer not null,
  nivel           text not null default 'item',      -- 'etapa' (título) ou 'item'
  numero          text,                              -- '1', '1.1', '1.1.2'
  codigo          text,                              -- código na tabela de referência
  fonte           text,                              -- SINAPI, SICRO, ORSE, próprio...
  descricao       text not null,
  unidade         text,
  quantidade      numeric(16,4),
  preco_unitario  numeric(16,2),
  total           numeric(16,2),
  tipo            text not null default 'servico',   -- servico, material, equipamento, outro
  removido        boolean not null default false,    -- item tirado da planilha (não se apaga)
  atualizado_em   timestamptz,
  constraint orcamento_itens_nivel_valido check (nivel in ('etapa', 'item')),
  constraint orcamento_itens_tipo_valido check (tipo in ('servico', 'material', 'equipamento', 'outro')),
  constraint orcamento_itens_descricao_obrigatoria check (length(btrim(descricao)) > 0)
);

create index orcamento_itens_orcamento_idx on public.orcamento_itens (orcamento_id, ordem);

-- ---------------------------------------------------------------------
-- 4c. Documentos gerados pela ferramenta (declaração, atestado, ficha,
--     planilha). Cada emissão recebe número de controle por tipo e ano e
--     guarda o retrato do conteúdo emitido (para reemitir igual).
-- ---------------------------------------------------------------------

create table public.documentos_gerados (
  id                uuid primary key default gen_random_uuid(),
  obra_id           uuid not null references public.obras (id) on delete restrict,
  tipo              text not null,
  ano               integer not null,
  numero            integer not null,
  numero_protocolo  text,
  dados             jsonb not null default '{}'::jsonb,
  gerado_por        uuid default auth.uid() references public.perfis (id),
  gerado_por_nome   text not null,
  gerado_em         timestamptz not null default now(),
  constraint documentos_gerados_tipo_valido check (tipo in (
    'declaracao_andamento', 'atestado_capacidade', 'ficha_tecnica', 'planilha_servicos'
  )),
  constraint documentos_gerados_numero_unico unique (tipo, ano, numero)
);

create index documentos_gerados_obra_idx on public.documentos_gerados (obra_id, gerado_em desc);

-- ---------------------------------------------------------------------
-- 5. Histórico: lançamentos de percentual e eventos da obra
-- ---------------------------------------------------------------------

-- Somente inserção. Correção de valor errado = novo lançamento.
create table public.atualizacoes (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               uuid not null references public.obras (id) on delete restrict,
  percentual_executado  numeric(5,2) not null,
  percentual_anterior   numeric(5,2),
  observacao            text,
  autor_id              uuid default auth.uid() references public.perfis (id),
  autor_nome            text not null,
  criado_em             timestamptz not null default now(),
  constraint atualizacoes_percentual_valido check (percentual_executado between 0 and 100)
);

-- Único: a mesma obra duas vezes no mesmo lançamento (mesmo instante) deixaria
-- o histórico ambíguo sobre qual valor vale.
create unique index atualizacoes_obra_momento_unico on public.atualizacoes (obra_id, criado_em desc);

-- Linha do tempo da obra. Somente inserção; o único ajuste posterior permitido
-- é vincular o documento (função completar_documento).
create table public.eventos_obra (
  id            uuid primary key default gen_random_uuid(),
  obra_id       uuid not null references public.obras (id) on delete restrict,
  tipo          text not null,
  data_evento   date not null,
  descricao     text,
  dados         jsonb not null default '{}'::jsonb,
  documento_id  uuid references public.documentos (id),
  autor_id      uuid references public.perfis (id),
  autor_nome    text not null,
  criado_em     timestamptz not null default now(),
  constraint eventos_tipo_valido check (tipo in (
    'cadastro', 'aditivo_prazo', 'paralisacao', 'retomada', 'arquivamento', 'desarquivamento'
  )),
  constraint eventos_data_plausivel check (data_evento between date '2000-01-01' and date '2099-12-31')
);

create index eventos_obra_idx on public.eventos_obra (obra_id, criado_em);

-- ---------------------------------------------------------------------
-- 6. Auditoria
-- ---------------------------------------------------------------------

create table public.auditoria (
  id           bigint generated always as identity primary key,
  tabela       text not null,
  registro_id  text,
  operacao     text not null,
  usuario_id   uuid,
  em           timestamptz not null default now(),
  antes        jsonb,
  depois       jsonb
);

create index auditoria_registro_idx on public.auditoria (tabela, registro_id);

-- ---------------------------------------------------------------------
-- 7. Dados de referência (antes dos gatilhos de auditoria)
-- ---------------------------------------------------------------------

insert into public.papeis (codigo, nome, descricao) values
  ('secretario', 'Secretário',              'Acesso total, inclusive a permissões de módulos futuros'),
  ('admin',      'Administrador (gabinete)', 'Cadastra e mantém as obras'),
  ('fiscal',     'Fiscal',                  'Lança o percentual executado e registra paralisação'),
  ('leitura',    'Leitura',                 'Somente consulta');

insert into public.permissoes (codigo, descricao) values
  ('obra.cadastrar',       'Cadastrar obra'),
  ('obra.editar',          'Editar dados cadastrais da obra'),
  ('obra.aditivo',         'Registrar aditivo de prazo'),
  ('obra.paralisar',       'Paralisar e retomar obra'),
  ('obra.arquivar',        'Arquivar e desarquivar obra'),
  ('percentual.lancar',    'Lançar percentual executado'),
  ('documento.editar',     'Completar dados de documento de suporte'),
  ('configuracao.editar',  'Alterar a configuração (regra de situação, dados do órgão e do secretário)'),
  ('auditoria.ver',        'Consultar o registro de auditoria'),
  ('perfis.ver',           'Ver a lista de usuários'),
  ('instalacao.editar',    'Cadastrar e editar instalações públicas'),
  ('orcamento.editar',     'Importar e corrigir a planilha de serviços da obra'),
  ('documento.gerar',      'Gerar declaração, atestado, ficha técnica e planilha da obra');

-- O secretário não precisa de linhas aqui: tem_permissao() libera tudo para ele.
insert into public.papel_permissoes (papel, permissao) values
  ('admin',  'obra.cadastrar'),
  ('admin',  'obra.editar'),
  ('admin',  'obra.aditivo'),
  ('admin',  'obra.paralisar'),
  ('admin',  'obra.arquivar'),
  ('admin',  'percentual.lancar'),
  ('admin',  'documento.editar'),
  ('admin',  'perfis.ver'),
  ('admin',  'instalacao.editar'),
  ('admin',  'orcamento.editar'),
  ('admin',  'documento.gerar'),
  ('fiscal', 'obra.paralisar'),
  ('fiscal', 'percentual.lancar'),
  ('fiscal', 'documento.editar'),
  ('fiscal', 'documento.gerar');

-- Dados públicos do órgão (site da Prefeitura, outubro de 2026). O CNPJ é o
-- do Município (a SINFRA não tem CNPJ próprio). O secretário confere e
-- completa (nome, matrícula, ato de nomeação) na tela Configuração.
insert into public.configuracao (orgao_endereco, orgao_telefone, orgao_email, prefeitura_cnpj)
values ('Rua Y, s/nº, Nova Imperatriz, CEP 65.907-180, Imperatriz-MA', '(99) 98453-1653',
        'sinfra@imperatriz.ma.gov.br', '06.158.455/0001-16');

-- Lista provisória, a confirmar com a SINFRA.
insert into public.tipos_obra (codigo, nome, ordem) values
  ('pavimentacao', 'Pavimentação', 1),
  ('drenagem',     'Drenagem',     2),
  ('edificacao',   'Edificação',   3),
  ('iluminacao',   'Iluminação',   4),
  ('praca',        'Praça',        5),
  ('outro',        'Outro',        99);

insert into public.tipos_documento (codigo, nome, ordem) values
  ('ordem_servico',     'Ordem de serviço',      1),
  ('termo_aditivo',     'Termo aditivo',         2),
  ('ordem_paralisacao', 'Ordem de paralisação',  3),
  ('ordem_reinicio',    'Ordem de reinício',     4),
  ('oficio',            'Ofício',                5),
  ('memorando',         'Memorando',             6),
  ('despacho',          'Despacho',              7),
  ('outro',             'Outro',                 99);

-- Prédios e espaços públicos do Município, por área (grupo). Na camada do
-- mapa cada tipo pode ser ligado ou desligado.
insert into public.tipos_instalacao (codigo, nome, grupo, ordem) values
  ('sede',           'Prefeitura e secretarias',                   'Administração e serviços urbanos', 1),
  ('patio',          'Pátio de máquinas e garagem',                'Administração e serviços urbanos', 2),
  ('usina',          'Usina de asfalto',                           'Administração e serviços urbanos', 3),
  ('almoxarifado',   'Almoxarifado, depósito e galpão',            'Administração e serviços urbanos', 4),
  ('escola',         'Escola municipal',                           'Educação',                         10),
  ('creche',         'Creche e educação infantil',                 'Educação',                         11),
  ('ubs',            'Unidade Básica de Saúde (UBS)',              'Saúde',                            20),
  ('hospital',       'Hospital e UPA',                             'Saúde',                            21),
  ('caps',           'CAPS (saúde mental)',                        'Saúde',                            22),
  ('especialidades', 'Especialidades, reabilitação e diagnóstico', 'Saúde',                            23),
  ('academia_saude', 'Academia da Saúde',                          'Saúde',                            24),
  ('saude',          'Vigilância, gestão e apoio à saúde',         'Saúde',                            25),
  ('cras',           'CRAS',                                       'Assistência social',               30),
  ('creas',          'CREAS e Centro POP',                         'Assistência social',               31),
  ('acolhimento',    'Acolhimento institucional',                  'Assistência social',               32),
  ('assistencia',    'Convivência, Cadastro Único e outros',       'Assistência social',               33),
  ('praca',          'Praça e parque',                             'Espaços públicos',                 40),
  ('esporte',        'Esporte e lazer',                            'Espaços públicos',                 41),
  ('cultura',        'Cultura',                                    'Espaços públicos',                 42),
  ('mercado',        'Mercado e feira',                            'Espaços públicos',                 43),
  ('cemiterio',      'Cemitério',                                  'Espaços públicos',                 44),
  ('terminal',       'Terminal de transporte',                     'Espaços públicos',                 45),
  ('outra',          'Outra',                                      'Outros',                           99);

-- ---------------------------------------------------------------------
-- 8. Funções e gatilhos
-- ---------------------------------------------------------------------

-- Data de hoje no fuso de Imperatriz (UTC-3, sem horário de verão).
create function public.hoje() returns date
language sql stable as $$
  select (now() at time zone 'America/Fortaleza')::date;
$$;

create function public.usuario_ativo() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo);
$$;

create function public.tem_permissao(p_permissao text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from perfis pf
    where pf.id = auth.uid()
      and pf.ativo
      and (pf.papel = 'secretario'
           or exists (select 1 from papel_permissoes pp
                      where pp.papel = pf.papel and pp.permissao = p_permissao))
  );
$$;

-- Para o frontend montar menus e botões. A segurança real está na RLS.
create function public.minhas_permissoes()
returns table (nome text, papel text, permissoes text[])
language sql stable security definer set search_path = public, pg_temp as $$
  select pf.nome,
         pf.papel,
         case when pf.papel = 'secretario'
              then (select array_agg(codigo order by codigo) from permissoes)
              else coalesce((select array_agg(permissao order by permissao)
                             from papel_permissoes where papel = pf.papel), '{}')
         end
  from perfis pf
  where pf.id = auth.uid() and pf.ativo;
$$;

create function public._exigir(p_permissao text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not tem_permissao(p_permissao) then
    raise exception 'Sem permissão para esta ação (%).', p_permissao using errcode = '42501';
  end if;
end;
$$;

-- 8.1 Perfil criado automaticamente (desativado) para todo usuário novo do Auth.
create function public.criar_perfil_novo_usuario() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into perfis (id, nome)
  values (new.id,
          coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''),
                   split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- 8.2 Nome do autor gravado junto do registro (retrato do momento).
create function public.preencher_autor() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.autor_id is not null then
    select nome into new.autor_nome from perfis where id = new.autor_id;
  end if;
  new.autor_nome := coalesce(new.autor_nome, 'Sistema');
  return new;
end;
$$;

create trigger atualizacoes_autor before insert on public.atualizacoes
  for each row execute function public.preencher_autor();
create trigger eventos_autor before insert on public.eventos_obra
  for each row execute function public.preencher_autor();

-- 8.3 Lançamento de percentual: valida e atualiza a obra.
create function public.atualizacoes_antes_inserir() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_obra obras;
begin
  -- "for update": dois lançamentos simultâneos na mesma obra entram em fila, e
  -- o segundo lê como valor anterior o que o primeiro gravou.
  select * into v_obra from obras where id = new.obra_id for update;
  if v_obra.arquivada then
    raise exception 'A obra "%" está arquivada e não recebe lançamentos.', v_obra.nome
      using errcode = 'P0001';
  end if;
  new.percentual_anterior := v_obra.percentual_executado;
  return new;
end;
$$;

create function public.atualizacoes_depois_inserir() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Só o lançamento mais recente define o percentual da obra.
  update obras
     set percentual_executado  = new.percentual_executado,
         ultima_atualizacao_em = new.criado_em
   where id = new.obra_id
     and (ultima_atualizacao_em is null or ultima_atualizacao_em <= new.criado_em);
  return new;
end;
$$;

create trigger atualizacoes_valida before insert on public.atualizacoes
  for each row execute function public.atualizacoes_antes_inserir();
create trigger atualizacoes_propaga after insert on public.atualizacoes
  for each row execute function public.atualizacoes_depois_inserir();

-- 8.4 Obras: trecho, término original e proteção do término vigente.

-- Trecho de via em GeoJSON: LineString ou MultiLineString, coordenadas
-- [longitude, latitude]. Devolve nulo para trecho vazio e recusa formato
-- inválido com mensagem clara. Limites folgados para obra municipal.
create function public._validar_trecho(p_trecho jsonb) returns jsonb
language plpgsql immutable as $$
declare
  v_linhas jsonb;
  v_linha  jsonb;
  v_ponto  jsonb;
  v_total  integer := 0;
begin
  if p_trecho is null or p_trecho = 'null'::jsonb or p_trecho = '{}'::jsonb then
    return null;
  end if;
  if jsonb_typeof(p_trecho) <> 'object' or coalesce(jsonb_typeof(p_trecho -> 'coordinates'), '') <> 'array' then
    raise exception 'Trecho inválido. Desenhe o trecho de novo no mapa.' using errcode = 'P0001';
  end if;
  if p_trecho ->> 'type' = 'LineString' then
    v_linhas := jsonb_build_array(p_trecho -> 'coordinates');
  elsif p_trecho ->> 'type' = 'MultiLineString' then
    v_linhas := p_trecho -> 'coordinates';
  else
    raise exception 'Trecho inválido. Desenhe o trecho de novo no mapa.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_linhas) = 0 then
    return null;
  end if;
  if jsonb_array_length(v_linhas) > 50 then
    raise exception 'O trecho tem segmentos demais (máximo 50).' using errcode = 'P0001';
  end if;
  for v_linha in select value from jsonb_array_elements(v_linhas) loop
    if jsonb_typeof(v_linha) <> 'array' then
      raise exception 'Trecho inválido. Desenhe o trecho de novo no mapa.' using errcode = 'P0001';
    end if;
    if jsonb_array_length(v_linha) < 2 then
      raise exception 'Cada segmento do trecho precisa de pelo menos 2 pontos.' using errcode = 'P0001';
    end if;
    for v_ponto in select value from jsonb_array_elements(v_linha) loop
      v_total := v_total + 1;
      if jsonb_typeof(v_ponto) <> 'array' then
        raise exception 'Trecho inválido. Desenhe o trecho de novo no mapa.' using errcode = 'P0001';
      end if;
      if jsonb_array_length(v_ponto) <> 2
         or coalesce(jsonb_typeof(v_ponto -> 0), '') <> 'number'
         or coalesce(jsonb_typeof(v_ponto -> 1), '') <> 'number' then
        raise exception 'Trecho inválido. Desenhe o trecho de novo no mapa.' using errcode = 'P0001';
      end if;
      if (v_ponto ->> 0)::numeric not between -180 and 180 or (v_ponto ->> 1)::numeric not between -90 and 90 then
        raise exception 'O trecho tem um ponto com coordenada inválida.' using errcode = 'P0001';
      end if;
    end loop;
  end loop;
  if v_total > 2000 then
    raise exception 'O trecho tem pontos demais (máximo 2.000).' using errcode = 'P0001';
  end if;
  return jsonb_build_object('type', p_trecho ->> 'type', 'coordinates', p_trecho -> 'coordinates');
end;
$$;

create function public.obras_antes_inserir() returns trigger
language plpgsql as $$
begin
  new.data_termino_original := coalesce(new.data_termino_original, new.data_termino_prevista);
  new.trecho := _validar_trecho(new.trecho);
  return new;
end;
$$;

create function public.obras_antes_atualizar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.atualizado_em := now();
  if new.trecho is distinct from old.trecho then
    new.trecho := _validar_trecho(new.trecho);
  end if;
  if new.data_termino_prevista is distinct from old.data_termino_prevista
     and coalesce(current_setting('app.origem', true), '') <> 'aditivo' then
    -- Edição direta do término só corrige erro de cadastro, e só enquanto não
    -- houver aditivo. Depois disso, prazo novo = novo aditivo.
    if exists (select 1 from eventos_obra where obra_id = new.id and tipo = 'aditivo_prazo') then
      raise exception 'Esta obra tem aditivo de prazo. Para mudar o término, registre um novo aditivo.'
        using errcode = 'P0001';
    end if;
    new.data_termino_original := new.data_termino_prevista;
  end if;
  return new;
end;
$$;

create trigger obras_insercao before insert on public.obras
  for each row execute function public.obras_antes_inserir();

-- Instalações: data da última alteração.
create function public.instalacoes_antes_atualizar() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger instalacoes_alteracao before update on public.instalacoes
  for each row execute function public.instalacoes_antes_atualizar();
create trigger obras_alteracao before update on public.obras
  for each row execute function public.obras_antes_atualizar();

-- 8.5 Auditoria genérica.
create function public.auditar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Desligada só em transações de manutenção da demonstração (seed, limpeza).
  if coalesce(current_setting('app.sem_auditoria', true), '') = 'on' then
    return null;
  end if;
  insert into auditoria (tabela, registro_id, operacao, usuario_id, antes, depois)
  values (tg_table_name,
          coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
          tg_op,
          auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end;
$$;

create trigger auditoria after insert or update or delete on public.obras
  for each row execute function public.auditar();
create trigger auditoria after insert or update or delete on public.atualizacoes
  for each row execute function public.auditar();
create trigger auditoria after insert or update or delete on public.eventos_obra
  for each row execute function public.auditar();
create trigger auditoria after insert or update or delete on public.documentos
  for each row execute function public.auditar();
create trigger auditoria after insert or update or delete on public.perfis
  for each row execute function public.auditar();
create trigger auditoria after insert or update or delete on public.configuracao
  for each row execute function public.auditar();
create trigger auditoria after insert or update or delete on public.papel_permissoes
  for each row execute function public.auditar();
create trigger auditoria after insert or update or delete on public.instalacoes
  for each row execute function public.auditar();
create trigger auditoria after insert or update or delete on public.orcamentos
  for each row execute function public.auditar();
create trigger auditoria after insert or update or delete on public.orcamento_itens
  for each row execute function public.auditar();
-- documentos_gerados não tem gatilho de auditoria: é somente inserção e a
-- própria tabela já é o registro (quem gerou, quando e o conteúdo emitido).

-- Item da planilha corrigido: data da alteração e total recalculado quando
-- mudam quantidade ou preço (sem mexer no total, ele acompanha).
create function public.orcamento_itens_antes_atualizar() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  if new.nivel = 'item'
     and (new.quantidade is distinct from old.quantidade or new.preco_unitario is distinct from old.preco_unitario)
     and new.total is not distinct from old.total
     and new.quantidade is not null and new.preco_unitario is not null then
    new.total := round(new.quantidade * new.preco_unitario, 2);
  end if;
  return new;
end;
$$;

create trigger orcamento_itens_alteracao before update on public.orcamento_itens
  for each row execute function public.orcamento_itens_antes_atualizar();

-- 8.6 Auxiliares internas das ações (não expostas ao frontend).

-- Tipo de documento esperado para cada tipo de evento.
create function public._tipo_documento_padrao(p_evento text) returns text
language sql immutable as $$
  select case p_evento
    when 'cadastro'        then 'ordem_servico'
    when 'aditivo_prazo'   then 'termo_aditivo'
    when 'paralisacao'     then 'ordem_paralisacao'
    when 'retomada'        then 'ordem_reinicio'
    else 'despacho'
  end;
$$;

-- Data recebida como texto (dentro de jsonb): só AAAA-MM-DD, ano entre 2000 e
-- 2099 e, se p_ate_hoje, não futura. Vazio = nulo. p_rotulo: 'data de início',
-- 'data do protocolo'... (entra na mensagem).
create function public._data(p_valor text, p_rotulo text, p_ate_hoje boolean default false)
returns date
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v date;
begin
  if nullif(btrim(p_valor), '') is null then
    return null;
  end if;
  if btrim(p_valor) !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'A % está em formato inválido. Use o seletor de data.', p_rotulo using errcode = 'P0001';
  end if;
  begin
    v := btrim(p_valor)::date;
  exception when others then
    raise exception 'A % não existe no calendário.', p_rotulo using errcode = 'P0001';
  end;
  if v < date '2000-01-01' or v > date '2099-12-31' then
    raise exception 'A % (%) está fora do intervalo aceito (anos 2000 a 2099). Confira o ano.',
      p_rotulo, to_char(v, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if p_ate_hoje and v > hoje() then
    raise exception 'A % não pode ser futura.', p_rotulo using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- p_doc: {tipo, numero, numero_protocolo, data_protocolo, data_documento,
--         orgao_origem, numero_processo, observacao}. Nulo ou vazio = sem documento.
create function public._criar_documento(p_obra uuid, p_doc jsonb, p_tipo_padrao text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if p_doc is null or p_doc = '{}'::jsonb then
    return null;
  end if;
  insert into documentos (obra_id, tipo, numero, numero_protocolo, data_protocolo,
                          data_documento, orgao_origem, numero_processo, observacao, criado_por)
  values (p_obra,
          coalesce(nullif(btrim(p_doc ->> 'tipo'), ''), p_tipo_padrao),
          nullif(btrim(p_doc ->> 'numero'), ''),
          nullif(btrim(p_doc ->> 'numero_protocolo'), ''),
          _data(p_doc ->> 'data_protocolo', 'data do protocolo', true),
          _data(p_doc ->> 'data_documento', 'data do documento', true),
          nullif(btrim(p_doc ->> 'orgao_origem'), ''),
          nullif(btrim(p_doc ->> 'numero_processo'), ''),
          nullif(btrim(p_doc ->> 'observacao'), ''),
          auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create function public._registrar_evento(p_obra uuid, p_tipo text, p_data date,
                                          p_descricao text, p_dados jsonb, p_doc jsonb)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  insert into eventos_obra (obra_id, tipo, data_evento, descricao, dados, documento_id, autor_id)
  values (p_obra, p_tipo, p_data, nullif(btrim(p_descricao), ''), coalesce(p_dados, '{}'::jsonb),
          _criar_documento(p_obra, p_doc, _tipo_documento_padrao(p_tipo)),
          auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create function public._obra_para_acao(p_obra uuid) returns public.obras
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_obra obras;
begin
  select * into v_obra from obras where id = p_obra for update;
  if not found then
    raise exception 'Obra não encontrada.' using errcode = 'P0002';
  end if;
  if v_obra.arquivada then
    raise exception 'A obra "%" está arquivada.', v_obra.nome using errcode = 'P0001';
  end if;
  return v_obra;
end;
$$;

-- 8.7 Ações expostas ao frontend (RPC).

-- p_dados: {id (opcional, gerado no navegador), nome, tipo, bairro, empresa,
--           empresa_cnpj, numero_processo, numero_contrato, valor_contrato, data_inicio,
--           data_termino_prevista, latitude, longitude, trecho (GeoJSON,
--           opcional), instalacao_id (opcional), fiscal_responsavel,
--           fiscal_titulo, fiscal_registro, fiscal_matricula}
-- p_percentual_inicial: para obra já em andamento no momento do cadastro.
-- p_documento: ordem de serviço (opcional).
create function public.criar_obra(p_dados jsonb,
                                  p_percentual_inicial numeric default null,
                                  p_documento jsonb default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id      uuid;
  v_inicio  date;
  v_termino date;
begin
  perform _exigir('obra.cadastrar');

  -- Repetição do mesmo cadastro (a resposta da 1ª tentativa se perdeu na rede):
  -- o id vem do navegador; se a obra já existe e é deste usuário, só devolve.
  v_id := nullif(p_dados ->> 'id', '')::uuid;
  if v_id is not null and exists (select 1 from obras where id = v_id and criado_por = auth.uid()) then
    return v_id;
  end if;

  v_inicio  := _data(p_dados ->> 'data_inicio', 'data de início');
  v_termino := _data(p_dados ->> 'data_termino_prevista', 'data de término previsto');

  if nullif(btrim(p_dados ->> 'nome'), '') is null then
    raise exception 'Informe o nome da obra.' using errcode = 'P0001';
  end if;
  if v_inicio is null or v_termino is null then
    raise exception 'Informe as datas de início e de término previsto.' using errcode = 'P0001';
  end if;
  if v_termino <= v_inicio then
    raise exception 'O término previsto deve ser posterior ao início.' using errcode = 'P0001';
  end if;
  if nullif(p_dados ->> 'latitude', '') is null or nullif(p_dados ->> 'longitude', '') is null then
    raise exception 'Marque a localização da obra no mapa.' using errcode = 'P0001';
  end if;
  if p_percentual_inicial is not null and p_percentual_inicial not between 0 and 100 then
    raise exception 'O percentual inicial deve estar entre 0 e 100.' using errcode = 'P0001';
  end if;

  insert into obras (id, nome, tipo, bairro, empresa, empresa_cnpj, numero_processo, numero_contrato,
                     valor_contrato, data_inicio, data_termino_prevista, latitude,
                     longitude, trecho, instalacao_id, fiscal_responsavel, fiscal_titulo,
                     fiscal_registro, fiscal_matricula, criado_por)
  values (coalesce(v_id, gen_random_uuid()),
          btrim(p_dados ->> 'nome'),
          coalesce(nullif(p_dados ->> 'tipo', ''), 'outro'),
          nullif(btrim(p_dados ->> 'bairro'), ''),
          nullif(btrim(p_dados ->> 'empresa'), ''),
          nullif(btrim(p_dados ->> 'empresa_cnpj'), ''),
          nullif(btrim(p_dados ->> 'numero_processo'), ''),
          nullif(btrim(p_dados ->> 'numero_contrato'), ''),
          nullif(p_dados ->> 'valor_contrato', '')::numeric,
          v_inicio,
          v_termino,
          (p_dados ->> 'latitude')::double precision,
          (p_dados ->> 'longitude')::double precision,
          p_dados -> 'trecho',
          nullif(p_dados ->> 'instalacao_id', '')::uuid,
          nullif(btrim(p_dados ->> 'fiscal_responsavel'), ''),
          nullif(btrim(p_dados ->> 'fiscal_titulo'), ''),
          nullif(btrim(p_dados ->> 'fiscal_registro'), ''),
          nullif(btrim(p_dados ->> 'fiscal_matricula'), ''),
          auth.uid())
  returning id into v_id;

  perform _registrar_evento(v_id, 'cadastro', hoje(), 'Obra cadastrada', '{}'::jsonb, p_documento);

  if coalesce(p_percentual_inicial, 0) > 0 then
    insert into atualizacoes (obra_id, percentual_executado, observacao, autor_id)
    values (v_id, p_percentual_inicial, 'Percentual informado no cadastro da obra', auth.uid());
  end if;

  return v_id;
end;
$$;

create function public.registrar_aditivo_prazo(p_obra uuid,
                                               p_novo_termino date,
                                               p_descricao text default null,
                                               p_documento jsonb default null,
                                               p_data date default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_obra obras;
  v_data date := coalesce(p_data, hoje());
begin
  perform _exigir('obra.aditivo');
  v_obra := _obra_para_acao(p_obra);

  if p_novo_termino is null or p_novo_termino <= v_obra.data_inicio then
    raise exception 'O novo término deve ser posterior ao início da obra.' using errcode = 'P0001';
  end if;
  if p_novo_termino = v_obra.data_termino_prevista then
    raise exception 'O novo término é igual ao atual.' using errcode = 'P0001';
  end if;
  -- Aditivo com data passada é normal (carga de obra antiga); futura, não.
  -- Novo término menor que o vigente é aceito (supressão de prazo), com
  -- confirmação na tela.
  if v_data > hoje() then
    raise exception 'A data do aditivo não pode ser futura.' using errcode = 'P0001';
  end if;

  perform set_config('app.origem', 'aditivo', true);
  update obras set data_termino_prevista = p_novo_termino where id = p_obra;
  perform set_config('app.origem', '', true);

  return _registrar_evento(p_obra, 'aditivo_prazo', v_data, p_descricao,
                           jsonb_build_object('termino_anterior', v_obra.data_termino_prevista,
                                              'termino_novo', p_novo_termino),
                           p_documento);
end;
$$;

create function public.paralisar_obra(p_obra uuid,
                                      p_motivo text,
                                      p_documento jsonb default null,
                                      p_data date default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_obra     obras;
  v_data     date := coalesce(p_data, hoje());
  v_retomada date;
begin
  perform _exigir('obra.paralisar');
  v_obra := _obra_para_acao(p_obra);

  if v_obra.paralisada then
    raise exception 'A obra já está paralisada desde %.', to_char(v_obra.paralisada_desde, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Informe o motivo da paralisação.' using errcode = 'P0001';
  end if;
  if v_data > hoje() then
    raise exception 'A data da paralisação não pode ser futura.' using errcode = 'P0001';
  end if;
  -- Períodos de paralisação não podem se sobrepor nem começar antes da obra
  -- (os dias parados seriam contados em dobro).
  if v_data < v_obra.data_inicio then
    raise exception 'A data da paralisação não pode ser anterior ao início da obra (%).',
      to_char(v_obra.data_inicio, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  select max(data_evento) into v_retomada
    from eventos_obra where obra_id = p_obra and tipo = 'retomada';
  if v_data < v_retomada then
    raise exception 'A data da paralisação não pode ser anterior à última retomada (%).',
      to_char(v_retomada, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;

  update obras
     set paralisada = true, paralisada_desde = v_data, motivo_paralisacao = btrim(p_motivo)
   where id = p_obra;

  return _registrar_evento(p_obra, 'paralisacao', v_data, p_motivo, '{}'::jsonb, p_documento);
end;
$$;

create function public.retomar_obra(p_obra uuid,
                                    p_observacao text default null,
                                    p_documento jsonb default null,
                                    p_data date default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_obra obras;
  v_data date := coalesce(p_data, hoje());
begin
  perform _exigir('obra.paralisar');
  v_obra := _obra_para_acao(p_obra);

  if not v_obra.paralisada then
    raise exception 'A obra não está paralisada.' using errcode = 'P0001';
  end if;
  if v_data < v_obra.paralisada_desde or v_data > hoje() then
    raise exception 'A data da retomada deve estar entre % e hoje.',
      to_char(v_obra.paralisada_desde, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;

  update obras
     set paralisada = false, paralisada_desde = null, motivo_paralisacao = null
   where id = p_obra;

  return _registrar_evento(p_obra, 'retomada', v_data, p_observacao,
                           jsonb_build_object('paralisada_desde', v_obra.paralisada_desde,
                                              'motivo', v_obra.motivo_paralisacao,
                                              'dias_paralisada', v_data - v_obra.paralisada_desde),
                           p_documento);
end;
$$;

create function public.arquivar_obra(p_obra uuid,
                                     p_motivo text,
                                     p_documento jsonb default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _exigir('obra.arquivar');
  perform _obra_para_acao(p_obra);

  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Informe o motivo do arquivamento.' using errcode = 'P0001';
  end if;

  update obras set arquivada = true, arquivada_em = now() where id = p_obra;
  return _registrar_evento(p_obra, 'arquivamento', hoje(), p_motivo, '{}'::jsonb, p_documento);
end;
$$;

create function public.desarquivar_obra(p_obra uuid,
                                        p_motivo text,
                                        p_documento jsonb default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_arquivada boolean;
begin
  perform _exigir('obra.arquivar');
  select arquivada into v_arquivada from obras where id = p_obra for update;
  if not found then
    raise exception 'Obra não encontrada.' using errcode = 'P0002';
  end if;
  if not v_arquivada then
    raise exception 'A obra não está arquivada.' using errcode = 'P0001';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Informe o motivo do desarquivamento.' using errcode = 'P0001';
  end if;

  update obras set arquivada = false, arquivada_em = null where id = p_obra;
  return _registrar_evento(p_obra, 'desarquivamento', hoje(), p_motivo, '{}'::jsonb, p_documento);
end;
$$;

-- Completa o documento de suporte de um evento: cria se não houver, ou
-- preenche SÓ os campos ainda vazios de um documento pendente. Documento
-- completo (com número e protocolo) não pode ser alterado por aqui, e campo já
-- preenchido não se troca: o lastro de um ato não se reescreve. Enviar de novo
-- o mesmo valor é aceito (o diálogo devolve os campos que já existiam).
create function public.completar_documento(p_evento uuid, p_documento jsonb)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_evento eventos_obra;
  v_atual  documentos;
  v_doc    uuid;
  v_campo  record;
  v_novo   text;
  v_velho  text;
begin
  perform _exigir('documento.editar');
  select * into v_evento from eventos_obra where id = p_evento for update;
  if not found then
    raise exception 'Evento não encontrado.' using errcode = 'P0002';
  end if;
  if p_documento is null or p_documento = '{}'::jsonb then
    raise exception 'Informe os dados do documento.' using errcode = 'P0001';
  end if;

  if v_evento.documento_id is null then
    v_doc := _criar_documento(v_evento.obra_id, p_documento, _tipo_documento_padrao(v_evento.tipo));
    update eventos_obra set documento_id = v_doc where id = p_evento;
    return v_doc;
  end if;

  v_doc := v_evento.documento_id;
  select * into v_atual from documentos where id = v_doc for update;
  if not v_atual.pendente then
    raise exception 'Este documento já está completo e não pode ser alterado.' using errcode = 'P0001';
  end if;

  for v_campo in
    select * from (values ('tipo', 'tipo'), ('numero', 'número'), ('numero_protocolo', 'número de protocolo'),
                          ('data_protocolo', 'data do protocolo'), ('data_documento', 'data do documento'),
                          ('orgao_origem', 'órgão de origem'), ('numero_processo', 'número do processo'),
                          ('observacao', 'observação')) as c (nome, rotulo)
  loop
    v_novo  := nullif(btrim(p_documento ->> v_campo.nome), '');
    v_velho := to_jsonb(v_atual) ->> v_campo.nome;
    if v_novo is not null and v_velho is not null then
      if v_campo.nome like 'data%' then
        if _data(v_novo, v_campo.rotulo) <> v_velho::date then
          raise exception 'A % já está registrada (%) e não pode ser trocada.', v_campo.rotulo,
            to_char(v_velho::date, 'DD/MM/YYYY') using errcode = 'P0001';
        end if;
      elsif v_novo <> v_velho then
        raise exception 'O campo % já está registrado ("%") e não pode ser trocado.', v_campo.rotulo,
          case when v_campo.nome = 'tipo'
               then coalesce((select nome from tipos_documento where codigo = v_velho), v_velho)
               else v_velho end
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

  update documentos set
    numero           = coalesce(numero, nullif(btrim(p_documento ->> 'numero'), '')),
    numero_protocolo = coalesce(numero_protocolo, nullif(btrim(p_documento ->> 'numero_protocolo'), '')),
    data_protocolo   = coalesce(data_protocolo, _data(p_documento ->> 'data_protocolo', 'data do protocolo', true)),
    data_documento   = coalesce(data_documento, _data(p_documento ->> 'data_documento', 'data do documento', true)),
    orgao_origem     = coalesce(orgao_origem, nullif(btrim(p_documento ->> 'orgao_origem'), '')),
    numero_processo  = coalesce(numero_processo, nullif(btrim(p_documento ->> 'numero_processo'), '')),
    observacao       = coalesce(observacao, nullif(btrim(p_documento ->> 'observacao'), '')),
    atualizado_em    = now()
  where id = v_doc;
  return v_doc;
end;
$$;

-- Importa a planilha de serviços da obra: vira a versão vigente e a anterior
-- fica guardada (inativa). Tudo numa transação: ou entra inteira, ou nada.
-- p_dados: {id (opcional, gerado no navegador), descricao, data_base,
--           bdi_percentual, arquivo_origem}
-- p_itens: [{nivel ('etapa'|'item'), numero, codigo, fonte, descricao, unidade,
--            quantidade, preco_unitario, total, tipo}], na ordem da planilha.
-- Os itens não entram um a um na auditoria (seriam milhares de linhas): a
-- importação vira um registro só, com quantidade de itens e total.
create function public.importar_orcamento(p_obra uuid, p_dados jsonb, p_itens jsonb)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id     uuid;
  v_linha  integer;
  v_resumo jsonb;
begin
  perform _exigir('orcamento.editar');
  perform _obra_para_acao(p_obra);

  -- Repetição da mesma importação (resposta perdida na rede): devolve a já gravada.
  v_id := nullif(p_dados ->> 'id', '')::uuid;
  if v_id is not null and exists (
       select 1 from orcamentos where id = v_id and obra_id = p_obra and criado_por = auth.uid()) then
    return v_id;
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A planilha não tem itens.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_itens) > 5000 then
    raise exception 'A planilha tem linhas demais (máximo 5.000).' using errcode = 'P0001';
  end if;
  select min(n) into v_linha
    from jsonb_array_elements(p_itens) with ordinality as t(x, n)
   where nullif(btrim(x ->> 'descricao'), '') is null;
  if v_linha is not null then
    raise exception 'A linha % da planilha está sem descrição.', v_linha using errcode = 'P0001';
  end if;

  update orcamentos set ativo = false where obra_id = p_obra and ativo;
  insert into orcamentos (id, obra_id, descricao, data_base, bdi_percentual, arquivo_origem)
  values (coalesce(v_id, gen_random_uuid()), p_obra,
          coalesce(nullif(btrim(p_dados ->> 'descricao'), ''), 'Planilha orçamentária do contrato'),
          nullif(btrim(p_dados ->> 'data_base'), ''),
          nullif(p_dados ->> 'bdi_percentual', '')::numeric,
          nullif(btrim(p_dados ->> 'arquivo_origem'), ''))
  returning id into v_id;

  perform set_config('app.sem_auditoria', 'on', true);
  begin
    insert into orcamento_itens (orcamento_id, ordem, nivel, numero, codigo, fonte, descricao, unidade,
                                 quantidade, preco_unitario, total, tipo)
    -- ordem de 10 em 10: um item novo entra entre dois sem renumerar a planilha
    select v_id, n * 10,
           case when x ->> 'nivel' = 'etapa' then 'etapa' else 'item' end,
           nullif(btrim(x ->> 'numero'), ''),
           nullif(btrim(x ->> 'codigo'), ''),
           nullif(btrim(x ->> 'fonte'), ''),
           btrim(x ->> 'descricao'),
           nullif(btrim(x ->> 'unidade'), ''),
           nullif(x ->> 'quantidade', '')::numeric,
           nullif(x ->> 'preco_unitario', '')::numeric,
           nullif(x ->> 'total', '')::numeric,
           case when x ->> 'tipo' in ('servico', 'material', 'equipamento', 'outro') then x ->> 'tipo' else 'servico' end
      from jsonb_array_elements(p_itens) with ordinality as t(x, n);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'A planilha tem quantidade, preço ou total que não é número (ou é grande demais).'
      using errcode = 'P0001';
  end;
  perform set_config('app.sem_auditoria', '', true);

  select jsonb_build_object(
           'obra_id', p_obra,
           'itens', count(*) filter (where nivel = 'item'),
           'etapas', count(*) filter (where nivel = 'etapa'),
           'total', coalesce(sum(total) filter (where nivel = 'item'), 0),
           'arquivo', nullif(btrim(p_dados ->> 'arquivo_origem'), ''))
    into v_resumo
    from orcamento_itens where orcamento_id = v_id;
  insert into auditoria (tabela, registro_id, operacao, usuario_id, depois)
  values ('orcamento_itens', v_id::text, 'IMPORTACAO', auth.uid(), v_resumo);

  return v_id;
end;
$$;

-- Registra a emissão de um documento gerado e devolve o número de controle
-- (sequencial por tipo e ano). p_dados é o retrato do conteúdo emitido.
-- Vale também para obra arquivada (ex.: atestado de obra concluída).
create function public.registrar_documento_gerado(p_id uuid, p_obra uuid, p_tipo text, p_dados jsonb,
                                                  p_protocolo text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ano    integer := extract(year from hoje())::integer;
  v_numero integer;
  v_id     uuid;
  v_feito  documentos_gerados;
begin
  perform _exigir('documento.gerar');

  -- Repetição da mesma emissão (resposta perdida na rede): devolve o número já dado.
  select * into v_feito from documentos_gerados where id = p_id and gerado_por = auth.uid();
  if found then
    return jsonb_build_object('id', v_feito.id, 'numero', v_feito.numero, 'ano', v_feito.ano);
  end if;

  if not exists (select 1 from obras where id = p_obra) then
    raise exception 'Obra não encontrada.' using errcode = 'P0002';
  end if;
  if p_tipo not in ('declaracao_andamento', 'atestado_capacidade', 'ficha_tecnica', 'planilha_servicos') then
    raise exception 'Tipo de documento desconhecido.' using errcode = 'P0001';
  end if;

  -- Numeração sem buraco nem repetição, mesmo com duas emissões ao mesmo tempo.
  perform pg_advisory_xact_lock(hashtext('documentos_gerados:' || p_tipo || ':' || v_ano));
  select coalesce(max(numero), 0) + 1 into v_numero
    from documentos_gerados where tipo = p_tipo and ano = v_ano;

  insert into documentos_gerados (id, obra_id, tipo, ano, numero, numero_protocolo, dados, gerado_por, gerado_por_nome)
  values (coalesce(p_id, gen_random_uuid()), p_obra, p_tipo, v_ano, v_numero,
          nullif(btrim(p_protocolo), ''), coalesce(p_dados, '{}'::jsonb), auth.uid(),
          coalesce((select nome from perfis where id = auth.uid()), 'Sistema'))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'ano', v_ano);
end;
$$;

-- A planilha pode ser corrigida? (é a vigente e a obra não está arquivada)
-- Usada nas regras de acesso dos itens.
create function public.orcamento_editavel(p_orcamento uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from orcamentos o join obras ob on ob.id = o.obra_id
     where o.id = p_orcamento and o.ativo and not ob.arquivada
  );
$$;

-- ---------------------------------------------------------------------
-- 9. Visões para o frontend
-- ---------------------------------------------------------------------

-- Atos formais sem documento completo.
create view public.pendencias_documentais with (security_invoker = true) as
select e.id            as evento_id,
       e.obra_id,
       o.nome          as obra_nome,
       e.tipo,
       e.data_evento,
       e.documento_id,
       d.numero,
       d.numero_protocolo
from public.eventos_obra e
join public.obras o on o.id = e.obra_id
left join public.documentos d on d.id = e.documento_id
where e.tipo in ('aditivo_prazo', 'paralisacao', 'retomada', 'arquivamento', 'desarquivamento')
  and (d.id is null or d.pendente);

-- Obra com os indicadores que o mapa, a lista e o relatório usam.
-- A situação (em dia, atrasada...) é calculada no frontend por uma função única.
--   tem_aditivo:     já houve aditivo (o término só muda por novo aditivo)
--   prorrogada:      o término vigente é posterior ao original
--   ultima_retomada: o alerta "sem atualização" não conta o tempo parada
create view public.obras_painel with (security_invoker = true) as
select o.*,
       exists (select 1 from public.eventos_obra e
               where e.obra_id = o.id and e.tipo = 'aditivo_prazo')       as tem_aditivo,
       o.data_termino_prevista > o.data_termino_original                  as prorrogada,
       (select max(e.data_evento) from public.eventos_obra e
        where e.obra_id = o.id and e.tipo = 'retomada')                   as ultima_retomada,
       exists (select 1 from public.orcamentos oc
               where oc.obra_id = o.id and oc.ativo)                      as tem_planilha,
       (select count(*) from public.pendencias_documentais p
        where p.obra_id = o.id)                                           as pendencias_documentais
from public.obras o;

-- ---------------------------------------------------------------------
-- 10. Privilégios e Row Level Security
-- ---------------------------------------------------------------------

-- Ponto de partida: ninguém pode nada (o Supabase concede tudo por padrão).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Leitura
grant select on public.papeis, public.permissoes, public.papel_permissoes,
                public.tipos_obra, public.tipos_documento, public.tipos_instalacao,
                public.instalacoes, public.configuracao,
                public.perfis, public.obras, public.documentos, public.atualizacoes,
                public.eventos_obra, public.auditoria,
                public.orcamentos, public.orcamento_itens, public.documentos_gerados,
                public.obras_painel, public.pendencias_documentais
  to authenticated;

-- Escrita direta, coluna por coluna. O resto só pelas funções da seção 8.7.
grant update (nome, tipo, bairro, empresa, empresa_cnpj, numero_processo, numero_contrato, valor_contrato,
              data_inicio, data_termino_prevista, latitude, longitude, trecho, instalacao_id,
              fiscal_responsavel, fiscal_titulo, fiscal_registro, fiscal_matricula)
  on public.obras to authenticated;
-- "id" no INSERT: gerado no navegador, para repetir sem duplicar quando a
-- resposta se perde na rede (a 2ª tentativa esbarra na chave primária).
grant insert (id, nome, tipo, bairro, endereco, observacao, latitude, longitude, ativa)
  on public.instalacoes to authenticated;
grant update (nome, tipo, bairro, endereco, observacao, latitude, longitude, ativa)
  on public.instalacoes to authenticated;
grant insert (id, obra_id, percentual_executado, observacao) on public.atualizacoes to authenticated;
grant update (tolerancia_atraso_pontos, dias_sem_atualizacao_alerta, orgao_nome, orgao_sigla,
              orgao_endereco, orgao_telefone, orgao_email, prefeitura_cnpj, secretario_nome,
              secretario_cargo, secretario_matricula, secretario_ato)
  on public.configuracao to authenticated;
-- Planilha de serviços: a importação é pela função; correções item a item, direto.
grant update (descricao, data_base, bdi_percentual) on public.orcamentos to authenticated;
grant insert (id, orcamento_id, ordem, nivel, numero, codigo, fonte, descricao, unidade, quantidade,
              preco_unitario, total, tipo)
  on public.orcamento_itens to authenticated;
grant update (ordem, nivel, numero, codigo, fonte, descricao, unidade, quantidade, preco_unitario,
              total, tipo, removido)
  on public.orcamento_itens to authenticated;

-- Funções chamáveis pelo frontend
grant execute on function
  public.hoje(),
  public.usuario_ativo(),
  public.tem_permissao(text),
  public.minhas_permissoes(),
  public.criar_obra(jsonb, numeric, jsonb),
  public.registrar_aditivo_prazo(uuid, date, text, jsonb, date),
  public.paralisar_obra(uuid, text, jsonb, date),
  public.retomar_obra(uuid, text, jsonb, date),
  public.arquivar_obra(uuid, text, jsonb),
  public.desarquivar_obra(uuid, text, jsonb),
  public.completar_documento(uuid, jsonb),
  public.importar_orcamento(uuid, jsonb, jsonb),
  public.registrar_documento_gerado(uuid, uuid, text, jsonb, text),
  public.orcamento_editavel(uuid)
  to authenticated;

alter table public.papeis            enable row level security;
alter table public.permissoes        enable row level security;
alter table public.papel_permissoes  enable row level security;
alter table public.perfis            enable row level security;
alter table public.configuracao      enable row level security;
alter table public.tipos_obra        enable row level security;
alter table public.tipos_documento   enable row level security;
alter table public.tipos_instalacao  enable row level security;
alter table public.instalacoes       enable row level security;
alter table public.obras             enable row level security;
alter table public.documentos        enable row level security;
alter table public.atualizacoes      enable row level security;
alter table public.eventos_obra      enable row level security;
alter table public.auditoria         enable row level security;
alter table public.orcamentos        enable row level security;
alter table public.orcamento_itens   enable row level security;
alter table public.documentos_gerados enable row level security;

-- Tabelas de referência: qualquer usuário ativo lê.
create policy leitura on public.papeis           for select to authenticated using (public.usuario_ativo());
create policy leitura on public.permissoes       for select to authenticated using (public.usuario_ativo());
create policy leitura on public.papel_permissoes for select to authenticated using (public.usuario_ativo());
create policy leitura on public.tipos_obra       for select to authenticated using (public.usuario_ativo());
create policy leitura on public.tipos_documento  for select to authenticated using (public.usuario_ativo());
create policy leitura on public.tipos_instalacao for select to authenticated using (public.usuario_ativo());

-- Instalações públicas: todos os ativos leem; cadastro e edição com instalacao.editar.
create policy leitura on public.instalacoes for select to authenticated
  using (public.usuario_ativo());
create policy insercao on public.instalacoes for insert to authenticated
  with check (public.tem_permissao('instalacao.editar') and criado_por = auth.uid());
create policy alteracao on public.instalacoes for update to authenticated
  using (public.tem_permissao('instalacao.editar'))
  with check (public.tem_permissao('instalacao.editar'));

-- Perfis: cada um vê o próprio; quem tem perfis.ver vê todos.
create policy leitura on public.perfis for select to authenticated
  using (id = auth.uid() or public.tem_permissao('perfis.ver'));

-- Configuração
create policy leitura on public.configuracao for select to authenticated
  using (public.usuario_ativo());
create policy alteracao on public.configuracao for update to authenticated
  using (public.tem_permissao('configuracao.editar'))
  with check (public.tem_permissao('configuracao.editar'));

-- Obras: todos os ativos leem; edição cadastral só com obra.editar e obra não arquivada.
create policy leitura on public.obras for select to authenticated
  using (public.usuario_ativo());
create policy alteracao on public.obras for update to authenticated
  using (public.tem_permissao('obra.editar') and not arquivada)
  with check (public.tem_permissao('obra.editar'));

-- Histórico e documentos: leitura para ativos; escrita só pelas regras abaixo e funções.
create policy leitura on public.documentos   for select to authenticated using (public.usuario_ativo());
create policy leitura on public.eventos_obra for select to authenticated using (public.usuario_ativo());
create policy leitura on public.atualizacoes for select to authenticated using (public.usuario_ativo());
create policy lancamento on public.atualizacoes for insert to authenticated
  with check (public.tem_permissao('percentual.lancar') and autor_id = auth.uid());

-- Planilha de serviços: todos os ativos leem; correção com orcamento.editar,
-- só na planilha vigente de obra não arquivada.
create policy leitura on public.orcamentos for select to authenticated using (public.usuario_ativo());
create policy alteracao on public.orcamentos for update to authenticated
  using (public.tem_permissao('orcamento.editar') and public.orcamento_editavel(id))
  with check (public.tem_permissao('orcamento.editar'));
create policy leitura on public.orcamento_itens for select to authenticated using (public.usuario_ativo());
create policy insercao on public.orcamento_itens for insert to authenticated
  with check (public.tem_permissao('orcamento.editar') and public.orcamento_editavel(orcamento_id));
create policy alteracao on public.orcamento_itens for update to authenticated
  using (public.tem_permissao('orcamento.editar') and public.orcamento_editavel(orcamento_id))
  with check (public.tem_permissao('orcamento.editar') and public.orcamento_editavel(orcamento_id));

-- Documentos gerados: todos os ativos consultam; emissão só pela função.
create policy leitura on public.documentos_gerados for select to authenticated using (public.usuario_ativo());

-- Auditoria: só quem tem auditoria.ver (o secretário).
create policy leitura on public.auditoria for select to authenticated
  using (public.tem_permissao('auditoria.ver'));

commit;
