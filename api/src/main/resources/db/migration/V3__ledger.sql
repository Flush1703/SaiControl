create table ledger_documents (
  id uuid primary key,
  supplier varchar(250),
  invoice_number varchar(100),
  invoice_date date,
  total numeric(15,2) check (total >= 0),
  identity_hash varchar(64) unique,
  paid numeric(15,2) not null default 0 check (paid >= 0 and (total is null or paid <= total)),
  payment_date date,
  reporting varchar(30) not null default 'DA_RENDICONTARE',
  reviewed boolean not null default false
);

create table ledger_files (
  hash varchar(64) primary key,
  document_id uuid not null references ledger_documents(id),
  filename varchar(255) not null,
  contents text not null
);

create table ledger_shares (
  id uuid primary key,
  document_id uuid not null references ledger_documents(id),
  account_id uuid not null references financial_accounts(id),
  percentage numeric(7,4) not null check (percentage > 0 and percentage <= 100),
  amount numeric(15,2) not null check (amount >= 0),
  reporting varchar(30) not null default 'DA_RENDICONTARE'
);

create index ledger_shares_document_idx on ledger_shares(document_id);
create index ledger_shares_account_idx on ledger_shares(account_id);
