-- Seating chart schema. Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Every row belongs to one teacher (teacher_id) and row-level security means a teacher can only ever
-- see or change their own rows, even though the browser talks to the database directly.

create table if not exists public.rooms (
  id         uuid primary key,
  teacher_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null default 'My classroom',
  data       jsonb not null            -- { w, h, seats[], fixtures[], zones[] }
);

create table if not exists public.classes (
  id              uuid primary key,
  teacher_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  room_id         uuid not null references public.rooms (id) on delete restrict,
  name            text not null,
  position        int  not null default 0,
  active_chart_id uuid
);

create table if not exists public.students (
  id           uuid primary key,
  class_id     uuid not null references public.classes (id) on delete cascade,
  teacher_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  banned_zones jsonb not null default '[]',
  position     int  not null default 0
);

create table if not exists public.charts (
  id          uuid primary key,
  class_id    uuid not null references public.classes (id) on delete cascade,
  teacher_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  assignments jsonb not null default '{}',   -- { seatId: studentId }
  locked      jsonb not null default '[]',   -- [studentId]
  position    int  not null default 0
);

create index if not exists rooms_teacher_idx    on public.rooms (teacher_id);
create index if not exists classes_teacher_idx  on public.classes (teacher_id);
create index if not exists students_class_idx   on public.students (class_id);
create index if not exists charts_class_idx     on public.charts (class_id);

alter table public.rooms    enable row level security;
alter table public.classes  enable row level security;
alter table public.students enable row level security;
alter table public.charts   enable row level security;

create policy "own rooms" on public.rooms
  for all to authenticated
  using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));

create policy "own classes" on public.classes
  for all to authenticated
  using (teacher_id = (select auth.uid()))
  with check (
    teacher_id = (select auth.uid())
    and exists (select 1 from public.rooms r where r.id = room_id and r.teacher_id = (select auth.uid()))
  );

create policy "own students" on public.students
  for all to authenticated
  using (teacher_id = (select auth.uid()))
  with check (
    teacher_id = (select auth.uid())
    and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select auth.uid()))
  );

create policy "own charts" on public.charts
  for all to authenticated
  using (teacher_id = (select auth.uid()))
  with check (
    teacher_id = (select auth.uid())
    and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select auth.uid()))
  );
