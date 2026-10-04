# Mapa de Obras SINFRA (piloto)

Ferramenta web para a Secretaria Municipal de Infraestrutura e Serviços Públicos de Imperatriz-MA: o gabinete cadastra as obras, o fiscal atualiza o percentual executado e o secretário vê no mapa, por cor e por texto, o que está em dia e o que está atrasado.

Piloto desenvolvido pelo IFMA Campus Imperatriz (LAEST e Concretta Jr). Responsável: Prof. Luan Henrique Varão Silva.

## Regras principais

- **Perfis:** `secretario` (acesso total, inclusive a permissões de módulos futuros), `admin` (gabinete: cadastra e mantém obras), `fiscal` (lança percentual, paralisa e retoma), `leitura` (consulta). As permissões ficam no banco e são impostas pela RLS, não só pela tela.
- **Situação da obra** (calculada, nunca digitada; função única em `src/lib/situacao.js`), nesta ordem: executado 100% → Concluída; paralisada → Paralisada; antes do início → Não iniciada; prazo vencido → Atrasada; prazo decorrido menos executado acima da tolerância (padrão 10 pontos) → Atrasada; demais → Em dia. Alerta à parte de obra sem atualização (padrão 10 dias).
- **Localização da obra:** um ponto (edificação, praça) ou um **trecho de via** desenhado no mapa, com uma ou mais ruas (pavimentação, drenagem, iluminação). O trecho é guardado em GeoJSON, a extensão é calculada e o pino fica no meio do segmento mais longo. No mapa, o trecho aparece na cor da situação; paralisada fica tracejada e não iniciada, pontilhada.
- **Instalações públicas:** sede, pátio de máquinas, usina de asfalto, almoxarifado, escolas, unidades de saúde e praças aparecem no mapa como quadrados azul-escuros. O balão de cada uma lista as obras vinculadas a ela e as que estão a até 500 m. Gabinete e secretário cadastram e desativam (não se exclui).
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
  instalacoes_iniciais.sql  18 instalações públicas reais (OpenStreetMap, conferir)
  seed_demo.sql       10 obras fictícias (datas relativas ao dia da carga)
  limpar_demo.sql     remove a demonstração antes da carga real
  test/               testes do banco (PGlite + imitação do Auth do Supabase)
src/
  lib/situacao.js     regra de situação: função única usada por mapa, lista e relatório
  lib/formato.js      datas DD/MM/AAAA, R$, vírgula decimal
  lib/geo.js          trecho (GeoJSON), extensão, ponto central, distâncias
  lib/mapa.js         mapa de fundo, pinos e ícones das instalações
  lib/eventos.js      tipos de evento da obra (rótulo, documento exigido)
  api/                acesso a dados: supabase.js (produção) e demo.js (navegador),
                      com o mesmo contrato (campos.js e teste contrato.test.mjs)
  telas/              Entrar, Mapa, Lista, Atualizar, ObraFormulario, Relatorio,
                      Pendencias, Instalacoes, Configuracao, Auditoria
  componentes/        ficha da obra, diálogos de ação, filtros, totais etc.
public/
  config.example.js   modelo de configuração (o config.js real fica fora do git)
  marcas/             logotipos (ver LEIAME.txt)
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

Cobrem a regra de situação (os seis casos e as bordas), a formatação e a leitura de números no padrão brasileiro, as permissões de cada perfil (inclusive tentativas de burlar a interface direto no banco), os gatilhos, o aditivo, a paralisação com pendência documental, o documento que não se reescreve, as datas fora de faixa, a repetição de cadastro e de lançamento sem duplicar, o arquivamento, a auditoria, a limpeza da demonstração, a situação de cada obra do seed, o contrato entre `demo.js` e `supabase.js` e a recusa de chave privilegiada na publicação.

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

- A regra de atraso usa prazo linear entre início e término. Obra real segue curva S, então no início ela tende a acusar atraso cedo. A tolerância (padrão 10 pontos, ajustável pelo secretário) compensa parte disso. O módulo de cronograma (M3) resolve.
- O plano gratuito do Supabase pausa o projeto após cerca de 7 dias sem acesso.
- A camada `src/api/supabase.js` segue a mesma interface da demonstração, mas só será exercitada de ponta a ponta quando o projeto Supabase existir.
- Mapa de fundo: OpenFreeMap (vetorial, dados do OpenStreetMap), sem chave nem cadastro, com uso por governo permitido e atribuição obrigatória (fica no canto do mapa). A camada de pontos de interesse (igrejas, comércio) é retirada. Sem WebGL, ou se o OpenFreeMap não responder, o app usa o mapa padrão do OpenStreetMap, que mostra esses pontos. O trecho é desenhado à mão, ponto a ponto; não "gruda" sozinho na rua.
- Banco da demonstração: cada ação vira uma transação gravada no IndexedDB do navegador (cerca de 0,1 s). Fechar a aba no meio de uma gravação pode perder a última ação; "Reiniciar demonstração" resolve qualquer estado estranho.
- "Sair" encerra a sessão só naquele aparelho. A sessão fica guardada no navegador até sair; em computador compartilhado, sempre use "Sair".
- Datas enviadas direto à API (fora das telas) em formato dia/mês/ano podem ser lidas como mês/dia pelo Postgres. As telas sempre enviam AAAA-MM-DD.
