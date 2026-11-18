const categories = [
  ["A", "Costo del personale"],
  ["B", "Spese di gestione diretta"],
  ["C", "Immobili e utenze delle strutture di accoglienza"],
  ["D", "Presa in carico dei beneficiari"],
  ["E", "Viaggi, formazione e sensibilizzazione"],
  ["F", "Costi indiretti"],
  ["G", "Retta e affidamento familiare"],
] as const;

export function groupSaiAccounts<T extends { accountCode: string }>(accounts: T[]) {
  const groups = [...categories.map(([code, name]) => ({ code: String(code), name: String(name), accounts: [] as T[] })),
    { code: "", name: "Altri codici del piano", accounts: [] as T[] }];
  for (const account of accounts) {
    const code = account.accountCode.trim().match(/^([A-G])(?:$|[. -]?\d)/i)?.[1].toUpperCase();
    (groups.find((group) => group.code === code) ?? groups[groups.length - 1]).accounts.push(account);
  }
  return groups.filter((group) => group.accounts.length > 0);
}
