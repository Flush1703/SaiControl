export type ArchiveEntry = {
  id: string;
  supplier: string | null;
  manual_project_id?: string | null;
  manual_project_name?: string | null;
  project_reference?: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total: number | null;
  identity_hash: string | null;
  reviewed: boolean;
  payment_status: string;
  files: { filename: string }[];
  shares: { project_id: string; reporting: string; amount: number }[];
};

export type Filters = {
  search: string;
  from?: string;
  to?: string;
  format?: "" | "xml" | "p7m" | "pdf" | "none";
  project: string;
  payment: string;
  reporting: string;
  reviewOnly: boolean;
  order: "latest" | "oldest" | "amount" | "supplier" | "project";
};

const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });

export function archive<T extends ArchiveEntry>(documents: T[], filters: Filters, projects: { id: string; name: string }[] = []) {
  const search = filters.search.trim().toLocaleLowerCase("it");
  const projectName = projects.find((project) => project.id === filters.project)?.name.trim().toLocaleLowerCase("it");
  const scoped = Boolean(filters.project !== "unassigned" && (filters.reporting || filters.project));
  const rows = documents.flatMap((document) => {
    if (filters.project === "unassigned" && document.shares.length) return [];
    const date = document.invoice_date;
    if ((filters.from && (!date || date < filters.from)) || (filters.to && (!date || date > filters.to))) return [];
    if (filters.format === "none" && document.files.length) return [];
    if (filters.format && filters.format !== "none" &&
        !document.files.some((file) => file.filename.toLowerCase().endsWith(
          filters.format === "p7m" ? ".xml.p7m" : `.${filters.format}`))) return [];
    if (filters.payment && document.payment_status !== filters.payment) return [];
    if (filters.reviewOnly && (document.identity_hash || document.reviewed)) return [];
    if (search && ![document.supplier, document.invoice_number, document.project_reference, document.manual_project_name, ...document.files.map((file) => file.filename)]
      .some((value) => value?.toLocaleLowerCase("it").includes(search))) return [];
    const shares = document.shares.filter((share) =>
      (!filters.project || share.project_id === filters.project) &&
      (!filters.reporting || share.reporting === filters.reporting));
    const linked = !filters.reporting && (document.manual_project_id === filters.project ||
      (!document.manual_project_id && projectName && document.project_reference?.trim().toLocaleLowerCase("it") === projectName));
    if (scoped && !shares.length && !linked) return [];
    const cents = scoped
      ? shares.reduce((sum, share) => sum + Math.round(share.amount * 100), 0)
      : document.total === null ? null : Math.round(document.total * 100);
    return [{ document, cents }];
  });

  rows.sort((left, right) => {
    const a = left.document;
    const b = right.document;
    let rank = 0;
    if (filters.order === "amount") {
      rank = (right.cents ?? -1) - (left.cents ?? -1);
    } else if (filters.order === "supplier") {
      rank = Number(!a.supplier) - Number(!b.supplier) || collator.compare(a.supplier ?? "", b.supplier ?? "");
    } else if (filters.order === "project") {
      const aProject = a.manual_project_name ?? a.project_reference;
      const bProject = b.manual_project_name ?? b.project_reference;
      rank = Number(!aProject) - Number(!bProject) || collator.compare(aProject ?? "", bProject ?? "");
    } else {
      rank = Number(!a.invoice_date) - Number(!b.invoice_date) ||
        collator.compare(a.invoice_date ?? "", b.invoice_date ?? "") * (filters.order === "oldest" ? 1 : -1);
    }
    return rank || a.id.localeCompare(b.id);
  });
  return { rows, scoped, cents: rows.reduce((sum, row) => sum + (row.cents ?? 0), 0) };
}
