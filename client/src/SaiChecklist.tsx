import { FormEvent, useEffect, useState } from "react";
import { checked, json, type RequestApi } from "./Ledger";

const groups = [
  { name: "Atti e dichiarazioni", items: [
    ["rup-dec", "Atto di conferimento RUP e DEC, ove nominato"],
    ["contratto", "Contratto o convenzione con l’ente attuatore"],
    ["all-2", "Dichiarazione di atto notorio finale · All. 2"],
    ["durc", "DURC dell’ente attuatore in corso di validità"],
    ["all-9", "Criterio d’imputazione delle spese in quota parte · All. 9"],
    ["all-10", "Dichiarazione annullo fatture elettroniche e buste paga · All. 10"],
    ["all-11", "Autodichiarazione spese non quietanzate, se pertinente · All. 11"],
    ["all-12", "Riepilogo pagamenti dell’ente locale all’ente attuatore · All. 12"],
    ["polizza", "Polizza fideiussoria definitiva, se pertinente"],
    ["all-16", "Dichiarazione a spesa zero, se pertinente · All. 16"],
  ] },
  { name: "Personale, accoglienza e registri", items: [
    ["all-3", "Organigramma delle risorse · All. 3"],
    ["all-4", "Calcolo del costo orario · All. 4"],
    ["all-5", "Dettaglio mensile del personale · All. 5"],
    ["costo-ente", "Costo orario del dipendente dell’ente locale in quota parte"],
    ["all-6", "Elenco strutture di accoglienza · All. 6"],
    ["all-7", "Registro delle erogazioni · All. 7"],
    ["all-8", "Registro delle presenze · All. 8"],
    ["fondo", "Registro fondo cassa, se pertinente"],
    ["inventario", "Registro di inventario"],
    ["donazione", "Dichiarazione di donazione, se pertinente"],
    ["all-14", "Dichiarazione di ospitalità, se pertinente · All. 14"],
    ["all-15", "Scheda formazione, se pertinente · All. 15"],
    ["all-17", "Registro presenze sul territorio, se pertinente · All. 17"],
  ] },
  { name: "Revisore e documenti di spesa", items: [
    ["nomina-revisore", "Atto di conferimento del revisore indipendente"],
    ["all-13", "Certificato, verbale e allegati del revisore · All. 13, 13.1, 13.2, 13.3"],
    ["estratti", "Estratti conto e quietanze F24"],
    ["giustificativi", "Giustificativi e documentazione richiesta per voce di spesa"],
  ] },
];

type Item = { code: string; status: "DA_VERIFICARE" | "VERIFICATO" | "NON_APPLICABILE"; notes: string };

export default function SaiChecklist({ base, request }: { base: string; request: RequestApi }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [loaded, setLoaded] = useState<{ year: number; items: Item[] }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const url = `${base}/${year}`;
  useEffect(() => {
    let active = true;
    request(url).then(checked).then((response) => response.json())
      .then((items) => { if (active) setLoaded({ year, items }); })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [url, year, request]);

  async function save(event: FormEvent<HTMLFormElement>, code: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item: Item = { code, status: form.get("status") as Item["status"], notes: String(form.get("notes")).trim() };
    setBusy(true); setError(""); setSaved("");
    try {
      await checked(await request(url, json("PUT", item)));
      setLoaded((current) => current?.year === year
        ? { year, items: [...current.items.filter((previous) => previous.code !== code), item] }
        : current);
      setSaved("Verifica salvata.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  const items = loaded?.year === year ? loaded.items : undefined;
  return <section className="card plan planning">
    <h2>Checklist di rendicontazione finale</h2>
    <p>Manuale unico SAI, aprile 2025, § 2.4. Registra la verifica effettuata e indica nelle note dove si trova il documento.</p>
    <label>Annualità<select disabled={busy} value={year} onChange={(event) => {
      setError(""); setSaved(""); setYear(Number(event.target.value));
    }}>
      {Array.from({ length: 15 }, (_, i) => new Date().getFullYear() + 1 - i).map((value) =>
        <option key={value}>{value}</option>)}
    </select></label>
    <p>Scadenza ordinaria del rendiconto · 31 maggio {year + 1}, salvo specifiche circolari.</p>
    {error && <p role="alert" className="alert">{error}</p>}
    {saved && <p role="status">{saved}</p>}
    {items && groups.map((group) => <details className="module-form" key={group.name}>
      <summary>{group.name} · {group.items.filter(([code]) => items.some((item) => item.code === code && item.status !== "DA_VERIFICARE")).length}/{group.items.length}</summary>
      {group.items.map(([code, name]) => {
        const item = items.find((value) => value.code === code);
        return <form className="filter-bar" key={`${year}:${code}`} onSubmit={(event) => void save(event, code)}>
          <label>{name}<select name="status" defaultValue={item?.status ?? "DA_VERIFICARE"}>
            <option value="DA_VERIFICARE">Da verificare</option>
            <option value="VERIFICATO">Verificato</option>
            <option value="NON_APPLICABILE">Non applicabile</option>
          </select></label>
          <label>Note o riferimento<input name="notes" maxLength={500} defaultValue={item?.notes ?? ""} /></label>
          <button className="secondary" disabled={busy}>Salva verifica</button>
        </form>;
      })}
    </details>)}
  </section>;
}
