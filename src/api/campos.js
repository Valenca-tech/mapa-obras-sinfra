// Contrato de dados compartilhado pelas duas implementações (demo.js e
// supabase.js). Espelha os GRANT por coluna do supabase/schema.sql (seção 10):
// coluna nova editável entra lá, aqui e no formulário. O teste
// supabase/test/contrato.test.mjs confere as três pontas.

/** Colunas da obra que o formulário de edição pode alterar (UPDATE direto). */
export const CAMPOS_OBRA_EDITAVEIS = [
  'nome', 'tipo', 'bairro', 'empresa', 'empresa_cnpj', 'numero_processo', 'numero_contrato', 'valor_contrato',
  'data_inicio', 'data_termino_prevista', 'latitude', 'longitude', 'trecho', 'instalacao_id',
  'fiscal_responsavel', 'fiscal_titulo', 'fiscal_registro', 'fiscal_matricula',
];

/** Configuração que o secretário edita (regra de situação, dados do órgão e assinatura). */
export const CAMPOS_CONFIGURACAO = [
  'tolerancia_atraso_pontos', 'dias_sem_atualizacao_alerta', 'orgao_nome', 'orgao_sigla', 'orgao_endereco',
  'orgao_telefone', 'orgao_email', 'prefeitura_cnpj', 'secretario_nome', 'secretario_cargo', 'secretario_matricula',
  'secretario_ato',
];

/** Colunas de um item da planilha de serviços que se corrigem direto (UPDATE). */
export const CAMPOS_ITEM_ORCAMENTO = [
  'ordem', 'nivel', 'numero', 'codigo', 'fonte', 'descricao', 'unidade', 'quantidade', 'preco_unitario',
  'total', 'tipo', 'removido',
];

/** Colunas da instalação pública que o gabinete grava (INSERT e UPDATE). */
export const CAMPOS_INSTALACAO = [
  'id', 'nome', 'tipo', 'bairro', 'endereco', 'observacao', 'latitude', 'longitude', 'ativa',
];

/** Mantém só as chaves permitidas. */
export const filtrar = (obj, permitidos) =>
  Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => permitidos.includes(k)));

/** Documento de suporte preenchido? (algum campo com valor) */
export const temDocumento = (d) => !!d && Object.values(d).some((v) => v !== null && v !== undefined && v !== '');

/** Identificador gerado no navegador: repetir a gravação não duplica o registro. */
export const novoId = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
