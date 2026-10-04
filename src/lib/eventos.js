// Tipos de evento da linha do tempo da obra, num lugar só.
// Espelha a restrição eventos_tipo_valido e a função _tipo_documento_padrao do
// supabase/schema.sql: um tipo novo entra lá e aqui.
//
//   rotulo          texto mostrado na ficha, em Pendências e na auditoria
//   exigeDocumento  o ato precisa de documento (número e protocolo); sem ele,
//                   aparece como "documento pendente"
//   tipoDocumento   tipo de documento sugerido ao informar o documento

export const EVENTOS = {
  cadastro: { rotulo: 'Obra cadastrada', exigeDocumento: false, tipoDocumento: 'ordem_servico' },
  aditivo_prazo: { rotulo: 'Aditivo de prazo', exigeDocumento: true, tipoDocumento: 'termo_aditivo' },
  paralisacao: { rotulo: 'Paralisação', exigeDocumento: true, tipoDocumento: 'ordem_paralisacao' },
  retomada: { rotulo: 'Retomada', exigeDocumento: true, tipoDocumento: 'ordem_reinicio' },
  arquivamento: { rotulo: 'Arquivamento', exigeDocumento: true, tipoDocumento: 'despacho' },
  desarquivamento: { rotulo: 'Desarquivamento', exigeDocumento: true, tipoDocumento: 'despacho' },
};

export const rotuloEvento = (codigo) => EVENTOS[codigo]?.rotulo ?? codigo;
export const exigeDocumento = (codigo) => !!EVENTOS[codigo]?.exigeDocumento;
export const tipoDocumentoDoEvento = (codigo) => EVENTOS[codigo]?.tipoDocumento ?? 'despacho';

/** Ações do diálogo AcaoObra que registram evento -> evento correspondente. */
export const EVENTO_DA_ACAO = {
  paralisar: 'paralisacao',
  retomar: 'retomada',
  aditivo: 'aditivo_prazo',
  arquivar: 'arquivamento',
  desarquivar: 'desarquivamento',
};
