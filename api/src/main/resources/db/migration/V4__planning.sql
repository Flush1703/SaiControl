create table budget_revisions (
  id uuid primary key,
  project_id uuid not null references projects(id),
  source_id uuid not null references financial_accounts(id),
  target_id uuid not null references financial_accounts(id),
  amount numeric(15,2) not null check (amount > 0),
  reason varchar(500) not null,
  approval_reference varchar(250),
  approved_at timestamp with time zone,
  check (source_id <> target_id)
);

create table staff_estimates (
  id uuid primary key,
  project_id uuid not null references projects(id),
  account_id uuid not null references financial_accounts(id),
  role_name varchar(200) not null,
  month_start date not null,
  hours numeric(8,2) not null check (hours > 0),
  hourly_cost numeric(10,2) not null check (hourly_cost >= 0)
);
