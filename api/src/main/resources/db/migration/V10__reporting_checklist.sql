create table reporting_checklist (
  project_id uuid not null references projects(id),
  reporting_year integer not null,
  item_code varchar(40) not null,
  item_status varchar(20) not null,
  notes varchar(500) not null,
  primary key (project_id, reporting_year, item_code)
);
