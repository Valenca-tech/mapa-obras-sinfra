// Dados da demonstração, compartilhados entre o navegador (demo.js) e o
// gerador do HTML único (scripts/gerar_html_unico.mjs). Sem dependência de
// navegador: roda também no Node.

export const NOME_BANCO = 'mapa-obras-sinfra-demo';
export const SENHA_DEMO = 'demo';

export const usuariosDemo = [
  { email: 'secretario@demo', nome: 'Secretário (demonstração)', papel: 'secretario', rotulo: 'Secretário' },
  { email: 'gabinete@demo', nome: 'Gabinete (demonstração)', papel: 'admin', rotulo: 'Gabinete (admin)' },
  { email: 'fiscal@demo', nome: 'Fiscal (demonstração)', papel: 'fiscal', rotulo: 'Fiscal' },
  { email: 'consulta@demo', nome: 'Consulta (demonstração)', papel: 'leitura', rotulo: 'Consulta (leitura)' },
];

/**
 * Versão do banco da demonstração, derivada do conteúdo (schema, seed, imitação
 * do Auth e usuários). Entra no nome do banco no IndexedDB e na URL do banco
 * pronto: quando uma publicação muda o schema, o navegador não reaproveita o
 * banco antigo nem um arquivo velho do cache. FNV-1a de 32 bits.
 */
export function versaoDemo({ shim, schema, seed, instalacoes = '' }) {
  // fim de linha normalizado: o checkout no Windows pode trazer CRLF
  const texto = [shim, schema, seed, instalacoes, JSON.stringify(usuariosDemo)].join('|').replace(/\r\n/g, '\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Monta o banco da demonstração do zero: imitação do Auth, schema, instalações, obras e usuários. */
export async function popularDemonstracao(db, { shim, schema, seed, instalacoes }) {
  await db.exec(shim);
  await db.exec(schema);
  if (instalacoes) await db.exec(instalacoes);
  await db.exec(seed);
  for (const u of usuariosDemo) {
    const r = await db.query(
      'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
      [u.email, JSON.stringify({ nome: u.nome })],
    );
    await db.query('update public.perfis set papel = $2, ativo = true where id = $1', [r.rows[0].id, u.papel]);
  }
}

/**
 * O HTML único traz o banco já pronto, montado no dia em que o arquivo foi
 * gerado. Ao abrir em outro dia, todas as datas da demonstração andam o mesmo
 * número de dias, para cada obra continuar na situação planejada (o seed é
 * relativo a "hoje"). Roda uma única vez, na primeira abertura.
 */
export function sqlDeslocarDatas(dias) {
  const n = Number.parseInt(dias, 10);
  const i = `interval '${n} days'`;
  return `
    begin;
    -- sem auditoria e sem a trava do aditivo: é ajuste da demonstração, não ato de usuário
    select set_config('app.sem_auditoria', 'on', true), set_config('app.origem', 'aditivo', true);
    update public.obras set
      data_inicio = data_inicio + ${n},
      data_termino_prevista = data_termino_prevista + ${n},
      data_termino_original = data_termino_original + ${n},
      paralisada_desde = paralisada_desde + ${n},
      ultima_atualizacao_em = ultima_atualizacao_em + ${i},
      criado_em = criado_em + ${i}
    where demo;
    update public.atualizacoes set criado_em = criado_em + ${i};
    update public.eventos_obra set
      data_evento = data_evento + ${n},
      criado_em = criado_em + ${i},
      dados = case when tipo = 'aditivo_prazo' then jsonb_build_object(
                'termino_anterior', (dados ->> 'termino_anterior')::date + ${n},
                'termino_novo', (dados ->> 'termino_novo')::date + ${n})
              else dados end;
    update public.documentos set
      data_protocolo = data_protocolo + ${n},
      data_documento = data_documento + ${n},
      criado_em = criado_em + ${i};
    update public.orcamentos set criado_em = criado_em + ${i}
     where obra_id in (select id from public.obras where demo);
    commit;`;
}
