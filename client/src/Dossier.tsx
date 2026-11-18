import { FormEvent, useState } from "react";
import { checked, download, RequestApi } from "./Ledger";

type Summary = { documents: number; shares: number; unpaid: number; missing_files: number; pending_shares: number; over_budget: number };

export default function Dossier({ base, request }: { base: string; request: RequestApi }) {
  const [result, setResult] = useState<{ query: string; summary: Summary }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const query = new URLSearchParams({ from: String(values.get("from")), to: String(values.get("to")) }).toString();
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      const summary = await (await checked(await request(`${base}?${query}`))).json();
      setResult({ query, summary });
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function archive(query: string) {
    setBusy(true);
    setError("");
    try { await download(await request(`${base}/zip?${query}`), "saicontrol-fascicolo.zip"); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="card plan planning">
    <h2>Fascicolo di rendicontazione</h2>
    <p>Seleziona il periodo per data fattura. Il fascicolo raccoglie le quote del progetto, i movimenti riconciliati e i file originali.</p>
    <form className="filter-bar" onSubmit={preview} onChange={() => setResult(undefined)}>
      <label>Dal<input type="date" name="from" required /></label>
      <label>Al<input type="date" name="to" required /></label>
      <button disabled={busy}>Verifica fascicolo</button>
    </form>
    {error && <div className="alert" role="alert">{error}</div>}
    {result && <div className="module-form">
      <p role="status">{result.summary.documents} fatture · {result.summary.shares} quote</p>
      <ul>
        <li>{result.summary.unpaid} fatture con saldo da pagare</li>
        <li>{result.summary.missing_files} fatture senza allegato</li>
        <li>{result.summary.pending_shares} quote da completare</li>
        <li>{result.summary.over_budget} conti interessati fuori budget</li>
      </ul>
      <button disabled={busy || !result.summary.documents} onClick={() => void archive(result.query)}>Scarica fascicolo ZIP</button>
    </div>}
  </section>;
}
