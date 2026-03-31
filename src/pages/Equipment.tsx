import { useState, useMemo, useEffect } from 'react';
import { Plus, Calendar as CalendarIcon, AlertCircle, CheckCircle } from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  startOfMonth, 
  endOfMonth, 
  isSameMonth, 
  isSameDay, 
  parseISO
} from 'date-fns';

type MaintenanceTask = {
  id: string;
  equipment: string;
  service: string;
  dueDate: string;
  status: 'pending' | 'completed';
};

const STORAGE_KEY = 'equipmentMaintenance';

export default function Equipment() {
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as MaintenanceTask[];
        setTasks(Array.isArray(parsed) ? parsed : []);
      } catch {
        setTasks([]);
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    }
  }, []);

  const persistTasks = (next: MaintenanceTask[]) => {
    setTasks(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const daysInMonth = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate));
    const end = endOfWeek(endOfMonth(currentDate));
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const toggleStatus = (id: string) => {
    persistTasks(tasks.map(t => t.id === id ? { ...t, status: t.status === 'pending' ? 'completed' : 'pending' } : t));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="mb-2">Equipment Maintenance</h1>
          <p>Track repairs, servicing, and scheduled maintenance for all assets.</p>
        </div>
        <button className="btn btn-primary">
          <Plus size={16} /> Schedule Maintenance
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem' }}>
        <div className="card" style={{ height: 'fit-content' }}>
          <h3 className="mb-4 flex items-center gap-2"><AlertCircle size={20} color="#ef4444" /> Action Required</h3>
          <div className="flex flex-col gap-3">
            {tasks.filter(t => t.status === 'pending').map(task => (
              <div key={task.id} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '0.5rem', backgroundColor: '#fffbfa', borderLeft: '4px solid #ef4444' }}>
                <p className="font-semibold text-sm mb-1">{task.equipment}</p>
                <p className="text-sm text-secondary mb-3">{task.service}</p>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold" style={{ color: '#ef4444' }}>Due: {format(parseISO(task.dueDate), 'MMM d, yyyy')}</span>
                  <button onClick={() => toggleStatus(task.id)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                    Mark Done
                  </button>
                </div>
              </div>
            ))}
            {tasks.filter(t => t.status === 'pending').length === 0 && (
              <p className="text-sm text-muted text-center py-4">All equipment is up to date.</p>
            )}
          </div>
          
          <h3 className="mb-4 mt-8 flex items-center gap-2"><CheckCircle size={20} color="var(--lawn-green)" /> Recently Completed</h3>
          <div className="flex flex-col gap-3">
            {tasks.filter(t => t.status === 'completed').map(task => (
              <div key={task.id} style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '0.5rem', opacity: 0.7 }}>
                <div className="flex justify-between">
                  <p className="font-semibold text-sm mb-1 line-through" style={{ color: 'var(--text-muted)' }}>{task.equipment}</p>
                  <button
                    type="button"
                    onClick={() => toggleStatus(task.id)}
                    className="btn-ghost-link"
                    style={{ fontSize: '0.75rem', padding: '0.15rem 0' }}
                  >
                    Undo
                  </button>
                </div>
                <p className="text-sm text-muted">{task.service}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h3 className="flex items-center gap-2"><CalendarIcon size={20} /> Schedule Calendar</h3>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>Prev</button>
              <h3 style={{ width: '150px', textAlign: 'center' }}>{format(currentDate, 'MMMM yyyy')}</h3>
              <button className="btn btn-secondary" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>Next</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: 'var(--border-color)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', overflow: 'hidden' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} style={{ padding: '0.75rem', backgroundColor: 'var(--surface-color)', textAlign: 'center', fontWeight: 'bold', fontSize: '0.875rem' }}>
                {day}
              </div>
            ))}
            {daysInMonth.map(day => {
              const dayTasks = tasks.filter(t => isSameDay(parseISO(t.dueDate), day));
              return (
                <div key={day.toString()} style={{ 
                  minHeight: '100px', 
                  padding: '0.5rem', 
                  backgroundColor: !isSameMonth(day, currentDate) ? 'var(--bg-color)' : 'var(--surface-color)',
                  color: !isSameMonth(day, currentDate) ? 'var(--text-muted)' : 'var(--text-primary)'
                }}>
                  <div className="text-right text-sm font-semibold mb-1" style={{ opacity: isSameDay(day, new Date()) ? 1 : 0.7 }}>
                    {isSameDay(day, new Date()) ? <span style={{ backgroundColor: 'var(--primary-green)', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '99px' }}>{format(day, 'd')}</span> : format(day, 'd')}
                  </div>
                  {dayTasks.map(t => (
                    <div key={t.id} style={{ 
                      fontSize: '0.7rem', 
                      padding: '0.25rem 0.5rem', 
                      backgroundColor: t.status === 'completed' ? 'var(--light-green)' : '#fee2e2', 
                      color: t.status === 'completed' ? 'var(--lawn-green)' : '#ef4444',
                      borderRadius: '0.25rem',
                      marginBottom: '0.25rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }} title={`${t.equipment} - ${t.service}`}>
                      {t.service}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
