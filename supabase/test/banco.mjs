// Banco de teste: PGlite + imitação do Supabase + schema + seed.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const sql = (nome) => readFileSync(new URL(`../${nome}`, import.meta.url), 'utf8');
const shim = readFileSync(new URL('./shim_supabase.sql', import.meta.url), 'utf8');

export async function novoBanco({ demo = true } = {}) {
  const db = new PGlite();
  await db.exec(shim);
  await db.exec(sql('schema.sql'));
  if (demo) {
    await db.exec(sql('instalacoes_iniciais.sql'));
    await db.exec(sql('seed_demo.sql'));
  }
  return db;
}

export async function rodarArquivo(db, nome) {
  await db.exec(sql(nome));
}

// Cria usuário no "Auth" (o gatilho cria o perfil) e ajusta papel e ativo.
export async function criarUsuario(db, { email, nome, papel = 'leitura', ativo = true }) {
  const { rows } = await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, JSON.stringify({ nome })],
  );
  const id = rows[0].id;
  await db.query(`update public.perfis set papel = $2, ativo = $3 where id = $1`, [id, papel, ativo]);
  return id;
}

// Executa fn como o usuário uid (papel authenticated) ou como anônimo (uid null).
export async function como(db, uid, fn) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    uid ? JSON.stringify({ sub: uid, role: 'authenticated' }) : '',
  ]);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

export async function umValor(db, texto, params = []) {
  const { rows } = await db.query(texto, params);
  return rows[0] ? Object.values(rows[0])[0] : undefined;
}
