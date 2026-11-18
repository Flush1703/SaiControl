import { FormEvent, useRef, useState } from "react";

const steps = ["Dati del progetto", "Periodo", "Riepilogo"];
const empty = { name: "", referenceCode: "", funder: "", startsOn: "", endsOn: "" };
export type ProjectDraft = typeof empty;

export default function NewProject({ cancel, save }: {
  cancel: () => void;
  save: (draft: ProjectDraft) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);

  function field(key: keyof ProjectDraft) {
    return {
      name: key,
      value: draft[key],
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setDraft((current) => ({ ...current, [key]: value }));
        setError("");
      },
    };
  }

  async function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!draft.name.trim()) { setError("Inserisci il nome del progetto."); return; }
    if (draft.startsOn && draft.endsOn && draft.endsOn < draft.startsOn) {
      setError("La data di fine deve essere uguale o successiva a quella di inizio.");
      return;
    }
    setError("");
    if (step < 2) { setStep(step + 1); return; }
    pending.current = true;
    setSaving(true);
    try {
      await save({ ...draft, name: draft.name.trim(), referenceCode: draft.referenceCode.trim(), funder: draft.funder.trim() });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  const date = (value: string) => value ? value.split("-").reverse().join("/") : "Da definire";

  return <section className="card project-wizard" aria-labelledby="new-project-title">
    <h1 id="new-project-title">Nuovo progetto SAI</h1>
    <ol className="project-steps" aria-label="Passaggi">
      {steps.map((title, index) => <li key={title} aria-current={step === index ? "step" : undefined}>{title}</li>)}
    </ol>
    <form onSubmit={next}>
      <fieldset className="module-fieldset wizard-fields" disabled={saving}>
        <legend>{steps[step]}</legend>
        {step === 0 && <>
          <label>Nome del progetto<input {...field("name")} required maxLength={200} placeholder="Es. SAI Milano 2026" /></label>
          <label>Codice di riferimento (facoltativo)<input {...field("referenceCode")} maxLength={100} /></label>
          <label>Ente finanziatore (facoltativo)<input {...field("funder")} maxLength={200} /></label>
        </>}
        {step === 1 && <div className="dates">
          <label>Data di inizio (facoltativa)<input {...field("startsOn")} type="date" /></label>
          <label>Data di fine (facoltativa)<input {...field("endsOn")} type="date" min={draft.startsOn || undefined} /></label>
        </div>}
        {step === 2 && <>
          <dl>
            <dt>Nome</dt><dd>{draft.name.trim()}</dd>
            <dt>Codice di riferimento</dt><dd>{draft.referenceCode.trim() || "Da definire"}</dd>
            <dt>Ente finanziatore</dt><dd>{draft.funder.trim() || "Da definire"}</dd>
            <dt>Inizio</dt><dd>{date(draft.startsOn)}</dd>
            <dt>Fine</dt><dd>{date(draft.endsOn)}</dd>
          </dl>
          <p>Il progetto verrà creato in bozza. Potrai importare il piano finanziario dalla sua scheda.</p>
        </>}
      </fieldset>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="wizard-actions">
        <button type="button" className="secondary" disabled={saving} onClick={cancel}>Annulla</button>
        {step > 0 && <button type="button" className="secondary" disabled={saving} onClick={() => {
          setError(""); setStep(step - 1);
        }}>Indietro</button>}
        <button type="submit" disabled={saving}>{saving ? "Salvataggio…" : step === 2 ? "Crea progetto" : "Continua"}</button>
      </div>
    </form>
  </section>;
}
