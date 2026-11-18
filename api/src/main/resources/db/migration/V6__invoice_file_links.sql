create table ledger_file_links (
  file_hash varchar(64) not null references ledger_files(hash),
  document_id uuid not null references ledger_documents(id),
  primary key (file_hash, document_id)
);
create index ledger_file_links_document_idx on ledger_file_links(document_id);

create view ledger_document_files as
select hash, document_id, filename from ledger_files
union all
select f.hash, l.document_id, f.filename
from ledger_file_links l join ledger_files f on f.hash = l.file_hash;
