alter table pocket_money add column absent_days integer not null default 0 check (absent_days >= 0);
