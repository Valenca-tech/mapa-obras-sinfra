# Mapa de Obras SINFRA (piloto)

Ferramenta web para a Secretaria Municipal de Infraestrutura e Serviços Públicos de Imperatriz-MA: o gabinete cadastra as obras, o fiscal atualiza o percentual executado e o secretário vê no mapa, por cor e por texto, o que está em dia e o que está atrasado. Cada obra tem uma página com a planilha de serviços do contrato e a emissão de declarações, atestados, fichas técnicas e planilhas no papel timbrado da Prefeitura.

## Navegação

- **Capa:** ao abrir o endereço, uma capa de entrada (marca, números e telas da ferramenta em carrossel) com o botão "Iniciar"; aparece uma vez por visita.
- **Painel** (tela inicial do secretário e do gabinete): carteira de obras (ativas, atrasadas, paralisadas, execução média ponderada pelo valor, documentos pendentes), o mapa numa janela que minimiza e maximiza, obras por situação e as listas do que pede atenção (atrasadas e paralisadas, término nos próximos 30 dias, sem atualização, documentos pendentes). O fiscal continua caindo em Lançamentos.
- **Menu lateral:** Painel, Obras, Lançamentos, Pendências (com o número de pendentes), Instalações públicas, Relatório e, para o secretário, Configuração e Auditoria. Recolhe para só os ícones (botão no pé do menu); abaixo de 960 px de largura vira gaveta, aberta pelo botão da barra de cima.
- **Obras:** uma tela com duas vistas, **Cartões** (um cartão por obra, com situação, executado x prazo, valor, término e último lançamento; ordenação escolhida) e **Mapa**, e os mesmos filtros (busca, tipo, bairro) e a mesma faixa de situação, que conta e filtra (Atrasada, Paralisada, Em dia...; Sem atualização; Documento pendente). A vista escolhida fica guardada no aparelho. No mapa, clicar numa obra abre uma prévia com o essencial e o botão "Abrir obra".
- **Página da obra** (`/obras/<id>`): cabeçalho com situação, tipo, bairro e contrato; ações sempre à vista (Lançar percentual, Emitir documento e "Mais": ver no mapa, editar, aditivo, paralisar ou retomar, arquivar); quadro com executado, prazo decorrido, valor, término e último lançamento; abas Visão geral, Serviços e etapas, Documentos e Histórico.
- **Endereço automático:** no cadastro, ao marcar ou arrastar o ponto, logradouro, número e bairro são preenchidos pelo Nominatim do OpenStreetMap (só a coordenada vai na consulta; o número muitas vezes não existe no OSM). Campo digitado pela pessoa não é trocado.
- **Medição Pro** (medicaopro.concretta.org): cada obra pode guardar o código dela no Medição Pro (cola-se o endereço da obra aberta lá); a página da obra ganha o botão "Medições", que abre as medições no Medição Pro, com o login de lá.
- **Relatório:** documento oficial em A4 (papel timbrado com brasão, seções numeradas, tabelas de borda simples, texto de resumo com valores por extenso, critérios, local, data e assinatura do secretário).
- Endereços antigos (`#/mapa`, `#/central`, `#/lista`, `#/atualizar`) levam para as telas novas.

Piloto desenvolvido pelo IFMA Campus Imperatriz (LAEST e Concretta Jr). Responsável: Prof. Luan Henrique Varão Silva.

## Regras principais

- **Perfis:** `secretario` (acesso total, inclusive a permissões de módulos futuros), `admin` (gabinete: cadastra e mantém obras), `fiscal` (lança percentual, paralisa e retoma), `leitura` (consulta). As permissões ficam no banco e são impostas pela RLS, não só pela tela.
- **Situação da obra** (calculada, nunca digitada; função única em `src/lib/situacao.js`), nesta ordem: executado 100% → Concluída; paralisada → Paralisada; antes do início → Não iniciada; prazo vencido → Atrasada; prazo decorrido menos executado acima da tolerância (padrão 10 pontos) → Atrasada; demais → Em dia. Alerta à parte de obra sem atualização (padrão 10 dias).
- **Localização da obra:** um ponto (edificação, praça) ou um **trecho de via** desenhado no mapa, com uma ou mais ruas (pavimentação, drenagem, iluminação). O trecho é guardado em GeoJSON, a extensão é calculada e o pino fica no meio do segmento mais longo. No mapa, o trecho aparece na cor da situação; paralisada fica tracejada e não iniciada, pontilhada.
- **Instalações públicas:** 270 prédios e espaços do Município (secretarias, galpões, escolas, creches, UBS, hospitais, CAPS, CRAS, praças, mercados, cemitérios...) em 23 tipos agrupados por área, como quadrados azul-escuros com ícone do tipo. O botão "Instalações públicas" no mapa abre uma caixa para ligar ou desligar cada tipo ou área inteira (ex.: só escolas, só UBS); na primeira abertura aparecem só administração e serviços urbanos, para os ícones não cobrirem as obras. O balão de cada uma lista as obras vinculadas a ela e as que estão a até 500 m. Gabinete e secretário cadastram e desativam (não se exclui).
- **Página da obra:**
  - *Visão geral e Histórico:* alertas, dados do contrato e do fiscal, linha do tempo.
  - *Serviços e etapas:* a planilha orçamentária do contrato importada do Excel (.xlsx, .xls, .ods ou .csv). A importação acha o cabeçalho e as colunas sozinha (a pessoa confere e corrige), prefere o preço com BDI, transforma títulos em etapas, usa as linhas de total só para conferir a soma e compara com o valor do contrato. Depois, cada item se corrige ou se tira da planilha (volta quando quiser); dá para acrescentar itens e etapas. Filtro de serviços, materiais e equipamentos. Nova importação guarda a anterior como versão antiga.
  - *Documentos:* declaração de andamento, atestado de capacidade técnica, ficha técnica da obra e planilha de serviços e valores, em PDF e Word (a planilha também em Excel). Saem no papel timbrado (brasão, ESTADO DO MARANHÃO / PREFEITURA MUNICIPAL DE IMPERATRIZ / Secretaria; endereço, telefone, e-mail e CNPJ no rodapé), com número de controle por tipo e ano (Nº 001/2026-SINFRA), local e data por extenso, valores e percentuais por extenso e assinatura do secretário e do fiscal da obra (título e registro no CREA). Antes de emitir há uma prévia sem número. Cada emissão guarda o retrato do conteúdo: baixar de novo sai igual ao emitido.
  - Dados do papel timbrado e da assinatura do secretário: tela Configuração. Título, registro e matrícula do fiscal e CNPJ da empresa: cadastro da obra.
- **Rastreabilidade:** nada se apaga; autor e data vêm do banco; aditivo, paralisação, retomada e arquivamento apontam para um documento (número e protocolo) ou ficam como "documento pendente"; toda alteração vai para a auditoria. Documento só se completa: campo já registrado não se troca.
- **Datas e números conferidos no banco:** anos de 2000 a 2099 (barra ano digitado com 2 ou 5 algarismos), paralisação não começa antes da obra nem antes da última retomada, ato e protocolo não podem ser futuros, percentual com no máximo 2 casas.
- **Gravação segura em rede ruim:** cadastro de obra, de instalação e lançamento de percentual levam um identificador gerado no aparelho; repetir depois de a conexão cair não duplica. Percentuais digitados e não salvos ficam guardados no aparelho (rascunho por usuário) e a página avisa antes de fechar.

### Corrigir um aditivo registrado errado

Aditivo não se apaga (é ato formal). Se a data do novo término foi digitada errada, registre **outro aditivo** com a data certa, informando o mesmo termo aditivo como documento e "Correção de digitação do aditivo anterior" na justificativa. O histórico mostra os dois passos e a obra fica com o término certo. A tela já pede confirmação quando o novo término é menor que o vigente ou já passou.

## Ver a demonstração

A ferramenta tem um **modo demonstração**: sem Supabase, o mesmo banco (`supabase/schema.sql`, com as mesmas regras de acesso) roda dentro do navegador, com 10 obras fictícias. Nada sai do computador.

**No ar:** https://obras.concretta.org (enquanto não houver Supabase configurado, o site publicado está em modo demonstração). Na tela de entrada há um botão para cada perfil.

**Arquivo único para abrir sem internet de servidor:** `npm run html` gera `demonstracao/Mapa_de_Obras_SINFRA_DEMO.html` (não fica no repositório), que abre com dois cliques no Chrome ou no Edge. Precisa de internet só para o mapa de fundo.

Nos dois casos, o que for feito fica guardado só naquele navegador, e "Reiniciar demonstração" volta ao estado inicial. A demonstração abre em uma aba por vez.

**Durante o desenvolvimento:**

```bash
npm install
npm run dev
```

Na tela de entrada há um botão para cada perfil (senha `demo`).

## Estrutura

```
supabase/
  schema.sql          tabelas, gatilhos, funções, RLS e dados de referência
  instalacoes_iniciais.sql  270 prédios e espaços públicos reais, com a fonte de cada um (conferir)
  seed_demo.sql       10 obras fictícias (datas relativas ao dia da carga)
  limpar_demo.sql     remove a demonstração antes da carga real
  test/               testes do banco (PGlite + imitação do Auth do Supabase)
src/
  lib/situacao.js     regra de situação: função única usada por mapa, lista e relatório
  lib/formato.js      datas DD/MM/AAAA, R$, vírgula decimal
  lib/geo.js          trecho (GeoJSON), extensão, ponto central, distâncias
  lib/mapa.js         mapa de fundo, pinos e ícones das instalações
  lib/eventos.js      tipos de evento da obra (rótulo, documento exigido)
  lib/planilha.js     leitura da planilha orçamentária (cabeçalho, colunas, etapas, subtotais)
  lib/extenso.js      valores, percentuais e datas por extenso; número oficial
  lib/documentos/     conteúdo dos documentos (conteudo.js) e geração de PDF, Word e Excel (arquivos.js)
  api/                acesso a dados: supabase.js (produção) e demo.js (navegador),
                      com o mesmo contrato (campos.js e teste contrato.test.mjs)
  telas/              Entrar, Obras (lista e mapa), Obra (página com abas),
                      Atualizar (Lançamentos), ObraFormulario, Relatorio, Pendencias,
                      Instalacoes, Configuracao, Auditoria
  componentes/        menu lateral, tabela e mapa das obras, prévia, diálogos de
                      ação, planilha, documentos etc.
  estilo.css          padrão visual: IBM Plex Sans, bordas finas, canto de 4 px,
                      um único azul de destaque; ícones Lucide (licença ISC)
public/
  config.example.js   modelo de configuração (o config.js real fica fora do git)
  marcas/             logotipos e brasão do Município (ver LEIAME.txt)
scripts/
  gerar_html_unico.mjs  gera o HTML único da demonstração
  gerar_config.mjs      gera o config.js na publicação (recusa chave privilegiada)
```

## Implantação no Supabase (passo a passo)

Conta do Supabase: Concretta Jr.

1. **Criar o projeto** em supabase.com. Região sugerida: São Paulo. Guarde a senha do banco.
2. **Rodar o schema.** Abra o SQL Editor, cole o conteúdo de `supabase/schema.sql` e execute. Ele roda inteiro numa transação; se der erro, nada fica pela metade.
3. **Instalações públicas iniciais.** Execute `supabase/instalacoes_iniciais.sql`: 18 prédios e espaços públicos reais tirados do OpenStreetMap (Prefeitura, Hospital Municipal, escolas, creches e praças), com localização aproximada. Confira e corrija pela tela Instalações, e cadastre o que não está no OpenStreetMap: sede da SINFRA, pátio de máquinas, usina de asfalto e almoxarifado.
4. **(Opcional) Dados de demonstração.** Execute `supabase/seed_demo.sql` para mostrar a ferramenta com obras fictícias.
5. **Fechar o cadastro público.** Em Authentication, nas configurações de cadastro, desligue a opção que permite novos usuários se cadastrarem sozinhos ("Allow new users to sign up"). Os nomes dos menus do Supabase mudam com o tempo; confira na tela.
6. **Criar os usuários.** Em Authentication > Users > Add user, crie cada pessoa com e-mail e senha e marque a confirmação automática do e-mail. O banco cria o perfil sozinho, como `leitura` e **desativado** (quem não foi liberado não vê nada). Depois, no SQL Editor, defina nome e perfil e ative:

   ```sql
   update public.perfis
      set nome = 'Nome do Secretário', papel = 'secretario', ativo = true
    where id = (select id from auth.users where email = 'secretario@exemplo.com');
   ```

   Perfis: `secretario` (tudo), `admin` (gabinete), `fiscal`, `leitura`.
   Para tirar o acesso de alguém, **desative**, não exclua (o histórico guarda a autoria):

   ```sql
   update public.perfis set ativo = false
    where id = (select id from auth.users where email = 'fulano@exemplo.com');
   ```

7. **Configurar as chaves.** Em Project Settings > API, copie a URL do projeto e a **anon public key**. **Nunca** use a `service_role key` no frontend: ela ignora todas as regras de acesso.
   - No site publicado: cadastre-as como **variáveis** (não segredos) do repositório no GitHub, em Settings > Secrets and variables > Actions > Variables, com os nomes `SUPABASE_URL` e `SUPABASE_ANON_KEY`, e **apague a variável `MODO`**. A próxima publicação já sai em modo produção. A publicação recusa chave que não seja a pública (`service_role` ou `sb_secret_`).
   - Na sua máquina: copie `public/config.example.js` para `public/config.js` e preencha.
8. **Antes da carga real**, se carregou a demonstração, execute `supabase/limpar_demo.sql`. Ele apaga só as obras marcadas como demonstração e deixa uma linha na auditoria registrando a limpeza.

## Publicação (GitHub Pages)

O site é publicado sozinho a cada envio para a branch `main`, pelo GitHub Actions (`.github/workflows/publicar.yml`): instala, roda os testes, gera o `config.js` a partir das variáveis do repositório, constrói e publica. Se algum teste falhar, nada é publicado.

- O modo vem das variáveis do repositório: `MODO` = `demo` publica a **demonstração**, com o banco de exemplo já montado em `demo/banco.pgdata` (a primeira visita leva poucos segundos; as seguintes usam o que ficou no navegador); `SUPABASE_URL` e `SUPABASE_ANON_KEY` publicam a **produção**. **Sem nenhuma delas, a publicação falha de propósito**: o site nunca vira demonstração por esquecimento (quem lançasse gravaria só no próprio navegador). Quando uma publicação muda o schema ou o seed, quem já visitou a demonstração recebe o banco novo automaticamente, com um aviso.
- Para publicar manualmente sem novo envio: aba Actions > "Publicar no GitHub Pages" > Run workflow.

Configuração do repositório (feita uma vez; já está feita). O repositório está na conta `Valenca-tech` (não há organização da Concretta no GitHub); pode ser transferido para uma organização depois, trocando o destino do registro `CNAME`.

1. Settings > Pages > Build and deployment > Source: **GitHub Actions**.
2. Settings > Pages > Custom domain: `obras.concretta.org`. Numa publicação feita pelo Actions, um arquivo `CNAME` no repositório não tem efeito; o domínio fica nesta configuração.
3. DNS do concretta.org (na HostGator): registro `CNAME`, nome `obras`, destino `valenca-tech.github.io`.
4. Depois que o DNS propagar e o GitHub emitir o certificado: Settings > Pages > **Enforce HTTPS**.
5. Recomendado: verificar o domínio `concretta.org` nas configurações de Pages da conta (Settings > Pages > Add a domain; registro `TXT` na HostGator), para ninguém poder usar o subdomínio se o site sair do ar.

Para construir localmente (sai em `dist/`, publicável em qualquer hospedagem de arquivos estáticos):

```bash
npm run build
```

### Ao criar tabelas novas no futuro

O Supabase concede, por padrão, todos os privilégios em tabelas novas aos papéis `anon` e `authenticated`. Toda migração precisa repetir o bloco de `revoke` da seção 10 do `schema.sql` e habilitar a RLS da tabela nova.

## Testes

```bash
npm test
```

Cobrem a regra de situação (os seis casos e as bordas), a leitura da planilha orçamentária, o texto dos quatro documentos (número, data e valores por extenso, assinaturas), a numeração dos documentos sem buraco nem repetição, a formatação e a leitura de números no padrão brasileiro, as permissões de cada perfil (inclusive tentativas de burlar a interface direto no banco), os gatilhos, o aditivo, a paralisação com pendência documental, o documento que não se reescreve, as datas fora de faixa, a repetição de cadastro e de lançamento sem duplicar, o arquivamento, a auditoria, a limpeza da demonstração, a situação de cada obra do seed, o contrato entre `demo.js` e `supabase.js` e a recusa de chave privilegiada na publicação.

## Critérios de aceite do escopo

| # | Critério | Onde é verificado |
|---|---|---|
| 1 | Leitura vê tudo e não edita nada, também via RLS | `supabase/test/banco.test.mjs` (perfil leitura e anônimo) e menu reduzido na tela |
| 2 | Admin cadastra obra marcando o ponto no mapa e ela aparece na hora | Tela Nova obra; teste "admin cadastra obra" |
| 3 | Fiscal altera o percentual pelo celular, a cor muda pela regra, o histórico registra autor e data | Tela Atualizar; teste "fiscal lança percentual" |
| 4 | Situação de cada obra do seed confere com a regra | `supabase/test/seed_situacao.test.mjs` |
| 5 | Relatório cabe em A4, legível, atrasadas no topo | Tela Relatório (CSS de impressão A4 retrato) |
| 6 | Nenhuma chave privilegiada no frontend | Só `anon key` em `config.js`; nenhuma referência a `service_role` no código |
| 7 | README com o passo a passo | Este arquivo |

## Limitações conhecidas

- Documentos: não existe manual oficial de papel timbrado do Município publicado. O modelo segue o padrão visto nos documentos da Prefeitura e da SINFRA (brasão, três linhas de cabeçalho, endereço e CNPJ no rodapé) e o Manual de Redação da Presidência da República (margens, data, assinatura). O gabinete deve conferir com um documento recente da SINFRA. O PDF usa a fonte Roboto (embutida); o Word usa Calibri. O texto pode ser ajustado no Word antes de assinar; o número de controle fica registrado no sistema.
- Prédios públicos: localização de bases públicas (INEP, CNES, Censo SUAS, IBGE e OpenStreetMap), aproximada e com data. Ficaram de fora 6 escolas sem localização confiável e órgãos em prédios de terceiros; a lista está no cabeçalho de `instalacoes_iniciais.sql`. Pátio de máquinas, usina de asfalto e almoxarifado da SINFRA não constam em nenhuma base e devem ser cadastrados pela tela.

- A regra de atraso usa prazo linear entre início e término. Obra real segue curva S, então no início ela tende a acusar atraso cedo. A tolerância (padrão 10 pontos, ajustável pelo secretário) compensa parte disso. O módulo de cronograma (M3) resolve.
- O plano gratuito do Supabase pausa o projeto após cerca de 7 dias sem acesso.
- A camada `src/api/supabase.js` segue a mesma interface da demonstração, mas só será exercitada de ponta a ponta quando o projeto Supabase existir.
- Mapa de fundo: OpenFreeMap (vetorial, dados do OpenStreetMap), sem chave nem cadastro, com uso por governo permitido e atribuição obrigatória (fica no canto do mapa). A camada de pontos de interesse (igrejas, comércio) é retirada. Sem WebGL, ou se o OpenFreeMap não responder, o app usa o mapa padrão do OpenStreetMap, que mostra esses pontos. O trecho é desenhado à mão, ponto a ponto; não "gruda" sozinho na rua.
- Banco da demonstração: cada ação vira uma transação gravada no IndexedDB do navegador (cerca de 0,1 s). Fechar a aba no meio de uma gravação pode perder a última ação; "Reiniciar demonstração" resolve qualquer estado estranho.
- "Sair" encerra a sessão só naquele aparelho. A sessão fica guardada no navegador até sair; em computador compartilhado, sempre use "Sair".
- Datas enviadas direto à API (fora das telas) em formato dia/mês/ano podem ser lidas como mês/dia pelo Postgres. As telas sempre enviam AAAA-MM-DD.
