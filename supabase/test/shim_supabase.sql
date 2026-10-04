-- Imita o mínimo do Supabase para testar o schema localmente (PGlite).
-- NÃO rodar no Supabase: lá isso já existe.

create schema if not exists auth;

create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb
);

-- Mesma definição do Supabase: lê o "sub" do JWT da requisição.
create function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

create role anon nologin;
create role authenticated nologin;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Privilégios padrão do Supabase: tudo liberado; quem protege é a RLS.
-- O schema.sql precisa revogar isso, e os testes conferem.
alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
