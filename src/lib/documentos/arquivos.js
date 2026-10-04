// Gera e baixa os arquivos (PDF, Word e Excel) a partir do modelo de
// conteudo.js. As bibliotecas (pdfmake, docx, SheetJS) só carregam na primeira
// emissão: quem só consulta o mapa não as baixa.
import { textoCelula } from './conteudo.js';

// Brasão do Município (Lei Municipal 346/1985: obrigatório nos papéis
// oficiais). No HTML único da demonstração este caminho vira data URI.
const BRASAO = 'marcas/brasao_imperatriz.png';
const BRASAO_PROPORCAO = 262 / 320; // largura / altura do arquivo

let brasao;
function carregarBrasao() {
  brasao ??= fetch(BRASAO)
    .then((r) => {
      if (!r.ok) throw new Error(`brasão indisponível (${r.status})`);
      return r.arrayBuffer();
    })
    .catch((e) => {
      brasao = undefined;
      throw e;
    });
  return brasao;
}

function paraDataUri(buffer) {
  let binario = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(binario)}`;
}

/** Entrega o arquivo ao navegador (botão "baixar"). */
export function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---------------------------------------------------------------- PDF (pdfmake)

const PT_POR_CM = 28.3465;
const A4 = { largura: 595.28, altura: 841.89 };

function margensPdf(paisagem) {
  // Manual de Redação: 3 cm à esquerda e 1,5 cm à direita. A planilha, deitada,
  // usa 2 cm à esquerda para caber a tabela.
  return { esquerda: (paisagem ? 2 : 3) * PT_POR_CM, direita: 1.5 * PT_POR_CM, topo: (paisagem ? 3.2 : 4.6) * PT_POR_CM, base: 2.6 * PT_POR_CM };
}

const ALINHAR_PDF = { esquerda: 'left', direita: 'right', centro: 'center' };

function tabelaPdf(b, larguraUtil) {
  const soma = b.colunas.reduce((s, c) => s + c.largura, 0);
  const fonte = b.pequena ? 7.5 : 9;
  const corpo = [
    b.colunas.map((c) => ({ text: c.titulo, bold: true, fillColor: '#d9e1ea', alignment: ALINHAR_PDF[c.alinhar] ?? 'left' })),
    ...b.linhas.map((l) =>
      l.celulas.map((cel, i) => ({
        text: textoCelula(cel),
        alignment: ALINHAR_PDF[b.colunas[i].alinhar] ?? 'left',
        bold: !!l.estilo,
        fillColor: l.estilo === 'etapa' ? '#eef2f6' : l.estilo === 'total' ? '#d9e1ea' : undefined,
      })),
    ),
  ];
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: b.colunas.map((c) => (c.largura / soma) * larguraUtil - 6.5),
      body: corpo,
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#8a94a6',
      vLineColor: () => '#8a94a6',
      paddingLeft: () => 3,
      paddingRight: () => 3,
      paddingTop: () => 2,
      paddingBottom: () => 2,
    },
    fontSize: fonte,
    margin: [0, 0, 0, 10],
  };
}

function blocoPdf(b, larguraUtil) {
  switch (b.tipo) {
    case 'paragrafo':
      return {
        // hífen inquebrável em "encontra-se": a justificação não abre espaço nele
        text: b.trechos.map((t) => ({ text: t.t.replace(/(\p{L})-(\p{L})/gu, '$1‑$2'), bold: t.b })),
        alignment: 'justify',
        leadingIndent: b.recuo ? 1.25 * PT_POR_CM : 0,
        fontSize: b.pequeno ? 9 : 11,
        lineHeight: 1.3,
        margin: [0, 0, 0, 9],
      };
    case 'secao':
      return { text: b.texto, bold: true, fontSize: 10.5, margin: [0, 8, 0, 5] };
    case 'dados':
      return {
        table: {
          widths: ['34%', '*'],
          body: b.pares.map(([rotulo, valor]) => [
            { text: rotulo, bold: true, fillColor: '#f1f4f8' },
            { text: String(valor ?? '') },
          ]),
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#b8c0cc',
          vLineColor: () => '#b8c0cc',
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
        fontSize: b.compacto ? 9 : 10,
        margin: [0, 0, 0, 10],
      };
    case 'tabela':
      return tabelaPdf(b, larguraUtil);
    default:
      return { text: '' };
  }
}

// Título de seção não fica sozinho no pé da página: vai junto com o bloco
// seguinte (inteiro, se for curto).
function blocosPdf(blocos, larguraUtil) {
  const saida = [];
  for (let i = 0; i < blocos.length; i++) {
    const b = blocos[i];
    const seguinte = blocos[i + 1];
    if (b.tipo === 'secao' && seguinte) {
      const curto = seguinte.tipo !== 'tabela' || seguinte.linhas.length <= 20;
      saida.push({ stack: [blocoPdf(b, larguraUtil), blocoPdf(seguinte, larguraUtil)], unbreakable: curto });
      i++;
    } else {
      saida.push(blocoPdf(b, larguraUtil));
    }
  }
  return saida;
}

function assinaturasPdf(lista) {
  return {
    columns: lista.map((a) => ({
      width: '*',
      stack: [
        { canvas: [{ type: 'line', x1: 10, y1: 0, x2: 200, y2: 0, lineWidth: 0.7 }], alignment: 'center' },
        { text: a.nome, bold: true, fontSize: 10.5, margin: [0, 4, 0, 1] },
        ...a.linhas.map((l) => ({ text: l, fontSize: 9.5 })),
      ],
      alignment: 'center',
    })),
    columnGap: 20,
    unbreakable: true,
    margin: [0, 40, 0, 0],
  };
}

let pdfMakeCarregado;
function carregarPdfMake() {
  pdfMakeCarregado ??= Promise.all([import('pdfmake/build/pdfmake.js'), import('pdfmake/build/vfs_fonts.js')])
    .then(([modulo, fontes]) => {
      const pdfMake = modulo.default ?? modulo;
      const vfs = fontes.default ?? fontes;
      if (pdfMake.addVirtualFileSystem) pdfMake.addVirtualFileSystem(vfs);
      else pdfMake.vfs = vfs;
      return pdfMake;
    })
    .catch((e) => {
      pdfMakeCarregado = undefined;
      throw e;
    });
  return pdfMakeCarregado;
}

/** PDF do modelo, como Blob. */
export async function gerarPdf(doc) {
  const [pdfMake, imagem] = await Promise.all([carregarPdfMake(), carregarBrasao()]);
  const m = margensPdf(doc.paisagem);
  const larguraPagina = doc.paisagem ? A4.altura : A4.largura;
  const larguraUtil = larguraPagina - m.esquerda - m.direita;
  const brasaoUri = paraDataUri(imagem);
  const alturaBrasao = 2 * PT_POR_CM;

  const definicao = {
    pageSize: 'A4',
    pageOrientation: doc.paisagem ? 'landscape' : 'portrait',
    pageMargins: [m.esquerda, m.topo, m.direita, m.base],
    info: { title: `${doc.titulo} ${doc.numero}`, author: doc.timbre.linhas[2], creator: 'Central de Obras SINFRA' },
    defaultStyle: { font: 'Roboto', fontSize: 11, color: '#111111' },
    watermark: doc.previa ? { text: 'PRÉVIA', color: '#1d3a5f', opacity: 0.08, bold: true } : undefined,
    // Retrato: brasão no alto, centralizado, e as três linhas embaixo. Paisagem
    // (planilha): brasão à esquerda das linhas, como nas pranchas técnicas, para
    // sobrar altura para a tabela.
    header: () =>
      doc.paisagem
        ? {
          margin: [m.esquerda, 0.6 * PT_POR_CM, m.direita, 0],
          columns: [
            { image: brasaoUri, width: 1.6 * PT_POR_CM * BRASAO_PROPORCAO, height: 1.6 * PT_POR_CM },
            { width: '*', text: doc.timbre.linhas.join('\n'), bold: true, fontSize: 9.5, lineHeight: 1.15, margin: [0, 6, 0, 0] },
          ],
          columnGap: 10,
        }
        : {
          margin: [m.esquerda, 0.7 * PT_POR_CM, m.direita, 0],
          stack: [
            { image: brasaoUri, width: alturaBrasao * BRASAO_PROPORCAO, height: alturaBrasao, alignment: 'center' },
            { text: doc.timbre.linhas.join('\n'), bold: true, fontSize: 9.5, alignment: 'center', lineHeight: 1.15, margin: [0, 4, 0, 0] },
          ],
        },
    footer: (atual, total) => ({
      margin: [m.esquerda, 6, m.direita, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: larguraUtil, y2: 0, lineWidth: 0.6, lineColor: '#1d3a5f' }] },
        {
          columns: [
            { width: '*', text: doc.timbre.rodape.join('\n'), fontSize: 7, color: '#333333', lineHeight: 1.15 },
            { width: 1, canvas: [{ type: 'line', x1: 0, y1: 0, x2: 0, y2: 30, lineWidth: 0.6, lineColor: '#1d3a5f' }] },
            {
              width: 130,
              stack: [
                { text: doc.timbre.site, fontSize: 7.5, bold: true, color: '#1d3a5f' },
                { text: `Página ${atual} de ${total}`, fontSize: 7, color: '#333333', margin: [0, 3, 0, 0] },
              ],
              alignment: 'right',
            },
          ],
          columnGap: 8,
          margin: [0, 5, 0, 0],
        },
      ],
    }),
    content: [
      { text: doc.titulo, bold: true, fontSize: 13, alignment: 'center', margin: [0, 4, 0, 2] },
      { text: doc.numero, fontSize: 10.5, alignment: 'center', margin: [0, 0, 0, 16] },
      ...blocosPdf(doc.blocos, larguraUtil),
      { text: doc.fecho, alignment: 'right', margin: [0, 14, 0, 0] },
      assinaturasPdf(doc.assinaturas),
    ],
  };
  const blob = await pdfMake.createPdf(definicao).getBlob();
  return blob;
}

// ---------------------------------------------------------------- Word (docx)

const TWIP_POR_CM = 567;

export async function gerarWord(doc) {
  const [d, imagem] = await Promise.all([import('docx'), carregarBrasao()]);
  const {
    Document, Packer, Paragraph, TextRun, Header, Footer, ImageRun, AlignmentType, Table, TableRow, TableCell,
    WidthType, BorderStyle, PageNumber, PageOrientation, ShadingType, TableLayoutType,
  } = d;

  const FONTE = 'Calibri';
  const margemEsq = (doc.paisagem ? 2 : 3) * TWIP_POR_CM;
  const margemDir = 1.5 * TWIP_POR_CM;
  const larguraUtil = (doc.paisagem ? 16838 : 11906) - margemEsq - margemDir;
  const semBorda = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const bordaFina = { style: BorderStyle.SINGLE, size: 4, color: '8A94A6' };
  const ALINHAR = { esquerda: AlignmentType.LEFT, direita: AlignmentType.RIGHT, centro: AlignmentType.CENTER };

  const run = (texto, extra = {}) => new TextRun({ text: texto, font: FONTE, size: 24, ...extra });

  // cabeçalho: brasão e as três linhas (na planilha deitada, lado a lado)
  const alturaPx = 76; // ~2 cm
  const cabecalhoPaisagem = () =>
    new Header({
      children: [
        new Table({
          width: { size: larguraUtil, type: WidthType.DXA },
          columnWidths: [1100, larguraUtil - 1100],
          layout: TableLayoutType.FIXED,
          borders: { top: semBorda, bottom: semBorda, left: semBorda, right: semBorda, insideHorizontal: semBorda, insideVertical: semBorda },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 1100, type: WidthType.DXA },
                  children: [
                    new Paragraph({
                      children: [new ImageRun({ type: 'png', data: imagem, transformation: { width: Math.round(60 * BRASAO_PROPORCAO), height: 60 } })],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: larguraUtil - 1100, type: WidthType.DXA },
                  children: doc.timbre.linhas.map(
                    (l, i) => new Paragraph({ spacing: { before: i === 0 ? 120 : 0 }, children: [run(l, { bold: true, size: 19 })] }),
                  ),
                }),
              ],
            }),
          ],
        }),
        new Paragraph({ spacing: { after: 60 }, children: [] }),
      ],
    });
  const cabecalho = doc.paisagem ? cabecalhoPaisagem() : new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({ type: 'png', data: imagem, transformation: { width: Math.round(alturaPx * BRASAO_PROPORCAO), height: alturaPx } }),
        ],
      }),
      ...doc.timbre.linhas.map(
        (l, i) =>
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: i === 0 ? 60 : 0, after: i === doc.timbre.linhas.length - 1 ? 120 : 0 },
            children: [run(l, { bold: true, size: 19 })],
          }),
      ),
    ],
  });

  // rodapé: endereço | site e página
  const rodape = new Footer({
    children: [
      new Table({
        width: { size: larguraUtil, type: WidthType.DXA },
        columnWidths: [larguraUtil - 2600, 2600],
        layout: TableLayoutType.FIXED,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 6, color: '1D3A5F' },
          bottom: semBorda, left: semBorda, right: semBorda, insideHorizontal: semBorda,
          insideVertical: { style: BorderStyle.SINGLE, size: 6, color: '1D3A5F' },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: larguraUtil - 2600, type: WidthType.DXA },
                children: doc.timbre.rodape.map((l) => new Paragraph({ children: [run(l, { size: 14 })] })),
              }),
              new TableCell({
                width: { size: 2600, type: WidthType.DXA },
                children: [
                  new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(doc.timbre.site, { size: 15, bold: true, color: '1D3A5F' })] }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ font: FONTE, size: 14, children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES] })],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const tabela = (b) => {
    const soma = b.colunas.reduce((s, c) => s + c.largura, 0);
    const larguras = b.colunas.map((c) => Math.floor((c.largura / soma) * larguraUtil));
    const tam = b.pequena ? 15 : 18;
    const celula = (texto, i, { negrito = false, fundo = null } = {}) =>
      new TableCell({
        width: { size: larguras[i], type: WidthType.DXA },
        shading: fundo ? { type: ShadingType.CLEAR, color: 'auto', fill: fundo } : undefined,
        margins: { left: 60, right: 60, top: 20, bottom: 20 },
        children: [new Paragraph({ alignment: ALINHAR[b.colunas[i].alinhar], children: [run(texto, { size: tam, bold: negrito })] })],
      });
    return new Table({
      width: { size: larguraUtil, type: WidthType.DXA },
      columnWidths: larguras,
      layout: TableLayoutType.FIXED,
      borders: { top: bordaFina, bottom: bordaFina, left: bordaFina, right: bordaFina, insideHorizontal: bordaFina, insideVertical: bordaFina },
      rows: [
        new TableRow({ tableHeader: true, children: b.colunas.map((c, i) => celula(c.titulo, i, { negrito: true, fundo: 'D9E1EA' })) }),
        ...b.linhas.map(
          (l) =>
            new TableRow({
              cantSplit: true,
              children: l.celulas.map((cel, i) =>
                celula(textoCelula(cel), i, {
                  negrito: !!l.estilo,
                  fundo: l.estilo === 'etapa' ? 'EEF2F6' : l.estilo === 'total' ? 'D9E1EA' : null,
                }),
              ),
            }),
        ),
      ],
    });
  };

  const dados = (b) => {
    const l1 = Math.floor(larguraUtil * 0.34);
    const borda = { style: BorderStyle.SINGLE, size: 4, color: 'B8C0CC' };
    const tam = b.compacto ? 18 : 20;
    return new Table({
      width: { size: larguraUtil, type: WidthType.DXA },
      columnWidths: [l1, larguraUtil - l1],
      layout: TableLayoutType.FIXED,
      borders: { top: borda, bottom: borda, left: borda, right: borda, insideHorizontal: borda, insideVertical: borda },
      rows: b.pares.map(
        ([rotulo, valor]) =>
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: l1, type: WidthType.DXA },
                shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F4F8' },
                margins: { left: 80, right: 80, top: 40, bottom: 40 },
                children: [new Paragraph({ children: [run(rotulo, { bold: true, size: tam })] })],
              }),
              new TableCell({
                width: { size: larguraUtil - l1, type: WidthType.DXA },
                margins: { left: 80, right: 80, top: 40, bottom: 40 },
                children: [new Paragraph({ children: [run(String(valor ?? ''), { size: tam })] })],
              }),
            ],
          }),
      ),
    });
  };

  const espaco = () => new Paragraph({ spacing: { after: 120 }, children: [] });
  const corpo = [];
  corpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [run(doc.titulo, { bold: true, size: 26 })] }));
  corpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [run(doc.numero, { size: 21 })] }));
  for (const b of doc.blocos) {
    if (b.tipo === 'paragrafo') {
      corpo.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: b.recuo ? { firstLine: Math.round(1.25 * TWIP_POR_CM) } : undefined,
          spacing: { after: 160, line: 312 },
          children: b.trechos.map((t) => run(t.t, { bold: t.b, size: b.pequeno ? 18 : 24 })),
        }),
      );
    } else if (b.tipo === 'secao') {
      corpo.push(new Paragraph({ spacing: { before: 200, after: 100 }, keepNext: true, children: [run(b.texto, { bold: true, size: 21 })] }));
    } else if (b.tipo === 'dados') {
      corpo.push(dados(b), espaco());
    } else if (b.tipo === 'tabela') {
      corpo.push(tabela(b), espaco());
    }
  }
  corpo.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 240, after: 720 }, children: [run(doc.fecho)] }));

  // assinaturas lado a lado, com a linha acima do nome
  const n = doc.assinaturas.length;
  const largCol = Math.floor(larguraUtil / n);
  corpo.push(
    new Table({
      width: { size: larguraUtil, type: WidthType.DXA },
      columnWidths: Array(n).fill(largCol),
      layout: TableLayoutType.FIXED,
      borders: { top: semBorda, bottom: semBorda, left: semBorda, right: semBorda, insideHorizontal: semBorda, insideVertical: semBorda },
      rows: [
        new TableRow({
          cantSplit: true,
          children: doc.assinaturas.map(
            (a) =>
              new TableCell({
                width: { size: largCol, type: WidthType.DXA },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    indent: { left: 300, right: 300 },
                    border: { top: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 4 } },
                    children: [run(a.nome, { bold: true, size: 21 })],
                  }),
                  ...a.linhas.map((l) => new Paragraph({ alignment: AlignmentType.CENTER, children: [run(l, { size: 19 })] })),
                ],
              }),
          ),
        }),
      ],
    }),
  );

  const documento = new Document({
    creator: 'Central de Obras SINFRA',
    title: `${doc.titulo} ${doc.numero}`,
    styles: { default: { document: { run: { font: FONTE, size: 24 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: doc.paisagem ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
            margin: { top: (doc.paisagem ? 2.8 : 3.6) * TWIP_POR_CM, bottom: 2.4 * TWIP_POR_CM, left: margemEsq, right: margemDir, header: 0.7 * TWIP_POR_CM, footer: 0.6 * TWIP_POR_CM },
          },
        },
        headers: { default: cabecalho },
        footers: { default: rodape },
        children: corpo,
      },
    ],
  });
  return Packer.toBlob(documento);
}

// ---------------------------------------------------------------- Excel (SheetJS), só a planilha

export async function gerarExcel(doc) {
  if (!doc.planilha) throw new Error('Este documento não tem versão em Excel.');
  const XLSX = await import('xlsx');
  const { colunas, linhas } = doc.planilha;
  const dados = doc.blocos.find((b) => b.tipo === 'dados');
  const aoa = [
    ...doc.timbre.linhas.map((l) => [l]),
    [],
    [`${doc.titulo} ${doc.numero}`],
    ...(dados?.pares ?? []).map(([r, v]) => [r, v]),
    [],
    colunas.map((c) => c.titulo),
  ];
  const inicioTabela = aoa.length;
  for (const l of linhas) aoa.push(l.celulas.map((c) => (c && typeof c === 'object' ? c.n : c ?? '')));
  aoa.push([]);
  aoa.push([doc.fecho]);
  for (const a of doc.assinaturas) aoa.push([`${a.nome}, ${a.linhas.join(', ')}`]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // formato numérico (o Excel mostra no padrão do computador: 1.234,56)
  linhas.forEach((l, i) =>
    l.celulas.forEach((c, j) => {
      if (!c || typeof c !== 'object') return;
      const ref = XLSX.utils.encode_cell({ r: inicioTabela + i, c: j });
      if (ws[ref]) ws[ref].z = c.fmt === 'moeda' ? '#,##0.00' : '#,##0.00##';
    }),
  );
  ws['!cols'] = colunas.map((c) => ({ wch: Math.max(8, Math.round(c.largura * 1.6)) }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: inicioTabela - 1, c: 0 }, e: { r: inicioTabela + linhas.length - 1, c: colunas.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha');
  const saida = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([saida], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export const FORMATOS = {
  pdf: { rotulo: 'PDF', extensao: 'pdf', gerar: gerarPdf },
  word: { rotulo: 'Word', extensao: 'docx', gerar: gerarWord },
  excel: { rotulo: 'Excel', extensao: 'xlsx', gerar: gerarExcel },
};

/** Gera no formato pedido e baixa. */
export async function gerarEBaixar(doc, formato) {
  const f = FORMATOS[formato];
  const blob = await f.gerar(doc);
  baixar(blob, `${doc.nomeArquivo}.${f.extensao}`);
}
