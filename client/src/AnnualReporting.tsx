import { FormEvent, useState } from "react";
import { checked, download, type RequestApi } from "./Ledger";

type Preview = {
  summary: { shares: number; allocated: number; not_settled: number; pending: number };
  previousYearCandidates: { id: string; invoice_number: string | null; invoice_date: string; payment_date: string }[];
  ordinaryDeadline: string;
};
const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const date = (value: string) => value.split("-").reverse().join("/");

export default function AnnualReporting({ base, request }: { base: string; request: RequestApi }) {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [data, setData] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function action(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await task(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action(async () => {
      setData(await (await checked(await request(`${base}/${year}`))).json());
    });
  }

  return <section className="card plan planning">
    <h2>Rendicontazione per annualità</h2>
    <form className="filter-bar" onSubmit={preview}>
      <label>Annualità<input type="number" min="2000" max="2100" required disabled={busy}
        value={year} onChange={(event) => { setYear(event.target.value); setData(undefined); }} /></label>
      <button disabled={busy}>Carica prospetto</button>
    </form>
    {error && <p className="alert" role="alert">{error}</p>}
    {data && <>
      <p>Scadenza ordinaria del rendiconto · {date(data.ordinaryDeadline)}, salvo circolari specifiche.</p>
      <dl className="allocation-summary">
        <div><dt>Spese imputate</dt><dd>{eur.format(data.summary.allocated)}</dd></div>
        <div><dt>Quote da verificare</dt><dd>{data.summary.pending} di {data.summary.shares}</dd></div>
        <div><dt>Fatture con saldo aperto</dt><dd>{data.summary.not_settled}</dd></div>
      </dl>
      <h3>Preparazione SAL</h3>
      <p>Il CSV riepiloga le quote per data fattura nel primo semestre. Controlla separatamente la competenza e la liquidazione delle spese di esercizi precedenti.</p>
      {data.previousYearCandidates.length > 0 && <ul>{data.previousYearCandidates.map((item) =>
        <li key={item.id}>Fattura {item.invoice_number || item.id} del {date(item.invoice_date)} · Ultimo pagamento {date(item.payment_date)}</li>)}</ul>}
      <h3>Prospetti di lavoro</h3>
      <div className="wizard-actions">
        {[["sal", "CSV preparazione SAL"], ["register", "CSV registro spese"], ["unsettled", "CSV fatture non saldate"]].map(([type, title]) =>
          <button key={type} className="secondary" disabled={busy} onClick={() => void action(async () => {
            await download(await request(`${base}/${year}/csv?type=${type}`), `saicontrol-${type}-${year}.csv`);
          })}>{title}</button>)}
      </div>
    </>}
  </section>;
}
