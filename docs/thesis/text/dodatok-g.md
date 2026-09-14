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

## Г.1. Таблиця рекомендацій-розміщень

```sql
create table public.recommendations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  plan_id          uuid not null references public.plans(id),
  task_id          uuid not null references public.tasks(id),
  chunk_index      smallint not null default 0,
  slot_start       timestamptz not null,
  slot_end         timestamptz not null,
  context_bucket   text not null,
  features         jsonb not null,
  q_hat            real,
  confidence       real,
  rationale_key    text not null,
  rationale_params jsonb not null default '{}'::jsonb,
  is_experiment    boolean not null default false,
  engine           text not null check (engine in ('learned','heuristic')),
  model_version    text,
  propensity       double precision
                     check (propensity is null or (propensity > 0 and propensity <= 1)),
  conflict_flag    boolean not null default false,
  status           text not null default 'shown'
                     constraint recommendations_status_check check (status in
                       ('shown','accepted','pinned','moved','rejected','completed',
                        'lapsed','expired','displaced_pending','displaced')),
  attributed_at    timestamptz,
  gcal_event_id            text,
  gcal_synced_slot_start   timestamptz,
  version          int not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  server_seq       bigint
);
```

Призначення стовпців, яке не випливає з їхніх типів: `context_bucket` – значення функції бакетизації
φ(k), тобто частина доби × тип дня × клас позиції; `features` – знімок сімнадцяти ознак на момент
рекомендації; `q_hat` і `confidence` – оцінка ймовірності виконання та її впевненість;
`rationale_key` – ключ пояснення, текст якого формує клієнт із параметрів `rationale_params`;
`model_version` – тег версії моделі; `propensity` – пропенсіті рандомізованого зрізу (M-01), точне
значення p = ε/|A_m(x)|; `conflict_flag` – ознака одночасного зовнішнього конфлікту (M-02);
`gcal_event_id` – дзеркало зворотного запису в Google Calendar; `version` – лічильник оптимістичної
перевірки версій під час синхронізації; `server_seq` – курсор pull-фази синхронізації; `chunk_index`
– номер частини подільної задачі; `is_experiment` – ознака рандомізованого зрізу (маркування
«експеримент» на клієнті); `engine` – рушій, що породив рядок; `status` – стан рядка, від
початкового `shown` до `expired` для рядків, закритих витісненням плану; `attributed_at` – момент
атрибуції, який пізня корекція зберігає; `gcal_synced_slot_start` – початок інтервалу, останнім
записаний у Google Calendar; `propensity` дорівнює NULL поза рандомізованим зрізом.

Три властивості цієї таблиці варті окремої згадки. По-перше, `propensity` має тип подвійної
точності, а не `real`: за правилом придатності точне значення може дорівнювати 1/3, яке `real`
зберігає як 0,33333334 – відносна похибка ≈ 3·10⁻⁸ увійшла б у кожну вагу 1/p і суперечила б слову
«точне». По-друге, `model_version` є теговим рядком, а не зовнішнім ключем на `model_registry`: у
реєстрі стовпець `version` не є унікальним, тож посилання було б некоректним. По-третє, `q_hat` і
`confidence` дорівнюють NULL на рядках евристичного плеча – жодного вигаданого числа в журнал не
потрапляє (клієнт відображає NULL сталою щільністю й не називає відсотка).

## Г.2. Журнал поведінкових фактів

```sql
create table public.events (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  op_id             text not null,
  type              text not null,
  task_id           uuid references public.tasks(id),
  recommendation_id uuid references public.recommendations(id),
  payload           jsonb not null default '{}'::jsonb,
  context           jsonb not null default '{}'::jsonb,
  client_ts         timestamptz not null,
  server_ts         timestamptz not null default now(),
  local_day         date not null,
  unique (user_id, op_id),
  constraint events_op_id_len   check (char_length(op_id) <= 128),
  constraint events_payload_size check (pg_column_size(payload) <= 65536),
  constraint events_context_size check (pg_column_size(context) <= 65536)
);
```

`op_id` є текстовим ідентифікатором (ULID), який породжує клієнт і який монотонний у межах пристрою,
а не серійним числом сервера: саме це робить повторне надсилання операції безпечним на рівні
обмеження цілісності, без будь-якої логіки дедуплікації. Обмеження `unique (user_id, op_id)` і є
механізмом ідемпотентності повторного відтворення, про який ідеться в підрозділі 3.6. `local_day`
зберігає локальну дату користувача, за якою нічна атрибуція відбирає події дня. `type` – тип факту
(наприклад, `task_completed`, `focus_start`, `lapse_observed`); `payload` – дані самого факту,
`context` – знімок контексту на момент факту; три іменовані обмеження розміру (`op_id` до 128
символів, `payload` і `context` до 64 КіБ) обмежують те, що клієнт із правом `insert` може записати
в журнал.

## Г.3. Ізоляція даних на рівні рядків

```sql
alter table public.recommendations enable row level security;
alter table public.events          enable row level security;

revoke all on public.recommendations from authenticated;
grant  select                      on public.recommendations to authenticated;
grant  update (status, version)    on public.recommendations to authenticated;
create policy recommendations_select on public.recommendations for select
  using ((select auth.uid()) = user_id);
create policy recommendations_update on public.recommendations for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.events from authenticated;
grant  select, insert on public.events to authenticated;
create policy events_select on public.events for select
  using ((select auth.uid()) = user_id);
create policy events_insert on public.events for insert
  with check ((select auth.uid()) = user_id);
```

Права дібрано так, щоб клієнт не міг зробити того, чого йому не належить, навіть будучи
скомпрометованим. На `recommendations` він має право оновити лише `status` і `version`; окремий
тригер (до фрагмента не включений) додатково звужує допустимі значення статусу до набору перегляду
плану (`accepted`, `pinned`, `moved`, `rejected`), тож станів `completed` і `lapsed` клієнт на
сервері не встановлює – їх встановлює розв'язання конфліктів синхронізації та нічна атрибуція
відповідно. На `events` клієнт має `select` і `insert` і не має ані `update`, ані `delete`: журнал є
append-only не за домовленістю, а за правами доступу. Умова `with check` політики оновлення не дає
переписати `user_id` рядка на чужий, а `auth.uid()` узято в підзапит, щоб планувальник обчислював
його один раз на запит.
