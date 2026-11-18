create table projects (
  id uuid primary key,
  name varchar(200) not null,
  reference_code varchar(100),
  funder varchar(200),
  starts_on date,
  ends_on date,
  status varchar(30) not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table financial_accounts (
  id uuid primary key,
  project_id uuid not null references projects(id),
  account_code varchar(100) not null,
  description varchar(300) not null,
  allocated_budget numeric(15,2) not null check (allocated_budget >= 0),
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  constraint financial_accounts_project_code_unique unique (project_id, account_code)
);

create index financial_accounts_project_idx on financial_accounts(project_id);
