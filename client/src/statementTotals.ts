export type StatementAccount = { account_code: string; description: string; reported: number };

const groups = [
  ["A", "Costo del personale", [
    ["Ae", "Équipe multidisciplinare", [
      ["A1e", "Operatori sociali"], ["A2e", "Interpreti e mediatori culturali"],
      ["A3e", "Operatori legali"], ["A4e", "Assistenti sociali"], ["A5e", "Psicologi"],
      ["A6e", "Operatori dell’integrazione"], ["A7e", "Personale addetto alle pulizie"], ["A8e", "Altre figure professionali"],
    ]],
    ["Ac", "Consulenze", [
      ["A1c", "Esperti legali"], ["A2c", "Operatori anti-tratta"], ["A3c", "Mediazione culturale e interpretariato"],
      ["A4c", "Consulenti fiscali e del lavoro"], ["A5c", "Altre figure professionali"],
    ]],
  ]],
  ["B", "Spese di gestione diretta", [
    ["B1", "Utenze telefoniche del personale"], ["B2", "Carburante per automezzi di servizio"],
    ["B3", "Fideiussioni e costi bancari"], ["B4", "Revisore contabile indipendente"],
    ["B5", "IVA sui servizi resi dall’ente attuatore"], ["B6", "Procedure di affidamento"],
    ["B7", "Mobili, arredi ed elettrodomestici"], ["B8", "Hardware, software, strumentazione e autovetture"],
  ]],
  ["C", "Immobili e utenze", [
    ["C1", "Ristrutturazione straordinaria"], ["C2", "Manutenzione ordinaria"],
    ["C3", "Affitti, condominio e registrazione contratti"], ["C4", "Ospitalità in strutture dedicate"],
    ["C5", "Pulizia locali e materiali"], ["C6", "Utenze delle strutture di accoglienza"],
  ]],
  ["D", "Presa in carico dei beneficiari", [
    ["D1", "Vitto, abbigliamento, igiene e assistenza all’infanzia"], ["D2", "Effetti letterecci"],
    ["D3", "Assistenza sanitaria specialistica"], ["D4", "Altre spese per la salute"],
    ["D5", "Trasporto, trasferimento e soggiorno temporaneo"], ["D6", "Pocket money"],
    ["D7", "Scolarizzazione"], ["D8", "Alfabetizzazione"], ["D9", "Formazione professionale"],
    ["D10", "Borse lavoro e tirocini"], ["D11", "Integrazione"], ["D12", "Assistenza ai beneficiari"],
    ["D13", "Contributi alloggio"], ["D14", "Contributi acquisto arredi"], ["D15", "Contributi straordinari per l’uscita"],
  ]],
  ["E", "Viaggi, formazione e sensibilizzazione", [
    ["E1", "Eventi di sensibilizzazione"], ["E2", "Incontri, formazione e viaggi del personale"],
  ]],
] as const;

type Node = readonly [code: string, description: string, children?: readonly Node[]];
export type StatementRow = { code: string; description: string; cents: number; level: number; subtotal: boolean };

export function finalStatement(accounts: StatementAccount[]) {
  const remaining = new Map<string, StatementAccount[]>();
  for (const account of accounts) {
    const key = account.account_code.trim().toUpperCase();
    const entries = remaining.get(key) ?? [];
    entries.push(account);
    remaining.set(key, entries);
  }

  function row([code, description, children]: Node, level: number): StatementRow[] {
    const key = code.toUpperCase();
    const entries = remaining.get(key) ?? [];
    remaining.delete(key);
    const own = entries.reduce((sum, entry) => sum + Math.round(entry.reported * 100), 0);
    const nested = children?.map((child) => row(child, level + 1)) ?? [];
    if (!children) return [{ code, description: entries[0]?.description ?? description, cents: own, level, subtotal: false }];
    const cents = own + nested.reduce((sum, branch) => sum + branch[0].cents, 0);
    return [
      { code, description, cents, level, subtotal: true },
      ...(own ? [{ code, description: "Importi registrati sul conto riepilogativo", cents: own, level: level + 1, subtotal: false }] : []),
      ...nested.flat(),
    ];
  }

  const branches = groups.map((group) => row(group, 0));
  const [indirect] = row(["F", "Costi indiretti"], 0);
  const other = [...remaining.values()].flat().map((account) => ({
    code: account.account_code, description: account.description, cents: Math.round(account.reported * 100), level: 0, subtotal: false,
  }));
  const direct = branches.reduce((sum, branch) => sum + branch[0].cents, 0);
  const otherTotal = other.reduce((sum, item) => sum + item.cents, 0);
  return { rows: branches.flat(), indirect, other, direct, otherTotal, total: direct + indirect.cents + otherTotal };
}
