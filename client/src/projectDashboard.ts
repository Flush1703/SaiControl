const statusLabels: Record<string, string> = {
  DRAFT: "Bozza",
  ACTIVE: "Attivo",
  CLOSED: "Chiuso",
};

export function projectStatus(status: string) {
  return statusLabels[status] ?? status;
}

export function projectMetadata(project: { referenceCode?: string | null; funder?: string | null }) {
  return [project.referenceCode, project.funder].map((value) => value?.trim()).filter(Boolean).join(" · ");
}

export function planOverview(accounts: { allocatedBudget: number }[], loading: boolean) {
  return {
    count: accounts.length,
    total: loading && !accounts.length ? null
      : accounts.reduce((sum, account) => sum + Math.round(Number(account.allocatedBudget) * 100), 0) / 100,
    emptyMessage: loading ? "Caricamento del piano…" : "Nessun conto nel piano.",
  };
}
