-- ============================================================================
-- Kiko Tier 1A — Semantic (vector) memory.  Run ONCE in the Supabase SQL editor.
-- Centerpiece of KIKO-INTELLIGENCE-RESEARCH-2026-06-14.md: lets Kiko retrieve her
-- own journals / chats / observations by MEANING, scored recency x relevance x
-- importance (the Stanford Generative-Agents formula).
--
-- Dimensions below = 1536 (OpenAI "text-embedding-3-small" — the chosen provider).
-- Add OPENAI_API_KEY as a Supabase function secret; the server (index.ts) is wired to it.
-- ============================================================================

create extension if not exists vector;

create table if not exists kiko_memories (
  id          bigint generated always as identity primary key,
  user_id     text        not null,
  kind        text        not null default 'note',   -- journal | chat | observation | fact
  text        text        not null,
  importance  int         not null default 5,        -- 1-10, Kiko-assigned at write time
  embedding   vector(1536),
  created_at  timestamptz not null default now()
);

create index if not exists kiko_memories_user_idx
  on kiko_memories (user_id);

create index if not exists kiko_memories_embedding_idx
  on kiko_memories using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Retrieval: recency (30-day exponential decay) x relevance (cosine) x importance.
create or replace function match_kiko_memories(
  p_user_id   text,
  p_embedding vector(1536),
  p_limit     int default 6
)
returns table (id bigint, text text, kind text, importance int, created_at timestamptz, score float)
language sql stable as $$
  select
    m.id, m.text, m.kind, m.importance, m.created_at,
    ( 0.50 * (1 - (m.embedding <=> p_embedding))                                   -- relevance
    + 0.25 * exp(-extract(epoch from (now() - m.created_at)) / (60*60*24*30))      -- recency (~30d half-life)
    + 0.25 * (m.importance::float / 10.0) ) as score                               -- importance
  from kiko_memories m
  where m.user_id = p_user_id and m.embedding is not null
  order by score desc
  limit p_limit;
$$;

-- ============================================================================
-- The server (index.ts) is ALREADY wired for all of this — embedText(), storeMemory(),
-- recallMemory(), the recall_memory tool, write-on-reflect, and a memWrite mode. It's
-- gated behind OPENAI_API_KEY, so it stays inert until BOTH are true:
--   1. You run THIS migration in the Supabase SQL editor, and
--   2. You add OPENAI_API_KEY as a Supabase function secret, then redeploy (update-ai.ps1).
-- Until then everything else keeps working exactly as before.
-- ============================================================================
