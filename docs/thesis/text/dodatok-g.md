# Додаток Г. Фрагмент SQL-схеми ключових таблиць

> **Статус: готовий текст для чернетки.** Замінює наявний Додаток Г цілком.
> Рішення власника 2026-09-09 (D5): фрагмент наводиться **як розгорнуто**, а не з позначкою
> «ілюстративний», бо схема — одна з небагатьох частин роботи, які читач може звірити з публічним
> репозиторієм, і позначка «ілюстративний» лише напрошується на питання, чому фрагмент не
> справжній.
>
> **Походження.** DDL нижче консолідовано з міграцій `supabase/migrations/`: базова міграція
> (`20260824120000_base.sql`) плюс чотири стовпці, додані пізніше — `propensity` (M-01,
> `20260824120100`, тип розширено до `double precision` у `20260827130000`), `conflict_flag`
> (M-02, `20260824120200`) і пара стовпців дзеркала Google Calendar (`20260828120000`), — а також
> розширена перевірка `status` (M-02) і три обмеження розміру на `events`
> (`20260824130000_p1_hardening.sql`). Жоден стовпець із цих таблиць не вилучався. Обмеження,
> додані окремими `alter table`, наведено в тілі `create table` для читності; порядок міграцій
> зберігає репозиторій.

## Г.1 Таблиця рекомендацій-розміщень

```sql
create table public.recommendations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  plan_id          uuid not null references public.plans(id),
  task_id          uuid not null references public.tasks(id),
  chunk_index      smallint not null default 0,
  slot_start       timestamptz not null,
  slot_end         timestamptz not null,
  context_bucket   text not null,          -- φ(k): частина доби × тип дня × клас позиції
  features         jsonb not null,         -- знімок 17 ознак на момент рекомендації
  q_hat            real,                   -- NULL для евристичного плеча (немає оцінки)
  confidence       real,                   -- NULL для евристичного плеча
  rationale_key    text not null,          -- ключ пояснення; текст формує клієнт
  rationale_params jsonb not null default '{}'::jsonb,
  is_experiment    boolean not null default false,
  engine           text not null check (engine in ('learned','heuristic')),
  model_version    text,                   -- тегований рядок, не зовнішній ключ
  propensity       double precision        -- M-01: p = ε/|A_m(x)|; точне на зрізі
                     check (propensity is null or (propensity > 0 and propensity <= 1)),
  conflict_flag    boolean not null default false,  -- M-02: одночасний зовнішній конфлікт
  status           text not null default 'shown'
                     constraint recommendations_status_check check (status in
                       ('shown','accepted','pinned','moved','rejected','completed',
                        'lapsed','expired','displaced_pending','displaced')),
  attributed_at    timestamptz,
  gcal_event_id            text,           -- дзеркало зворотного запису в Google Calendar
  gcal_synced_slot_start   timestamptz,
  version          int not null default 1, -- оптимістична перевірка версій під час синхронізації
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  server_seq       bigint                  -- курсор pull-фази синхронізації
);
```

Три властивості цієї таблиці варті окремої згадки в тексті роботи. По-перше, `propensity` має тип
подвійної точності, а не `real`: за чинного правила придатності точне значення може дорівнювати
1/3, яке `real` зберігає як 0,33333334 — відносна похибка ≈ 3·10⁻⁸ увійшла б у кожну вагу 1/p і
суперечила б слову «точне». По-друге, `model_version` є **теговим рядком, а не зовнішнім ключем**
на `model_registry`: у реєстрі стовпець `version` не є унікальним, тож посилання було б
некоректним. По-третє, `q_hat` і `confidence` дорівнюють NULL на рядках евристичного плеча —
жодного вигаданого числа в журнал не потрапляє (клієнт відображає NULL сталою щільністю й не
називає відсотка).

## Г.2 Журнал поведінкових фактів

```sql
create table public.events (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  op_id             text not null,          -- клієнтський ULID; монотонний у межах пристрою
  type              text not null,
  task_id           uuid references public.tasks(id),
  recommendation_id uuid references public.recommendations(id),
  payload           jsonb not null default '{}'::jsonb,
  context           jsonb not null default '{}'::jsonb,
  client_ts         timestamptz not null,
  server_ts         timestamptz not null default now(),
  local_day         date not null,          -- локальна дата користувача для нічної атрибуції
  unique (user_id, op_id),                  -- ідемпотентність повторного відтворення
  constraint events_op_id_len   check (char_length(op_id) <= 128),
  constraint events_payload_size check (pg_column_size(payload) <= 65536),
  constraint events_context_size check (pg_column_size(context) <= 65536)
);
```

`op_id` є текстовим ідентифікатором, який породжує клієнт, а не серійним числом сервера: саме це
робить повторне надсилання операції безпечним на рівні обмеження цілісності, без будь-якої логіки
дедуплікації. Обмеження `unique (user_id, op_id)` і є механізмом ідемпотентності, про який ідеться
в підрозділі 3.6.

## Г.3 Ізоляція даних на рівні рядків

```sql
alter table public.recommendations enable row level security;
alter table public.events          enable row level security;

-- рекомендації: читання власних рядків; запис звужено до двох стовпців
revoke all on public.recommendations from authenticated;
grant  select                      on public.recommendations to authenticated;
grant  update (status, version)    on public.recommendations to authenticated;
create policy recommendations_select on public.recommendations for select
  using ((select auth.uid()) = user_id);
create policy recommendations_update on public.recommendations for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- події: для клієнта журнал доступний лише на дописування
revoke all on public.events from authenticated;
grant  select, insert on public.events to authenticated;
create policy events_select on public.events for select
  using ((select auth.uid()) = user_id);
create policy events_insert on public.events for insert
  with check ((select auth.uid()) = user_id);
```

Права дібрано так, щоб клієнт не міг зробити того, чого йому не належить, навіть будучи
скомпрометованим. На `recommendations` він має право оновити **лише** `status` і `version`; окремий
тригер додатково звужує допустимі значення статусу до набору перегляду плану
(`accepted`, `pinned`, `moved`, `rejected`), тож станів `completed` і `lapsed` клієнт на сервері не
встановлює — їх встановлює розв'язання конфліктів синхронізації та нічна атрибуція відповідно. На
`events` клієнт має `select` і `insert` і не має ані `update`, ані `delete`: журнал є
append-only не за домовленістю, а за правами доступу.
