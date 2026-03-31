import { useState, useEffect } from 'react';
import { Plus, ShieldAlert, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';

type FLHALog = {
  id: string;
  date: string;
  projectNumber: string;
  supervisorName: string;
  typeOfWork: string;
  weather: string;
  temperature: string;
  hospital: string;
  ersContact: string;
  meetingPoint: string;
  toolboxTopic: string;
  tasks: Array<{ description: string; hazard: string; riskLevel: string; controls: string }>;
};

export default function FLHA() {
  const [logs, setLogs] = useState<FLHALog[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [jobTasks, setJobTasks] = useState([{ description: '', hazard: '', riskLevel: 'Low', controls: '' }]);

  useEffect(() => {
    const saved = localStorage.getItem('flhaLogs_v2');
    if (saved) setLogs(JSON.parse(saved));
  }, []);

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    // Parse tasks list
    const parsedTasks = [];
    for (let i = 0; i < jobTasks.length; i++) {
        parsedTasks.push({
            description: formData.get(`task_desc_${i}`) as string,
            hazard: formData.get(`task_haz_${i}`) as string,
            riskLevel: formData.get(`task_risk_${i}`) as string,
            controls: formData.get(`task_ctrl_${i}`) as string,
        });
    }

    const newLog: FLHALog = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString(),
      projectNumber: formData.get('projectNumber') as string,
      supervisorName: formData.get('supervisorName') as string,
      typeOfWork: formData.get('typeOfWork') as string,
      weather: formData.get('weather') as string,
      temperature: formData.get('temperature') as string,
      hospital: formData.get('hospital') as string,
      ersContact: formData.get('ersContact') as string,
      meetingPoint: formData.get('meetingPoint') as string,
      toolboxTopic: formData.get('toolboxTopic') as string,
      tasks: parsedTasks,
    };
    
    const updatedLogs = [newLog, ...logs];
    setLogs(updatedLogs);
    localStorage.setItem('flhaLogs_v2', JSON.stringify(updatedLogs));
    setIsFormOpen(false);
    setJobTasks([{ description: '', hazard: '', riskLevel: 'Low', controls: '' }]); // reset
  };

  const renderYNN = (name: string, label: string) => (
    <div className="flex justify-between items-center py-2 border-b-subtle">
      <label className="text-sm">{label}</label>
      <select name={name} style={{ width: '120px', padding: '0.25rem' }}>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
        <option value="N/A">N/A</option>
      </select>
    </div>
  );

  if (isFormOpen) {
    return (
      <div>
        <button className="btn btn-secondary mb-6" onClick={() => setIsFormOpen(false)}>
          <ArrowLeft size={16} /> Back to FLHA Records
        </button>
        
        <div className="card" style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h2 className="mb-2">Field Level Hazard Assessment</h2>
          <p className="text-secondary mb-6 text-sm">Island Utility Construction - Complete FLHA prior to start of each task.</p>
          
          <form onSubmit={handleSave} className="flex flex-col gap-6">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', color: 'var(--primary-green)' }}>General Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1fr)', gap: '1.5rem' }}>
              <div>
                <label>Date and Time</label>
                <input type="text" value={format(new Date(), "PPpp")} readOnly style={{ backgroundColor: 'var(--surface-hover)' }} />
              </div>
              <div>
                <label>JOB / FSA Number / Location</label>
                <input name="projectNumber" type="text" required placeholder="Job / FSA / location" />
              </div>
              <div>
                <label>Supervisor</label>
                <input name="supervisorName" type="text" required placeholder="Supervisor name" />
              </div>
              <div>
                <label>Number of Workers</label>
                <input name="workers" type="number" required placeholder="Count" />
              </div>
              <div>
                <label>Type of Work</label>
                <input name="typeOfWork" type="text" required placeholder="Type of work" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div className="flex flex-col gap-4">
                <div>
                  <label>Weather</label>
                  <input name="weather" type="text" placeholder="Conditions" />
                </div>
                <div>
                  <label>Temperature</label>
                  <input name="temperature" type="text" placeholder="Temperature" />
                </div>
                <div>
                  <label>Daily Toolbox Meeting Topic</label>
                  <input name="toolboxTopic" type="text" required placeholder="Toolbox topic" />
                </div>
              </div>

              <div className="flex flex-col gap-4" style={{ backgroundColor: '#fffbfa', border: '1px solid #ef4444', borderRadius: '0.5rem', padding: '1rem' }}>
                <h4 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Emergency Response Plan</h4>
                <div>
                  <label>Nearest Hospital</label>
                  <input name="hospital" type="text" required placeholder="Nearest hospital" />
                </div>
                <div>
                  <label>Emergency Contact & Phone</label>
                  <input name="ersContact" type="text" required placeholder="Name & phone" />
                </div>
                <div>
                  <label>Emergency Meeting Point</label>
                  <input name="meetingPoint" type="text" required placeholder="Muster point" />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div>
                    <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Emergency Preparedness</h3>
                    {renderYNN('erpReviewed', 'ERP onsite and reviewed by all crew')}
                    {renderYNN('incidentProtocol', 'Understands Incident Reporting Protocol')}
                    {renderYNN('workingAlone', 'Working Alone or Isolated Area')}
                    {renderYNN('firstAid', 'First Aid Kit / Fire Extinguisher Onsite')}
                    {renderYNN('spillKit', 'Spill Kit Onsite')}
                </div>
                <div>
                    <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Tools / Equipment / Training</h3>
                    {renderYNN('properTools', 'Proper Tools/Equipment for the Task')}
                    {renderYNN('preUseDone', 'Pre-Use Equipment Inspections Completed')}
                    {renderYNN('fallArrest', 'Visual Inspection on Fall Arrest')}
                    {renderYNN('tagsOut', 'Defective tools tagged out & removed')}
                    {renderYNN('trainingDone', 'Training completed on Safe Job Procedure')}
                </div>
            </div>
            
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', color: 'var(--primary-green)' }}>Task Specific Hazards (Breakdown)</h3>

            {jobTasks.map((_, i) => (
                <div key={i} style={{ backgroundColor: 'var(--surface-hover)', padding: '1rem', borderRadius: '0.5rem', position: 'relative' }}>
                    <div className="flex justify-between items-center mb-4">
                        <h4 style={{ fontSize: '1.1rem' }}>Task Step {i + 1}</h4>
                        {jobTasks.length > 1 && (
                            <button type="button" className="text-xs text-danger font-semibold" style={{ border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => setJobTasks(jobTasks.filter((_, idx) => idx !== i))}>Remove</button>
                        )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 120px', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                            <label>Task Description</label>
                            <input name={`task_desc_${i}`} type="text" required placeholder="Task description" />
                        </div>
                        <div>
                            <label>Risk Level</label>
                            <select name={`task_risk_${i}`}>
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                            </select>
                        </div>
                    </div>
                    <div className="mb-4">
                        <label>Identified Hazards</label>
                        <input name={`task_haz_${i}`} type="text" required placeholder="Identified hazards" />
                    </div>
                    <div>
                        <label>Control Measures Implemented</label>
                        <textarea name={`task_ctrl_${i}`} required rows={2} placeholder="Controls & mitigations"></textarea>
                    </div>
                </div>
            ))}

            <button type="button" className="btn btn-secondary w-full border-dashed" onClick={() => setJobTasks([...jobTasks, { description: '', hazard: '', riskLevel: 'Low', controls: '' }])}>
                <Plus size={16} /> Add Another Task Step
            </button>


            <div className="flex justify-between items-center" style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>
                <ShieldAlert size={18} /> Submit Assessment
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="mb-2">FLHA Forms</h1>
          <p>Field Level Hazard Assessments (Site Docs format).</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsFormOpen(true)}>
          <Plus size={16} /> New Assessment
        </button>
      </div>

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {logs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
            <ShieldAlert size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>No recent hazard assessments. Start a new assessment for your job site today.</p>
          </div>
        ) : (
          logs.map(log => (
            <div key={log.id} className="card">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="mb-1">{log.projectNumber}</h3>
                  <p className="text-sm font-semibold text-primary" style={{ color: 'var(--lawn-green)' }}>
                    {format(new Date(log.date), "MMM d, yyyy - h:mm a")}
                  </p>
                </div>
                <div className="badge badge-gray">{log.supervisorName}</div>
              </div>

              <div className="chip-row mb-6">
                <span className="chip-meta">Work: {log.typeOfWork}</span>
                <span className="chip-meta">Topic: {log.toolboxTopic}</span>
                <span className="chip-meta">ERP: {log.meetingPoint}</span>
              </div>
              
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted uppercase font-semibold mb-1" style={{ fontSize: '0.75rem' }}>Task Approvals & Controls</p>
                {log.tasks.map((task, idx) => (
                    <div key={idx} style={{ backgroundColor: 'var(--surface-hover)', padding: '1rem', borderRadius: '0.5rem', borderLeft: task.riskLevel === 'High' ? '4px solid #ef4444' : task.riskLevel === 'Medium' ? '4px solid #f59e0b' : '4px solid var(--lawn-green)' }}>
                        <div className="flex justify-between mb-2">
                            <h4 className="font-semibold text-sm">{task.description}</h4>
                            <span className="text-xs font-bold" style={{ color: task.riskLevel === 'High' ? '#ef4444' : task.riskLevel === 'Medium' ? '#f59e0b' : 'inherit' }}>{task.riskLevel} Risk</span>
                        </div>
                        <p className="text-sm mb-2"><span className="label-subtle">Hazards:</span> {task.hazard}</p>
                        <p className="text-sm"><span className="label-subtle text-success">Controls:</span> {task.controls}</p>
                    </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
