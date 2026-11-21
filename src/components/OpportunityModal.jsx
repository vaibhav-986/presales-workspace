import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, X } from 'lucide-react';
import { useAuth } from '../AuthContext.jsx';

const STAGES = ['Discovery', 'Demo', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const SOFTWARE_TYPES = ['Cloud PMS', 'On-premise PMS', 'POS', 'CRM', 'Other'];
const CATEGORIES = ['Hotel', 'Resort', 'Hostel', 'Serviced Apartment', 'Restaurant', 'Other'];

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaults(userName) {
  const today = localDateValue();
  return {
    visitDate: today,
    startTime: '10:00',
    endTime: '11:00',
    propertyName: '',
    propertyLocation: '',
    presalerName: userName || '',
    stage: 'Discovery',
    softwareType: 'Cloud PMS',
    propertyCategory: 'Hotel',
    wonAmount: 0,
    currentPms: '',
    attendees: '',
    requirementDescription: '',
    issuesFaced: '',
  };
}

function durationLabel(start, end) {
  if (!start || !end || end <= start) return '—';
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const minutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `${hours}h ` : ''}${remainder ? `${remainder}m` : ''}`.trim();
}

function FieldError({ children }) {
  return children ? <span className="field-error" role="alert">{children}</span> : null;
}

export default function OpportunityModal({ opportunity, onClose, onSaved }) {
  const { user, api } = useAuth();
  const dialogRef = useRef(null);
  const [form, setForm] = useState(() => opportunity ? { ...defaults(user?.name), ...opportunity } : defaults(user?.name));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const duration = useMemo(() => durationLabel(form.startTime, form.endTime), [form.startTime, form.endTime]);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  function change(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: name === 'wonAmount' ? Number(value) : value }));
    setErrors((current) => ({ ...current, [name]: '' }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError('');
    try {
      const response = await api(opportunity ? `/api/opportunities/${opportunity.id}` : '/api/opportunities', {
        method: opportunity ? 'PATCH' : 'POST',
        body: JSON.stringify(form),
      });
      onSaved(response.data);
    } catch (error) {
      setErrors(error.fields || {});
      setFormError(error.message || 'Unable to save the opportunity.');
      requestAnimationFrame(() => dialogRef.current?.querySelector('[aria-invalid="true"]')?.focus());
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog opportunity-dialog"
      aria-labelledby="opportunity-dialog-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}
    >
      <form className="dialog-card" onSubmit={submit} noValidate>
        <div className="dialog-header">
          <div>
            <p className="eyebrow">Opportunity record</p>
            <h2 id="opportunity-dialog-title">{opportunity ? 'Edit opportunity' : 'Add opportunity'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        </div>
        <div className="dialog-body">
          {formError && <div className="form-alert" role="alert">{formError}</div>}
          <section className="form-section" aria-labelledby="visit-details-heading">
            <div className="form-section-heading">
              <span>01</span>
              <div><h3 id="visit-details-heading">Visit details</h3><p>When and where the presales visit takes place.</p></div>
            </div>
            <div className="form-grid form-grid--four">
              <label className="field"><span>Date <b>*</b></span><input type="date" name="visitDate" value={form.visitDate} onChange={change} required aria-invalid={Boolean(errors.visitDate)} /><FieldError>{errors.visitDate}</FieldError></label>
              <label className="field"><span>Start time <b>*</b></span><input type="time" name="startTime" value={form.startTime} onChange={change} required aria-invalid={Boolean(errors.startTime)} /><FieldError>{errors.startTime}</FieldError></label>
              <label className="field"><span>End time <b>*</b></span><input type="time" name="endTime" value={form.endTime} onChange={change} required aria-invalid={Boolean(errors.endTime)} /><FieldError>{errors.endTime}</FieldError></label>
              <label className="field"><span>Duration</span><div className="input-with-icon input-readonly"><Clock3 size={16} />{duration}</div></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Property name <b>*</b></span><input name="propertyName" value={form.propertyName} onChange={change} placeholder="e.g. The Grand Palms" required aria-invalid={Boolean(errors.propertyName)} /><FieldError>{errors.propertyName}</FieldError></label>
              <label className="field"><span>Property location <b>*</b></span><input name="propertyLocation" value={form.propertyLocation} onChange={change} placeholder="City, Country" required aria-invalid={Boolean(errors.propertyLocation)} /><FieldError>{errors.propertyLocation}</FieldError></label>
            </div>
          </section>

          <section className="form-section" aria-labelledby="qualification-heading">
            <div className="form-section-heading">
              <span>02</span>
              <div><h3 id="qualification-heading">Qualification</h3><p>Track ownership, stage, and commercial context.</p></div>
            </div>
            <div className="form-grid">
              <label className="field"><span>Presaler name <b>*</b></span><input name="presalerName" value={form.presalerName} onChange={change} placeholder="Full name" required aria-invalid={Boolean(errors.presalerName)} /><FieldError>{errors.presalerName}</FieldError></label>
              <label className="field"><span>Stage <b>*</b></span><select name="stage" value={form.stage} onChange={change}>{STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select><FieldError>{errors.stage}</FieldError></label>
              <label className="field"><span>Software type <b>*</b></span><select name="softwareType" value={form.softwareType} onChange={change}>{SOFTWARE_TYPES.map((item) => <option key={item}>{item}</option>)}</select><FieldError>{errors.softwareType}</FieldError></label>
              <label className="field"><span>Property category <b>*</b></span><select name="propertyCategory" value={form.propertyCategory} onChange={change}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select><FieldError>{errors.propertyCategory}</FieldError></label>
              <label className="field"><span>Opportunity value (₹)</span><input type="number" min="0" step="1" name="wonAmount" value={form.wonAmount} onChange={change} aria-invalid={Boolean(errors.wonAmount)} /><FieldError>{errors.wonAmount}</FieldError></label>
              <label className="field"><span>Current PMS</span><input name="currentPms" value={form.currentPms} onChange={change} placeholder="e.g. Opera, Protel" aria-invalid={Boolean(errors.currentPms)} /><FieldError>{errors.currentPms}</FieldError></label>
            </div>
          </section>

          <section className="form-section" aria-labelledby="discovery-heading">
            <div className="form-section-heading">
              <span>03</span>
              <div><h3 id="discovery-heading">Discovery notes</h3><p>Capture the people, requirements, and blockers.</p></div>
            </div>
            <label className="field"><span>Attendees</span><input name="attendees" value={form.attendees} onChange={change} placeholder="Names, comma-separated" aria-invalid={Boolean(errors.attendees)} /><FieldError>{errors.attendees}</FieldError></label>
            <div className="form-grid form-grid--textareas">
              <label className="field"><span>Requirement description</span><textarea name="requirementDescription" value={form.requirementDescription} onChange={change} rows="5" placeholder="Describe the client's requirements, needs, and expectations…" aria-invalid={Boolean(errors.requirementDescription)} /><FieldError>{errors.requirementDescription}</FieldError></label>
              <label className="field"><span>Issues faced</span><textarea name="issuesFaced" value={form.issuesFaced} onChange={change} rows="5" placeholder="Describe any issues encountered during this visit…" aria-invalid={Boolean(errors.issuesFaced)} /><FieldError>{errors.issuesFaced}</FieldError></label>
            </div>
          </section>
        </div>
        <div className="dialog-footer">
          <p>Fields marked <b>*</b> are required.</p>
          <div><button type="button" className="button button--ghost" onClick={onClose}>Cancel</button><button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Saving…' : opportunity ? 'Save changes' : 'Save opportunity'}</button></div>
        </div>
      </form>
    </dialog>
  );
}
