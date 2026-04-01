import { useState, useEffect } from 'react';
import { Plus, ClipboardCheck, ArrowLeft, Search, Truck, LifeBuoy, Camera, ImageIcon } from 'lucide-react';
import { formatInVancouver } from '../lib/vancouverTime';

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
  /** Base64 data URLs captured at submit */
  photos?: string[];
};

const INSPECTION_VALUES = ['Pass', 'Fail', 'N/A'] as const;

const STORAGE_KEY = 'preTripLogs_v2';

type PhotoEntry = { id: string; dataUrl: string };

function normalizeLogs(raw: unknown): PreTripLog[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as PreTripLog;
    return {
      ...r,
      photos: Array.isArray(r.photos) ? r.photos : [],
    };
  });
}

export default function PreTrips() {
  const [logs, setLogs] = useState<PreTripLog[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formType, setFormType] = useState<PreTripType>('Truck');
  const [searchTerm, setSearchTerm] = useState('');
  const [photoEntries, setPhotoEntries] = useState<PhotoEntry[]>([]);
  const [photoError, setPhotoError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setLogs(normalizeLogs(JSON.parse(saved)));
  }, []);

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
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (!files.length) {
      setPhotoError('Please choose image files only.');
      e.target.value = '';
      return;
    }
    void Promise.all(
      files.map(
        (file) =>
          new Promise<PhotoEntry>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () =>
              resolve({
                id: Math.random().toString(36).slice(2, 11),
                dataUrl: String(r.result),
              });
            r.onerror = () => reject(new Error('read failed'));
            r.readAsDataURL(file);
          })
      )
    )
      .then((entries) => {
        setPhotoEntries((prev) => [...prev, ...entries]);
        setPhotoError('');
      })
      .catch(() => setPhotoError('Could not read one or more images.'));
    e.target.value = '';
  };

  const removePhoto = (id: string) => {
    setPhotoEntries((prev) => prev.filter((p) => p.id !== id));
    setPhotoError('');
  };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (photoEntries.length === 0) {
      setPhotoError(
        formType === 'Truck'
          ? 'Add at least one photo of the truck before submitting.'
          : 'Add at least one photo of the trailer before submitting.'
      );
      return;
    }

    const formData = new FormData(e.currentTarget);

    let hasFail = false;
    for (const [, value] of formData.entries()) {
      if (typeof value === 'string' && value.includes('Fail')) {
        hasFail = true;
      }
    }

    const newLog: PreTripLog = {
      id: Math.random().toString(36).substr(2, 9),
      type: formType,
      date: new Date().toISOString(),
      employeeName: formData.get('employeeName') as string,
      equipmentId: formData.get('equipmentId') as string,
      location: formData.get('location') as string,
      status: hasFail ? 'Action Req' : 'Passed',
      remarks: (formData.get('remarks') as string) || 'No defects',
      photos: photoEntries.map((p) => p.dataUrl),
    };

    const updatedLogs = [newLog, ...logs];
    setLogs(updatedLogs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLogs));
    setPhotoEntries([]);
    setPhotoError('');
    setIsFormOpen(false);
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

          <form onSubmit={handleSave} className="pretrip-form">
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
            <div className="pretrip-photo-section">
              <p className="text-secondary text-sm" style={{ margin: 0 }}>
                Upload one or more clear photos of this {formType.toLowerCase()}. Submission is blocked until at least one
                photo is added.
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
              <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>
                <ClipboardCheck size={18} /> Submit inspection
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

  return (
    <div>
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
                  const n = log.photos?.length ?? 0;
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }} className="row-hover">
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
    </div>
  );
}
