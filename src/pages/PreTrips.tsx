import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  ClipboardCheck,
  ArrowLeft,
  Search,
  Truck,
  LifeBuoy,
  Camera,
  ImageIcon,
  X,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatInVancouver } from '../lib/vancouverTime';
import { compressFileToJpeg } from '../lib/compressImage';
import { savePhoto, loadPhotos, deletePhotos } from '../lib/photoStore';
import ConfirmDialog from '../components/ConfirmDialog';

type PreTripType = 'Truck' | 'Trailer';

type PreTripLog = {
  id: string;
  type: PreTripType;
  date: string;
  employeeName: string;
  equipmentId: string;
  location: string;
  status: 'Passed' | 'Action Req';
  remarks: string;
  /** IndexedDB photo IDs for this inspection (preferred). */
  photoIds?: string[];
  /** Legacy: base64 data URLs stored directly inside the log. */
  photos?: string[];
};

const INSPECTION_VALUES = ['Pass', 'Fail', 'N/A'] as const;

const STORAGE_KEY = 'preTripLogs_v2';
const MAX_PHOTOS = 12;

type PhotoEntry = { id: string; dataUrl: string };

function normalizeLogs(raw: unknown): PreTripLog[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as PreTripLog;
    return {
      ...r,
      photoIds: Array.isArray(r.photoIds) ? r.photoIds : [],
      photos: Array.isArray(r.photos) ? r.photos : [],
    };
  });
}

function totalPhotoCount(log: PreTripLog): number {
  return (log.photoIds?.length ?? 0) + (log.photos?.length ?? 0);
}

export default function PreTrips() {
  const [logs, setLogs] = useState<PreTripLog[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formType, setFormType] = useState<PreTripType>('Truck');
  const [searchTerm, setSearchTerm] = useState('');
  const [photoEntries, setPhotoEntries] = useState<PhotoEntry[]>([]);
  const [photoError, setPhotoError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [detailLog, setDetailLog] = useState<PreTripLog | null>(null);
  const [detailPhotoUrls, setDetailPhotoUrls] = useState<string[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const photoSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setLogs(normalizeLogs(JSON.parse(saved)));
    } catch {
      setLogs([]);
    }
  }, []);

  useEffect(() => {
    if (!detailLog) {
      setDetailPhotoUrls([]);
      return;
    }
    let cancelled = false;
    const ids = detailLog.photoIds ?? [];
    const legacy = detailLog.photos ?? [];
    if (ids.length === 0 && legacy.length === 0) {
      setDetailPhotoUrls([]);
      return;
    }
    setDetailLoading(true);
    void (async () => {
      const map = ids.length > 0 ? await loadPhotos(ids) : {};
      if (cancelled) return;
      const fromIds = ids.map((id) => map[id]).filter((s): s is string => Boolean(s));
      setDetailPhotoUrls([...fromIds, ...legacy]);
      setDetailLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [detailLog]);

  const openNewInspection = () => {
    setFormType('Truck');
    setPhotoEntries([]);
    setPhotoError('');
    setIsFormOpen(true);
  };

  const changeFormType = (next: PreTripType) => {
    setFormType(next);
    setPhotoEntries([]);
    setPhotoError('');
  };

  const handlePhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList?.length) return;
    const all = Array.from(fileList);
    const files = all.filter((f) => !f.type || f.type.startsWith('image/'));
    if (!files.length) {
      setPhotoError('Please choose image files only.');
      e.target.value = '';
      return;
    }
    void (async () => {
      const built: PhotoEntry[] = [];
      let failed = 0;
      for (const file of files) {
        try {
          const dataUrl = await compressFileToJpeg(file);
          built.push({ id: Math.random().toString(36).slice(2, 11), dataUrl });
        } catch {
          failed += 1;
        }
      }
      if (built.length === 0) {
        setPhotoError(
          failed === 1
            ? "Could not read that photo. iPhone HEIC photos may need to be saved as JPEG first (Settings → Camera → Formats → Most Compatible)."
            : 'Could not read any of the chosen photos. Try saving them as JPEG and retrying.'
        );
        e.target.value = '';
        return;
      }
      setPhotoEntries((prev) => {
        const room = Math.max(0, MAX_PHOTOS - prev.length);
        const add = built.slice(0, room);
        if (built.length > room) {
          toast('Photo limit', {
            description: `Up to ${MAX_PHOTOS} photos per inspection. Extra files were skipped.`,
          });
        }
        return [...prev, ...add];
      });
      if (failed > 0) {
        toast('Some photos were skipped', {
          description: `${failed} photo${failed === 1 ? '' : 's'} could not be read and ${failed === 1 ? 'was' : 'were'} skipped.`,
        });
      }
      setPhotoError('');
      e.target.value = '';
      // iOS Safari likes to leave the page scrolled to wherever the native
      // file picker left it after dismissal — sometimes that buries the
      // photo section behind the bottom toolbar. Pull the user back to the
      // photos they just added on the next paint.
      requestAnimationFrame(() => {
        photoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    })();
  };

  const removePhoto = (id: string) => {
    setPhotoEntries((prev) => prev.filter((p) => p.id !== id));
    setPhotoError('');
  };

  const saveInspection = async (form: HTMLFormElement) => {
    if (photoEntries.length === 0) {
      setPhotoError(
        formType === 'Truck'
          ? 'Add at least one photo of the truck before submitting.'
          : 'Add at least one photo of the trailer before submitting.'
      );
      photoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const formData = new FormData(form);

    let hasFail = false;
    for (const [key, value] of formData.entries()) {
      if (key === 'remarks') continue;
      if (typeof value === 'string' && value === 'Fail') {
        hasFail = true;
        break;
      }
    }

    setSubmitting(true);
    let savedIds: string[] = [];
    try {
      // Persist photos to IndexedDB first so localStorage stays small.
      savedIds = [];
      for (const entry of photoEntries) {
        const id = await savePhoto(entry.dataUrl);
        savedIds.push(id);
      }
    } catch {
      setSubmitting(false);
      toast.error('Could not save photos', {
        description: 'Your device blocked photo storage. Try removing some photos and submit again.',
      });
      return;
    }

    const newLog: PreTripLog = {
      id: Math.random().toString(36).slice(2, 11),
      type: formType,
      date: new Date().toISOString(),
      employeeName: String(formData.get('employeeName') || ''),
      equipmentId: String(formData.get('equipmentId') || ''),
      location: String(formData.get('location') || ''),
      status: hasFail ? 'Action Req' : 'Passed',
      remarks: (formData.get('remarks') as string) || 'No defects',
      photoIds: savedIds,
      photos: [],
    };

    const updatedLogs = [newLog, ...logs];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLogs));
    } catch {
      // Roll back the photos we just wrote so we don't orphan them.
      void deletePhotos(savedIds);
      setSubmitting(false);
      toast.error('Could not save inspection', {
        description: 'Storage is full. Open older inspections and tap Delete to free space, then resubmit.',
      });
      return;
    }

    setLogs(updatedLogs);
    setPhotoEntries([]);
    setPhotoError('');
    setIsFormOpen(false);
    setSubmitting(false);
    toast.success('Inspection saved');
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      requestAnimationFrame(() => {
        const inv = form.querySelector(':invalid') as HTMLElement | null;
        inv?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      toast('Some inspection items still need answers', {
        description: 'Scroll up — every Pass / Fail / N/A row must be filled in before submitting.',
      });
      return;
    }
    void saveInspection(form);
  };

  const executeDelete = (id: string) => {
    const target = logs.find((l) => l.id === id);
    if (target?.photoIds?.length) void deletePhotos(target.photoIds);
    const next = logs.filter((l) => l.id !== id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Even if persist fails, drop from memory so the user can retry.
    }
    setLogs(next);
    setDetailLog(null);
    setDeleteId(null);
    toast.success('Inspection deleted');
  };

  /** Pass / Fail / N/A — native vertical radios; first option carries `required` for the group. */
  const renderInspectionRadios = (name: string, label: string) => (
    <div className="pretrip-check-row">
      <fieldset className="pretrip-fieldset">
        <legend className="pretrip-fieldset-legend">{label}</legend>
        <span className="sr-only">
          {label}. Choose Pass, Fail, or N/A. Required.
        </span>
        <ul className="pretrip-radio-list" role="presentation">
          {INSPECTION_VALUES.map((val, idx) => (
            <li key={val}>
              <label className="pretrip-radio-item">
                <input type="radio" name={name} value={val} required={idx === 0} />
                <span>{val}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );

  const renderFuelRadios = () => (
    <div className="pretrip-check-row">
      <fieldset className="pretrip-fieldset">
        <legend className="pretrip-fieldset-legend">Fuel type</legend>
        <span className="sr-only">Fuel type. Required.</span>
        <ul className="pretrip-radio-list" role="presentation">
          <li>
            <label className="pretrip-radio-item">
              <input type="radio" name="fuelType" value="Diesel" required />
              <span>Diesel</span>
            </label>
          </li>
          <li>
            <label className="pretrip-radio-item">
              <input type="radio" name="fuelType" value="Gas" />
              <span>Gas</span>
            </label>
          </li>
        </ul>
      </fieldset>
    </div>
  );

  if (isFormOpen) {
    return (
      <div>
        <button type="button" className="btn btn-secondary mb-6" onClick={() => setIsFormOpen(false)}>
          <ArrowLeft size={16} /> Back to Logs
        </button>

        <div className="card" style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div className="flex justify-between items-start mb-6 border-b-subtle pb-4 flex-wrap gap-4">
            <div>
              <p className="page-kicker" style={{ marginBottom: '0.35rem' }}>
                Vehicle inspection
              </p>
              <h2 className="mb-1">New {formType.toLowerCase()} inspection</h2>
              <p className="text-secondary text-sm">Island Hydroseeding Ltd — digital circle check</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="pretrip-form" noValidate>
            <div className="pretrip-check-row pretrip-check-row--flush">
              <fieldset className="pretrip-fieldset pretrip-type-radios">
                <legend className="pretrip-fieldset-legend">Unit type</legend>
                <p className="pretrip-type-hint text-secondary text-sm">
                  Truck or trailer — photos must match the unit you are inspecting.
                </p>
                <ul className="pretrip-radio-list" role="presentation">
                  <li>
                    <label className="pretrip-radio-item">
                      <input
                        type="radio"
                        name="pretripUnitVisual"
                        checked={formType === 'Truck'}
                        onChange={() => changeFormType('Truck')}
                      />
                      <span className="flex items-center gap-2">
                        <Truck size={18} aria-hidden /> Truck
                      </span>
                    </label>
                  </li>
                  <li>
                    <label className="pretrip-radio-item">
                      <input
                        type="radio"
                        name="pretripUnitVisual"
                        checked={formType === 'Trailer'}
                        onChange={() => changeFormType('Trailer')}
                      />
                      <span className="flex items-center gap-2">
                        <LifeBuoy size={18} aria-hidden /> Trailer
                      </span>
                    </label>
                  </li>
                </ul>
              </fieldset>
            </div>

            <h3 className="pretrip-section-title">General information</h3>
            <div className="pretrip-fields-stack">
              <div>
                <label>Date and time</label>
                <input type="text" value={formatInVancouver(new Date(), 'PPpp')} readOnly style={{ backgroundColor: 'var(--surface-hover)' }} />
              </div>
              <div>
                <label>Inspector / driver name</label>
                <input name="employeeName" type="text" required placeholder="Inspector / driver name" />
              </div>
              <div>
                <label>{formType === 'Truck' ? 'Truck ID / description' : 'Trailer ID / description'}</label>
                <input
                  name="equipmentId"
                  type="text"
                  required
                  placeholder={formType === 'Truck' ? 'Truck ID / unit' : 'Trailer ID / unit'}
                />
              </div>
              <div>
                <label>Location of inspection</label>
                <input name="location" type="text" required placeholder="Inspection location" />
              </div>

              {formType === 'Truck' && (
                <>
                  <div>
                    <label>Odometer reading</label>
                    <input name="odometer" type="number" required placeholder="Odometer" />
                  </div>
                  {renderFuelRadios()}
                </>
              )}

              {formType === 'Trailer' && (
                <div>
                  <label>Truck used to tow</label>
                  <input name="truckUsed" type="text" required placeholder="Tow vehicle" />
                </div>
              )}
            </div>

            <h3 className="pretrip-section-title">Vehicle photos (required)</h3>
            <div className="pretrip-photo-section" ref={photoSectionRef}>
              <p className="text-secondary text-sm" style={{ margin: 0 }}>
                Upload one or more clear photos of this {formType.toLowerCase()}. Up to {MAX_PHOTOS} photos. Submission is
                blocked until at least one photo is added.
              </p>
              <div className="pretrip-photo-drop">
                <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Camera size={16} aria-hidden />
                  Add photos
                  <input type="file" accept="image/*" multiple className="sr-only" onChange={handlePhotoPick} />
                </label>
              </div>
              {photoError ? <p className="pretrip-photo-error">{photoError}</p> : null}
              {photoEntries.length > 0 ? (
                <div className="pretrip-photo-grid">
                  {photoEntries.map((p) => (
                    <div key={p.id} className="pretrip-photo-thumb">
                      <img src={p.dataUrl} alt="" />
                      <button type="button" className="pretrip-photo-remove" aria-label="Remove photo" onClick={() => removePhoto(p.id)}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-secondary text-sm flex items-center gap-2" style={{ margin: 0 }}>
                  <ImageIcon size={16} aria-hidden /> No photos yet
                </p>
              )}
            </div>

            <h3 className="pretrip-section-title">Documentation & exterior</h3>
            <div className="pretrip-check-list">
              {renderInspectionRadios('regIns', 'Registration & insurance')}
              {renderInspectionRadios('cvi', 'CVI & decal')}
              {renderInspectionRadios('tires', 'Tires & rims')}
              {renderInspectionRadios('body', formType === 'Truck' ? 'Vehicle body (doors, bumpers)' : 'Trailer body (fenders, ramps)')}

              {formType === 'Truck' && (
                <>
                  {renderInspectionRadios('mirrors', 'Mirrors')}
                  {renderInspectionRadios('toolboxes', 'Toolboxes secured')}
                </>
              )}
              {formType === 'Trailer' && renderInspectionRadios('doors', 'Doors secured')}
              {renderInspectionRadios('load', 'Load secured (no debris)')}
            </div>

            {formType === 'Truck' && (
              <>
                <h3 className="pretrip-section-title">Under hood & cab</h3>
                <div className="pretrip-check-list">
                  {renderInspectionRadios('oil', 'Engine oil')}
                  {renderInspectionRadios('coolant', 'Coolant')}
                  {renderInspectionRadios('transFluid', 'Transmission fluid')}
                  {renderInspectionRadios('powerSteering', 'Power steering fluid')}
                  {renderInspectionRadios('seats', 'Seats & seat belts')}
                  {renderInspectionRadios('wipers', 'Windshield wipers')}
                  {renderInspectionRadios('defroster', 'Defroster')}
                  {renderInspectionRadios('horn', 'Horn')}
                  {renderInspectionRadios('cabClean', 'Free of dangerous items')}
                </div>
              </>
            )}

            {formType === 'Trailer' && (
              <>
                <h3 className="pretrip-section-title">Hitch & connection</h3>
                <div className="pretrip-check-list">
                  {renderInspectionRadios('hitchPinned', 'Truck hitch pinned')}
                  {renderInspectionRadios('ballSize', 'Hitch ball correct size')}
                  {renderInspectionRadios('coupler', 'Coupler latched & pinned')}
                  {renderInspectionRadios('chains', 'Chains crossed / connect')}
                  {renderInspectionRadios('electricalCon', 'Electrical connector secured')}
                </div>
              </>
            )}

            <h3 className="pretrip-section-title">Lights & brakes</h3>
            <div className="pretrip-check-list">
              {formType === 'Truck' && renderInspectionRadios('headlights', 'Headlights')}
              {renderInspectionRadios('markerLights', 'Running & marker lights')}
              {renderInspectionRadios('turnSignals', 'Turn signals / hazard')}
              {renderInspectionRadios('brakeLights', 'Brake lights')}

              {formType === 'Truck' && (
                <>
                  {renderInspectionRadios('parkingBrake', 'Parking brake')}
                  {renderInspectionRadios('brakes', 'Service brakes')}
                  {renderInspectionRadios('steering', 'Steering')}
                </>
              )}
            </div>

            {formType === 'Trailer' && (
              <>
                <h3 className="pretrip-section-title">Trailer tests</h3>
                <div className="pretrip-check-list">
                  {renderInspectionRadios('tugTest', 'Gain up tug test')}
                  {renderInspectionRadios('rollTest', 'Gain up roll test')}
                  {renderInspectionRadios('breakaway', 'Electrical breakaway test')}
                </div>
              </>
            )}

            {formType === 'Truck' && (
              <>
                <h3 className="pretrip-section-title">Emergency equipment</h3>
                <div className="pretrip-check-list">
                  {renderInspectionRadios('firstAid', 'First aid kit')}
                  {renderInspectionRadios('fireExtinguisher', 'Charged fire extinguisher')}
                  {renderInspectionRadios('wheelChocks', 'Wheel chocks')}
                  {renderInspectionRadios('triangles', 'Reflective triangles / cones')}
                  {renderInspectionRadios('spillKit', 'Spill kit')}
                  {renderInspectionRadios('tireChains', 'Winter tire chains')}
                </div>
              </>
            )}

            <h3 className="pretrip-section-title">Sign off</h3>
            <div className="pretrip-field-block">
              <label>Details of defects / remarks</label>
              <textarea name="remarks" rows={3} placeholder="Defects / remarks (optional)" />
            </div>

            <div className="pretrip-declaration">
              <p className="pretrip-declaration__text">
                I declare that the vehicle shown above has been inspected in accordance with the applicable requirements and any
                known issues have been noted above. Do not operate a vehicle and/or its contents if it is not safe to operate.
              </p>
            </div>

            <div className="pretrip-form-actions flex justify-between items-center border-t-subtle">
              <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(false)} disabled={submitting}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: '0.75rem 2rem' }}
                disabled={submitting}
              >
                <ClipboardCheck size={18} /> {submitting ? 'Saving…' : 'Submit inspection'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const filteredLogs = logs.filter(
    (log) =>
      log.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.equipmentId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const detailPending = deleteId ? logs.find((l) => l.id === deleteId) : null;

  return (
    <div>
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete this inspection?"
        message={
          detailPending
            ? `Permanently remove the ${detailPending.type.toLowerCase()} inspection for ${detailPending.equipmentId} on ${formatInVancouver(detailPending.date, 'MMM d, yyyy h:mm a')}? This cannot be undone.`
            : 'Permanently remove this inspection? This cannot be undone.'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => deleteId && executeDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />

      <p className="page-kicker">Fleet</p>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="mb-2">Vehicle pre-trips</h1>
          <p>Circle checks for trucks and trailers — Island Hydroseeding Ltd.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openNewInspection}>
          <Plus size={16} /> New inspection
        </button>
      </div>

      <div className="card">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
          <div style={{ position: 'relative', width: '300px', minWidth: '200px' }}>
            <Search
              size={18}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search by employee or equipment…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
          <span className="badge badge-gray">{logs.length} total records</span>
        </div>

        {filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
            <ClipboardCheck size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>No pre-trip inspection records found.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>Date</th>
                  <th style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>Type</th>
                  <th style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>Employee</th>
                  <th style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>Equipment</th>
                  <th style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>Location</th>
                  <th style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>Photos</th>
                  <th style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const n = totalPhotoCount(log);
                  return (
                    <tr
                      key={log.id}
                      style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                      className="row-hover"
                      onClick={() => setDetailLog(log)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDetailLog(log);
                        }
                      }}
                    >
                      <td style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>
                        {formatInVancouver(log.date, 'MMM d, yyyy h:mm a')}
                      </td>
                      <td style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>
                        <span className="flex items-center gap-1">
                          {log.type === 'Truck' ? <Truck size={14} /> : <LifeBuoy size={14} />} {log.type}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>{log.employeeName}</td>
                      <td style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>{log.equipmentId}</td>
                      <td style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>{log.location}</td>
                      <td style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>
                        {n > 0 ? (
                          <span className="flex items-center gap-1">
                            <ImageIcon size={14} aria-hidden /> {n}
                          </span>
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem 0.5rem' }}>
                        {log.status === 'Action Req' ? (
                          <span className="badge" style={{ backgroundColor: '#fee2e2', color: '#b91c1c' }}>
                            Action req
                          </span>
                        ) : (
                          <span className="badge badge-green">Passed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailLog && (
        <div className="modal-overlay" role="presentation" onClick={() => setDetailLog(null)}>
          <div
            className="modal-panel modal-panel--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pretrip-detail-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <button
              type="button"
              className="btn-icon"
              style={{ float: 'right', margin: '-0.5rem -0.5rem 0 0' }}
              onClick={() => setDetailLog(null)}
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <p className="page-kicker" style={{ marginBottom: '0.35rem' }}>
              {detailLog.type} inspection
            </p>
            <h2 id="pretrip-detail-title" className="modal-panel__title" style={{ marginBottom: '0.25rem' }}>
              {detailLog.equipmentId || 'Inspection'}
            </h2>
            <p className="text-secondary text-sm" style={{ marginBottom: '1.25rem' }}>
              {formatInVancouver(detailLog.date, 'PPpp')} · {detailLog.employeeName}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '0.75rem 1rem', marginBottom: '1rem' }}>
              <div>
                <p className="text-xs text-muted" style={{ margin: 0 }}>Status</p>
                {detailLog.status === 'Action Req' ? (
                  <span className="badge" style={{ backgroundColor: '#fee2e2', color: '#b91c1c' }}>Action req</span>
                ) : (
                  <span className="badge badge-green">Passed</span>
                )}
              </div>
              <div>
                <p className="text-xs text-muted" style={{ margin: 0 }}>Type</p>
                <p style={{ margin: 0 }}>{detailLog.type}</p>
              </div>
              <div>
                <p className="text-xs text-muted" style={{ margin: 0 }}>Inspector</p>
                <p style={{ margin: 0 }}>{detailLog.employeeName || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted" style={{ margin: 0 }}>Location</p>
                <p style={{ margin: 0 }}>{detailLog.location || '—'}</p>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <p className="text-xs text-muted" style={{ margin: 0 }}>Remarks</p>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{detailLog.remarks || '—'}</p>
            </div>

            <h3 className="pretrip-section-title" style={{ marginTop: 0 }}>
              Photos ({totalPhotoCount(detailLog)})
            </h3>
            {detailLoading ? (
              <p className="text-secondary text-sm">Loading photos…</p>
            ) : detailPhotoUrls.length === 0 ? (
              <p className="text-secondary text-sm">No photos attached.</p>
            ) : (
              <div className="pretrip-photo-grid">
                {detailPhotoUrls.map((url, i) => (
                  <div key={`${detailLog.id}-${i}`} className="pretrip-photo-thumb">
                    <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open photo ${i + 1}`}>
                      <img src={url} alt="" />
                    </a>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-panel__foot" style={{ justifyContent: 'space-between', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  // Close the detail modal first so the confirm dialog isn't
                  // fighting it for stacking order on iOS Safari.
                  const id = detailLog.id;
                  setDetailLog(null);
                  setDeleteId(id);
                }}
              >
                <Trash2 size={16} /> Delete inspection
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setDetailLog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
