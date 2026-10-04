-- =====================================================================
-- Mapa de Obras SINFRA: instalações públicas iniciais
--
-- Rodar depois do schema.sql. Carregado também na demonstração.
--
-- Fonte: OpenStreetMap (consulta de 03/10/2026), © colaboradores do
-- OpenStreetMap, dados sob a licença ODbL (openstreetmap.org/copyright).
-- São prédios públicos REAIS, com localização aproximada: conferir no mapa e
-- corrigir pela tela "Instalações" antes do uso real.
--
-- Não constam no OpenStreetMap e devem ser cadastrados pelo gabinete: sede da
-- SINFRA, pátio de máquinas e garagem, usina de asfalto, almoxarifado.
-- =====================================================================

begin;

-- Carga de referência: não entra na auditoria (ela registra atos de usuários).
select set_config('app.sem_auditoria', 'on', true);

-- Rodar duas vezes duplicaria as instalações (e pela tela ninguém exclui).
do $$
begin
  if exists (select 1 from public.instalacoes where nome = 'Prefeitura Municipal de Imperatriz') then
    raise exception 'As instalações iniciais já foram carregadas.';
  end if;
end;
$$;

insert into public.instalacoes (nome, tipo, bairro, endereco, latitude, longitude, observacao) values
  ('Prefeitura Municipal de Imperatriz', 'sede', 'Centro', 'Rua Rui Barbosa, 201', -5.52709, -47.49014,
   'Localização do OpenStreetMap; conferir.'),
  ('Hospital Municipal', 'saude', null, null, -5.53071, -47.48077,
   'Localização do OpenStreetMap; conferir.'),
  ('Escola Municipal de Ensino Fundamental Gonçalves Dias', 'escola', 'Bacuri', 'Rua Estreita, 154', -5.53498, -47.47380,
   'Localização do OpenStreetMap; conferir.'),
  ('Escola Municipal Castro Alves I', 'escola', 'Entroncamento', 'Rua Dom Vital, 238', -5.51567, -47.46872,
   'Localização do OpenStreetMap; conferir.'),
  ('Escola Municipal Eliza Nunes', 'escola', 'Santa Rita', 'Rua Bom Jesus, s/n', -5.50007, -47.48597,
   'Localização do OpenStreetMap; conferir.'),
  ('Escola Municipal Maria Francisca Pereira da Silva', 'escola', 'Santa Inês', 'Avenida Newton Bello, s/n', -5.50097, -47.49610,
   'Localização do OpenStreetMap; conferir.'),
  ('Escola Municipal Sinopse', 'escola', 'Bom Sucesso', 'Rua Dom Evaristo Ams, 720', -5.49632, -47.48719,
   'Localização do OpenStreetMap; conferir.'),
  ('Escola Municipalizada de Ensino Fundamental Frei Osvaldo Caronine', 'escola', 'Nova Imperatriz', 'Rua Alagoas, 1244', -5.50811, -47.48791,
   'Localização do OpenStreetMap; conferir.'),
  ('Escola Municipal Morada do Sol', 'escola', 'Jardim Morada do Sol', 'Avenida da Liberdade, 8', -5.52994, -47.46373,
   'Localização do OpenStreetMap; conferir.'),
  ('Creche Municipal Vovó Costinha', 'escola', 'Vila Redenção II', 'Rua João Lisboa, 1', -5.50805, -47.45580,
   'Localização do OpenStreetMap; conferir.'),
  ('Creche Municipal Portal da Amazônia', 'escola', null, null, -5.54278, -47.45388,
   'Localização do OpenStreetMap; conferir.'),
  ('Praça de Fátima', 'praca', 'Centro', null, -5.53173, -47.48546,
   'Localização do OpenStreetMap; conferir.'),
  ('Praça Brasil', 'praca', 'Centro', null, -5.52575, -47.47632,
   'Localização do OpenStreetMap; conferir.'),
  ('Praça Tiradentes', 'praca', 'Centro', null, -5.52910, -47.48626,
   'Localização do OpenStreetMap; conferir.'),
  ('Praça da Cultura', 'praca', 'Centro', 'Rua Coronel Manoel Bandeira', -5.53001, -47.48987,
   'Localização do OpenStreetMap; conferir.'),
  ('Praça Mané Garrincha', 'praca', 'Centro', null, -5.52590, -47.48934,
   'Localização do OpenStreetMap; conferir.'),
  ('Praça Jaime da Cafeteira', 'praca', 'Vila Cafeteira', 'Rua Goiás', -5.49141, -47.45941,
   'Localização do OpenStreetMap; conferir.'),
  ('Beira-Rio', 'praca', 'Beira-Rio', null, -5.53341, -47.49104,
   'Localização do OpenStreetMap; conferir.');

commit;
