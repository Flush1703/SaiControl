import { FormEvent, useEffect, useState } from "react";

type Attachment = { id: string; filename: string };
type Receipt = {
  id: string;
  calculation: { beneficiary: string; start: string; end: string; dailyRate: number; absentDays?: number };
  days: number;
  amount: number;
  attachments: Attachment[];
};

const currency = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const date = (value: string) => value.split("-").reverse().join("/");

export default function PocketMoney({ url, project, request }: {
  url: string;
  project: string;
  request: (url: string, options?: RequestInit) => Promise<Response>;
}) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [printing, setPrinting] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    request(url).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (active) setReceipts(data);
    }).catch(() => { if (active) setError("Impossibile caricare le ricevute."); });
    return () => { active = false; };
  }, [url, request]);

  useEffect(() => {
    if (!printing) return;
    const reset = () => setPrinting(null);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [printing]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (String(values.end) < String(values.start)) {
      setError("La data finale deve essere uguale o successiva alla data iniziale.");
      return;
    }
    const days = (Date.parse(String(values.end)) - Date.parse(String(values.start))) / 86_400_000 + 1;
    if (Number(values.absentDays) > days) {
      setError("I giorni di assenza superano la durata del periodo.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, absentDays: Number(values.absentDays) }),
      });
      if (!response.ok) throw new Error();
      const receipt = await response.json();
      setReceipts((current) => [receipt, ...current]);
      form.reset();
    } catch {
      setError("Impossibile salvare il calcolo.");
    } finally {
      setSaving(false);
    }
  }

  async function upload(receipt: Receipt, file: File) {
    const form = new FormData();
    form.append("file", file);
    setError("");
    try {
      const response = await request(`${url}/${receipt.id}/attachments`, { method: "POST", body: form });
      if (!response.ok) throw new Error();
      const attachment = await response.json();
      setReceipts((current) => current.map((item) => item.id === receipt.id
        ? { ...item, attachments: [...item.attachments, attachment] }
        : item));
    } catch {
      setError("Impossibile allegare il file. Verifica le dimensioni e riprova.");
    }
  }

  async function download(receipt: Receipt, attachment: Attachment) {
    setError("");
    try {
      const response = await request(`${url}/${receipt.id}/attachments/${attachment.id}`);
      if (!response.ok) throw new Error();
      const blob = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blob;
      link.download = attachment.filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blob), 1000);
    } catch {
      setError("Impossibile scaricare l’allegato.");
    }
  }

  return <section className="card pocket">
    <h2>Pocket money</h2>
    <p>Calcola l’importo per il periodo, stampa la ricevuta e allega il documento timbrato e firmato.</p>
    {error && <p role="alert" className="alert">{error}</p>}
    <form className="pocket-form" onSubmit={save}>
      <label>Beneficiario<input name="beneficiary" required maxLength={200} /></label>
      <label>Dal<input type="date" name="start" required /></label>
      <label>Al<input type="date" name="end" required /></label>
      <label>Giorni di assenza non pagabili<input type="number" name="absentDays" min="0" step="1" defaultValue="0" required /></label>
      <label>Tariffa giornaliera (€)<input type="number" name="dailyRate" min="0" step=".01" required /></label>
      <button disabled={saving}>Calcola e salva</button>
    </form>
    {receipts.map((receipt) => <article className="pocket-record" key={receipt.id}>
      <strong>{receipt.calculation.beneficiary} · {currency.format(receipt.amount)}</strong>
      <p>{date(receipt.calculation.start)} – {date(receipt.calculation.end)} · {receipt.days} giorni</p>
      <button className="secondary" onClick={() => setPrinting({ ...receipt })}>Stampa ricevuta</button>
      <label className="pocket-attachment">Allega ricevuta timbrata e firmata
        <input type="file" onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void upload(receipt, file);
          event.currentTarget.value = "";
        }} />
      </label>
      {receipt.attachments.map((attachment) => <button key={attachment.id} className="secondary"
        onClick={() => void download(receipt, attachment)}>{attachment.filename}</button>)}
    </article>)}
    {printing && <article className="receipt-print">
      <h1>Ricevuta di erogazione pocket money</h1>
      <p>Progetto SAI: {project}</p>
      <p>Beneficiario: {printing.calculation.beneficiary}</p>
      <p>Periodo: dal {date(printing.calculation.start)} al {date(printing.calculation.end)}</p>
      <p>Giorni di assenza non pagabili: {printing.calculation.absentDays ?? 0}</p>
      <p>Giorni di presenza riconosciuti: {printing.days}</p>
      <p>Tariffa giornaliera: {currency.format(printing.calculation.dailyRate)}</p>
      <p><strong>Importo ricevuto: {currency.format(printing.amount)}</strong></p>
      <p>Data di erogazione ____________________</p>
      <p>Firma del beneficiario ________________________________________</p>
      <p>Timbro dell’ente ______________________________________________</p>
    </article>}
  </section>;
}
