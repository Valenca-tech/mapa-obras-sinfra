// Contrato entre as duas implementações de dados (demo.js e supabase.js) e o
// schema.sql: mesmas funções exportadas e mesmas colunas editáveis.
// Rodar com: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAMPOS_OBRA_EDITAVEIS, CAMPOS_INSTALACAO, CAMPOS_CONFIGURACAO, CAMPOS_ITEM_ORCAMENTO,
} from '../../src/api/campos.js';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

// Nomes exportados, lidos do texto (demo.js importa arquivos ?raw do Vite e
// não roda no Node).
function exportados(texto) {
  const nomes = new Set();
  for (const m of texto.matchAll(/^export (?:async )?(?:function|const|let|class) (\w+)/gm)) nomes.add(m[1]);
  for (const m of texto.matchAll(/^export \{([^}]+)\}/gm)) {
    for (const n of m[1].split(',')) nomes.add(n.trim().split(/\s+as\s+/).pop());
  }
  return nomes;
}

// Colunas de um GRANT do schema: grant <op> (a, b, c) on public.<tabela>
function colunasDoGrant(schema, operacao, tabela) {
  const re = new RegExp(`grant ${operacao} \\(([^)]+)\\)\\s+on public\\.${tabela} to authenticated`, 'i');
  const m = schema.match(re);
  assert.ok(m, `grant ${operacao} em ${tabela} não encontrado`);
  return m[1].split(',').map((c) => c.trim()).sort();
}

test('demo.js e supabase.js exportam as mesmas funções', () => {
  const demo = exportados(ler('../../src/api/demo.js'));
  const producao = exportados(ler('../../src/api/supabase.js'));
  const soDemo = [...demo].filter((n) => !producao.has(n) && n !== 'SENHA_DEMO');
  const soProducao = [...producao].filter((n) => !demo.has(n));
  assert.deepEqual(soDemo, [], 'faltam em supabase.js');
  assert.deepEqual(soProducao, [], 'faltam em demo.js');
});

test('colunas editáveis do frontend batem com os GRANT do schema', () => {
  const schema = ler('../schema.sql');
  assert.deepEqual(colunasDoGrant(schema, 'update', 'obras'), [...CAMPOS_OBRA_EDITAVEIS].sort());
  assert.deepEqual(colunasDoGrant(schema, 'insert', 'instalacoes'), [...CAMPOS_INSTALACAO].sort());
  assert.deepEqual(
    colunasDoGrant(schema, 'update', 'instalacoes'),
    CAMPOS_INSTALACAO.filter((c) => c !== 'id').sort(),
  );
  assert.deepEqual(colunasDoGrant(schema, 'insert', 'atualizacoes'), ['id', 'obra_id', 'observacao', 'percentual_executado']);
  assert.deepEqual(colunasDoGrant(schema, 'update', 'configuracao'), [...CAMPOS_CONFIGURACAO].sort());
  assert.deepEqual(colunasDoGrant(schema, 'update', 'orcamento_itens'), [...CAMPOS_ITEM_ORCAMENTO].sort());
});
