-- Create normalized school data tables.
-- A class has one teacher and many students.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  name text not null,
  email text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint teachers_email_lowercase_chk check (email = lower(email))
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  teacher_id uuid references public.teachers(id) on update cascade on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  name text not null,
  email text not null unique,
  class_id uuid references public.classes(id) on update cascade on delete set null,
  academic_year text not null default '2025-2026',
  monthly_test_1 numeric(5,2) not null default 0,
  monthly_test_2 numeric(5,2) not null default 0,
  monthly_test_3 numeric(5,2) not null default 0,
  monthly_test_4 numeric(5,2) not null default 0,
  mid_term numeric(5,2) not null default 0,
  final_term numeric(5,2) not null default 0,
  attendance_present integer not null default 0,
  attendance_total integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint students_email_lowercase_chk check (email = lower(email)),
  constraint students_monthly_test_1_range_chk check (monthly_test_1 >= 0 and monthly_test_1 <= 100),
  constraint students_monthly_test_2_range_chk check (monthly_test_2 >= 0 and monthly_test_2 <= 100),
  constraint students_monthly_test_3_range_chk check (monthly_test_3 >= 0 and monthly_test_3 <= 100),
  constraint students_monthly_test_4_range_chk check (monthly_test_4 >= 0 and monthly_test_4 <= 100),
  constraint students_mid_term_range_chk check (mid_term >= 0 and mid_term <= 100),
  constraint students_final_term_range_chk check (final_term >= 0 and final_term <= 100),
  constraint students_attendance_nonnegative_chk check (attendance_present >= 0 and attendance_total >= 0),
  constraint students_attendance_present_lte_total_chk check (attendance_present <= attendance_total)
);

create index if not exists idx_classes_teacher_id on public.classes (teacher_id);
create index if not exists idx_students_class_id on public.students (class_id);
create index if not exists idx_students_auth_user_id on public.students (auth_user_id);
create index if not exists idx_teachers_auth_user_id on public.teachers (auth_user_id);

create trigger teachers_set_updated_at
before update on public.teachers
for each row
execute procedure public.set_updated_at();

create trigger classes_set_updated_at
before update on public.classes
for each row
execute procedure public.set_updated_at();

create trigger students_set_updated_at
before update on public.students
for each row
execute procedure public.set_updated_at();
