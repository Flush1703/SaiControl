create table ledger_supplier_rules (
  supplier_key varchar(250) primary key,
  supplier varchar(250) not null,
  account_id uuid not null references financial_accounts(id)
);

create table ledger_bank_movements (
  id uuid primary key,
  reference varchar(250) not null unique,
  booked_on date not null,
  description varchar(500) not null,
  amount numeric(15,2) not null check (amount > 0),
  document_id uuid references ledger_documents(id)
);
