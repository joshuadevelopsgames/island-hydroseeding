import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardCheck,
  ShieldAlert,
  Wrench,
  Package,
  Clock,
  ArrowRight,
  PenLine,
  Boxes,
  ListTodo,
  FileText,
} from 'lucide-react';
import { formatDistanceToNow, isSameDay, parseISO } from 'date-fns';

type PreTripLog = { id: string; date: string; employeeName: string; equipmentId: string; type?: string };
type FLHALog = { id: string; date: string; projectNumber?: string; supervisorName?: string };
type TimeLog = { id: string; clockIn: string; clockOut: string | null; employeeName?: string };
type MaintTask = { id: string; status: string };
type InvItem = { id: string; quantity: number; threshold: number };

type ActivityRow = { id: string; title: string; meta: string; icon: typeof ClipboardCheck };

export default function Dashboard() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const snapshot = useMemo(() => {
    const today = new Date();

    let preTrips: PreTripLog[] = [];
    const pt = localStorage.getItem('preTripLogs_v2');
    if (pt) {
      try {
        preTrips = JSON.parse(pt);
      } catch {
        preTrips = [];
      }
    }

    let flhas: FLHALog[] = [];
    const fh = localStorage.getItem('flhaLogs_v2');
    if (fh) {
      try {
        flhas = JSON.parse(fh);
      } catch {
        flhas = [];
      }
    }

    let maintenance: MaintTask[] = [];
    const eq = localStorage.getItem('equipmentMaintenance');
    if (eq) {
      try {
        maintenance = JSON.parse(eq);
      } catch {
        maintenance = [];
      }
    }

    let inventory: InvItem[] = [];
    const inv = localStorage.getItem('inventoryState');
    if (inv) {
      try {
        inventory = JSON.parse(inv);
      } catch {
        inventory = [];
      }
    }

    const pretripsToday = preTrips.filter((l) => isSameDay(parseISO(l.date), today)).length;
    const flhaToday = flhas.filter((l) => isSameDay(parseISO(l.date), today)).length;
    const pendingFlhaLabel = flhaToday === 0 ? 'None logged today' : `${flhaToday} logged today`;

    const equipmentDue = maintenance.filter((t) => t.status === 'pending').length;
    const lowStock = inventory.filter((i) => i.quantity <= i.threshold).length;

    const activities: ActivityRow[] = [];

    preTrips.slice(0, 8).forEach((l) => {
      activities.push({
        id: `pt-${l.id}`,
        title: `Pre-trip (${l.type ?? 'Truck'}): ${l.equipmentId || 'Equipment'}`,
        meta: `${l.employeeName || 'Crew'} · ${formatDistanceToNow(parseISO(l.date), { addSuffix: true })}`,
        icon: ClipboardCheck,
      });
    });

    flhas.slice(0, 8).forEach((l) => {
      activities.push({
        id: `fh-${l.id}`,
        title: `FLHA: ${l.projectNumber || 'Project'} — ${l.supervisorName || 'Supervisor'}`,
        meta: formatDistanceToNow(parseISO(l.date), { addSuffix: true }),
        icon: ShieldAlert,
      });
    });

    let timeLogs: TimeLog[] = [];
    const tl = localStorage.getItem('timeLogs');
    if (tl) {
      try {
        timeLogs = JSON.parse(tl);
      } catch {
        timeLogs = [];
      }
    }

    timeLogs.slice(0, 6).forEach((l) => {
      activities.push({
        id: `tm-${l.id}`,
        title: l.clockOut ? 'Time entry (completed)' : 'Clocked in',
        meta: `${l.employeeName || 'Employee'} · ${formatDistanceToNow(parseISO(l.clockIn), { addSuffix: true })}`,
        icon: Clock,
      });
    });

    const sorted = activities
      .map((a) => {
        let ts = 0;
        const pid = a.id.replace(/^(pt|fh|tm)-/, '');
        if (a.id.startsWith('pt-')) {
          const row = preTrips.find((p) => p.id === pid);
          if (row) ts = parseISO(row.date).getTime();
        } else if (a.id.startsWith('fh-')) {
          const row = flhas.find((f) => f.id === pid);
          if (row) ts = parseISO(row.date).getTime();
        } else {
          const row = timeLogs.find((t) => t.id === pid);
          if (row) ts = parseISO(row.clockIn).getTime();
        }
        return { ...a, ts };
      })
      .sort((x, y) => y.ts - x.ts)
      .slice(0, 8);

    return {
      pretripsToday,
      pendingFlhaLabel,
      equipmentDue,
      lowStock,
      activities: sorted.map(({ ts: _t, ...rest }) => rest),
    };
  }, [tick]);

  const stats = [
    {
      label: "Today's pre-trips",
      value: `${snapshot.pretripsToday} logged`,
      icon: ClipboardCheck,
      color: 'var(--lawn-green)',
      path: '/pre-trips',
    },
    {
      label: 'FLHA (today)',
      value: snapshot.pendingFlhaLabel,
      icon: ShieldAlert,
      color: '#f59e0b',
      path: '/flha',
    },
    {
      label: 'Equipment due',
      value: equipmentDueLabel(snapshot.equipmentDue),
      icon: Wrench,
      color: snapshot.equipmentDue ? '#ef4444' : 'var(--lawn-green)',
      path: '/equipment',
    },
    {
      label: 'Low inventory',
      value: lowStockLabel(snapshot.lowStock),
      icon: Package,
      color: snapshot.lowStock ? '#3b82f6' : 'var(--lawn-green)',
      path: '/inventory',
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-8 page-hero">
        <div>
          <h1 className="mb-2">Dashboard overview</h1>
          <p>Live snapshot from forms and trackers stored in this browser.</p>
        </div>
        <Link to="/time" className="btn btn-primary">
          <Clock size={16} /> Time clock
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {stats.map((stat, i) => (
          <Link
            key={i}
            to={stat.path}
            className="card flex flex-col justify-between"
            style={{ minHeight: '140px', textDecoration: 'none', color: 'inherit' }}
          >
            <div className="flex justify-between items-start mb-4">
              <div
                style={{
                  backgroundColor: `${stat.color}15`,
                  color: stat.color,
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                }}
              >
                <stat.icon size={24} />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-muted mb-1">{stat.label}</p>
              <h2 style={{ fontSize: '1.5rem' }}>{stat.value}</h2>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }} className="dashboard-grid">
        <div className="card">
          <h3 className="mb-4">Recent activity</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {snapshot.activities.length === 0 ? (
              <p className="text-sm text-muted">No pre-trips, FLHAs, or time entries yet.</p>
            ) : (
              snapshot.activities.map((row, i) => (
                <div
                  key={row.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    paddingBottom: '1rem',
                    borderBottom: i !== snapshot.activities.length - 1 ? '1px solid var(--border-color)' : 'none',
                  }}
                >
                  <div style={{ padding: '0.5rem', backgroundColor: 'var(--surface-hover)', borderRadius: '50%' }}>
                    <row.icon size={16} color="var(--text-secondary)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="font-semibold text-sm">{row.title}</p>
                    <p className="text-sm text-muted">{row.meta}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <Link to="/pre-trips" className="btn btn-secondary w-full" style={{ marginTop: '1.5rem' }}>
            View pre-trips <ArrowRight size={16} />
          </Link>
        </div>

        <div className="card">
          <h3 className="mb-4">Quick links</h3>
          <div className="flex flex-col gap-2">
            <Link to="/flha" className="btn btn-secondary w-full quick-link">
              <PenLine size={18} /> New FLHA
            </Link>
            <Link to="/inventory" className="btn btn-secondary w-full quick-link">
              <Boxes size={18} /> Inventory
            </Link>
            <Link to="/tasks" className="btn btn-secondary w-full quick-link">
              <ListTodo size={18} /> Tasks
            </Link>
            <Link to="/documents" className="btn btn-secondary w-full quick-link">
              <FileText size={18} /> Documents
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function equipmentDueLabel(n: number) {
  if (n === 0) return 'All clear';
  return n === 1 ? '1 item due' : `${n} items due`;
}

function lowStockLabel(n: number) {
  if (n === 0) return 'Above threshold';
  return n === 1 ? '1 item low' : `${n} items low`;
}
