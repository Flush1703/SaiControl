create table pocket_money (
  id uuid primary key,
  project_id uuid not null references projects(id),
  beneficiary varchar(200) not null,
  start_date date not null,
  end_date date not null,
  daily_rate numeric(12,2) not null check (daily_rate >= 0),
  check (end_date >= start_date)
);

create table pocket_money_attachments (
  id uuid primary key,
  receipt_id uuid not null references pocket_money(id),
  filename varchar(255) not null,
  contents text not null
);
