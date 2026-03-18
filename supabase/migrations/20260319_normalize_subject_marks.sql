-- Normalize marks storage to support variable subjects per class.

alter table public.students
  drop column if exists monthly_test_1,
  drop column if exists monthly_test_2,
  drop column if exists monthly_test_3,
  drop column if exists monthly_test_4,
  drop column if exists mid_term,
  drop column if exists final_term;

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on update cascade on delete cascade,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint subjects_unique_name_per_class unique (class_id, name)
);

create table if not exists public.student_marks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on update cascade on delete cascade,
  subject_id uuid not null references public.subjects(id) on update cascade on delete cascade,
  monthly_test_1 numeric(5,2) not null default 0,
  monthly_test_2 numeric(5,2) not null default 0,
  monthly_test_3 numeric(5,2) not null default 0,
  monthly_test_4 numeric(5,2) not null default 0,
  mid_term numeric(5,2) not null default 0,
  final_term numeric(5,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint student_marks_student_subject_unique unique (student_id, subject_id),
  constraint student_marks_monthly_test_1_range_chk check (monthly_test_1 >= 0 and monthly_test_1 <= 100),
  constraint student_marks_monthly_test_2_range_chk check (monthly_test_2 >= 0 and monthly_test_2 <= 100),
  constraint student_marks_monthly_test_3_range_chk check (monthly_test_3 >= 0 and monthly_test_3 <= 100),
  constraint student_marks_monthly_test_4_range_chk check (monthly_test_4 >= 0 and monthly_test_4 <= 100),
  constraint student_marks_mid_term_range_chk check (mid_term >= 0 and mid_term <= 100),
  constraint student_marks_final_term_range_chk check (final_term >= 0 and final_term <= 100)
);

create index if not exists idx_subjects_class_id on public.subjects (class_id);
create index if not exists idx_student_marks_student_id on public.student_marks (student_id);
create index if not exists idx_student_marks_subject_id on public.student_marks (subject_id);

drop trigger if exists subjects_set_updated_at on public.subjects;
create trigger subjects_set_updated_at
before update on public.subjects
for each row
execute procedure public.set_updated_at();

drop trigger if exists student_marks_set_updated_at on public.student_marks;
create trigger student_marks_set_updated_at
before update on public.student_marks
for each row
execute procedure public.set_updated_at();
