import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileDown, FileSpreadsheet, Info, ShieldCheck, UploadCloud } from 'lucide-react';
import { useAuth } from '../AuthContext.jsx';

export default function ImportExportPage() {
  const { user, api } = useAuth();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const inputRef = useRef(null);
  const canImport = ['admin', 'manager'].includes(user?.role);

  function choose(candidate) {
    setMessage(null);
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith('.csv')) {
      setMessage({ type: 'error', text: 'Please choose a .csv file.' });
      return;
    }
    setFile(candidate);
  }

  async function importFile() {
    if (!file) return;
    setBusy('import');
    setMessage(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await api('/api/opportunities/import', { method: 'POST', body });
      setMessage({ type: 'success', text: `${response.data.imported} opportunities imported successfully.` });
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (error) {
      const rowHint = error.rows?.length ? ` First issue: row ${error.rows[0].row}.` : '';
      setMessage({ type: 'error', text: `${error.message}${rowHint}` });
    } finally {
      setBusy('');
    }
  }

  async function download(path, filename) {
    setBusy(filename);
    setMessage(null);
    try {
      const blob = await api(path, { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: `${filename} is ready.` });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="page">
      <header className="page-header"><div><p className="breadcrumbs">Workspace <span>/</span> Data</p><h1>Import & export.</h1><p>Move opportunity data in and out of the workspace safely.</p></div><span className="secure-badge"><ShieldCheck size={17} /> Protected data transfer</span></header>

      {message && <div className={message.type === 'success' ? 'success-banner' : 'error-banner'} role="status">{message.type === 'success' ? <CheckCircle2 size={18} /> : <Info size={18} />}<span>{message.text}</span></div>}

      <section className="transfer-grid">
        <article className="content-card transfer-card">
          <div className="transfer-icon"><UploadCloud size={24} /></div>
          <p className="eyebrow">Bring data in</p>
          <h2>Import opportunities</h2>
          <p>Upload a CSV using the workspace template. Every row is checked before anything is saved.</p>
          {canImport ? (
            <>
              <div
                className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); }}
              >
                <FileSpreadsheet size={32} />
                {file ? <><strong>{file.name}</strong><span>{Math.ceil(file.size / 1024)} KB · Ready to validate</span></> : <><strong>Drop a CSV file here</strong><span>or choose one from your computer · max 2 MB</span></>}
                <button className="button button--secondary" type="button" onClick={() => inputRef.current?.click()}>{file ? 'Replace file' : 'Choose CSV'}</button>
                <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(event) => choose(event.target.files[0])} hidden />
              </div>
              <button className="button button--primary button--wide" onClick={importFile} disabled={!file || busy === 'import'}>{busy === 'import' ? 'Validating and importing…' : <><UploadCloud size={17} /> Import opportunities</>}</button>
            </>
          ) : <div className="permission-note"><ShieldCheck size={20} /><p><strong>Manager access required</strong><br />You can export workspace data, but only managers and admins can import it.</p></div>}
        </article>

        <article className="content-card transfer-card transfer-card--accent">
          <div className="transfer-icon transfer-icon--blue"><FileDown size={24} /></div>
          <p className="eyebrow">Take data with you</p>
          <h2>Export your pipeline</h2>
          <p>Download a clean CSV of all opportunities for reporting, sharing, or safekeeping.</p>
          <div className="export-preview" aria-hidden="true"><div className="sheet-corner" /><div className="sheet-row"><span /><span /><span /></div><div className="sheet-row"><span /><span /><span /></div><div className="sheet-row"><span /><span /><span /></div><Download size={25} /></div>
          <button className="button button--primary button--wide" onClick={() => download('/api/opportunities/export.csv', `opportunities-${new Date().toISOString().slice(0, 10)}.csv`)} disabled={busy.startsWith('opportunities-')}>{busy.startsWith('opportunities-') ? 'Preparing export…' : <><Download size={17} /> Export all opportunities</>}</button>
        </article>
      </section>

      <section className="content-card template-card">
        <div><div className="template-icon"><FileSpreadsheet size={22} /></div><div><h2>Start with the CSV template</h2><p>Use the exact column names and accepted formats for a smooth import.</p></div></div>
        <button className="button button--secondary" onClick={() => download('/api/opportunities/template.csv', 'opportunity-import-template.csv')} disabled={busy === 'opportunity-import-template.csv'}><Download size={17} /> Download template</button>
      </section>

      <section className="data-guidance" aria-label="CSV import guidance">
        <div><span>1</span><p><strong>Download the template</strong><br />Keep the header row unchanged.</p></div>
        <div><span>2</span><p><strong>Add your records</strong><br />Use one opportunity per row.</p></div>
        <div><span>3</span><p><strong>Upload and validate</strong><br />Nothing is saved if a row has errors.</p></div>
      </section>
    </div>
  );
}
