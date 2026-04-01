import { useMemo, useState, useEffect, useRef } from 'react';
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
  Truck,
  AlertTriangle,
  Fuel,
  FileSpreadsheet,
  Sparkles,
  ChevronDown,
  Download,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow, parseISO, isSameMonth } from 'date-fns';
import {
  isSameVancouverDay,
  toVancouverDate,
  vancouverDifferenceInCalendarDays,
  vancouverNow,
} from '../lib/vancouverTime';
import { loadWorkOrders, loadAssets, loadFuelEntries, loadIssues } from '../lib/fleetStore';
import AdminApprovalsCard from '../components/AdminApprovalsCard';

type PreTripLog = { id: string; date: string; employeeName: string; equipmentId: string; type?: string };
type FLHALog = { id: string; date: string; projectNumber?: string; supervisorName?: string };
type TimeLog = { id: string; clockIn: string; clockOut: string | null; employeeName?: string };
type InvItem = { id: string; quantity: number; threshold: number };

type ActivityRow = { id: string; title: string; meta: string; icon: typeof ClipboardCheck };

function displayFirstName(fullName: string | undefined): string {
  if (!fullName?.trim()) return 'there';
  return fullName.trim().split(/\s+/)[0] ?? 'there';
}

export default function Dashboard() {
  const { currentUser } = useAuth();
  const [tick, setTick] = useState(0);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (exportMenuRef.current?.contains(e.target as Node)) return;
      setExportMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [exportMenuOpen]);

  const runExport = async (kind: 'sheet' | 'pdf') => {
    setExportMenuOpen(false);
    if (kind === 'sheet') {
      const { downloadWorkspaceSheet } = await import('../lib/exportWorkspace');
      downloadWorkspaceSheet();
    } else {
      const { downloadWorkspacePdf } = await import('../lib/exportWorkspace');
      downloadWorkspacePdf();
    }
  };

  const greeting = useMemo(() => {
    void tick;
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, [tick]);

  const snapshot = useMemo(() => {
    const today = vancouverNow();

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

    const workOrders = loadWorkOrders();

    let inventory: InvItem[] = [];
    const inv = localStorage.getItem('inventoryState');
    if (inv) {
      try {
        inventory = JSON.parse(inv);
      } catch {
        inventory = [];
      }
    }

    const pretripsToday = preTrips.filter((l) => isSameVancouverDay(parseISO(l.date), today)).length;
    const flhaToday = flhas.filter((l) => isSameVancouverDay(parseISO(l.date), today)).length;
    const pendingFlhaLabel = flhaToday === 0 ? 'None logged today' : `${flhaToday} logged today`;

    const equipmentDue = workOrders.filter((t) => t.status !== 'completed').length;

    const assets = loadAssets();
    let cvipSoon = 0;
    for (const a of assets) {
      if (!a.cvip.enabled || !a.cvip.nextDueDate) continue;
      try {
        const d = parseISO(a.cvip.nextDueDate);
        if (vancouverDifferenceInCalendarDays(d, today) <= 30) cvipSoon += 1;
      } catch {
        /* skip */
      }
    }

    const fuelRows = loadFuelEntries();
    const fuelMonthSpend = fuelRows.reduce((sum, e) => {
      const t = toVancouverDate(parseISO(e.date));
      if (!isSameMonth(t, today)) return sum;
      return sum + (e.totalCost ?? 0);
    }, 0);

    const openFleetIssues = loadIssues().filter((i) => i.status !== 'resolved').length;
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
      cvipSoon,
      fuelMonthSpend,
      openFleetIssues,
      activities: sorted.map(({ ts: _t, ...rest }) => rest),
    };
  }, [tick]);

  const queuesClear =
    snapshot.equipmentDue === 0 && snapshot.openFleetIssues === 0 && snapshot.lowStock === 0;

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
      label: 'Work orders open',
      value: equipmentDueLabel(snapshot.equipmentDue),
      icon: Wrench,
      color: snapshot.equipmentDue ? '#ef4444' : 'var(--lawn-green)',
      path: '/equipment',
    },
    {
      label: 'CVIP (30 days)',
      value: snapshot.cvipSoon === 0 ? 'None due soon' : `${snapshot.cvipSoon} to plan`,
      icon: Truck,
      color: snapshot.cvipSoon ? '#f59e0b' : 'var(--lawn-green)',
      path: '/assets',
    },
    {
      label: 'Fleet issues open',
      value: snapshot.openFleetIssues === 0 ? 'None' : `${snapshot.openFleetIssues} open`,
      icon: AlertTriangle,
      color: snapshot.openFleetIssues ? '#ef4444' : 'var(--lawn-green)',
      path: '/issues',
    },
    {
      label: 'Fuel spend (month)',
      value: `$${snapshot.fuelMonthSpend.toFixed(0)}`,
      icon: Fuel,
      color: '#0ea5e9',
      path: '/fuel',
    },
    {
      label: 'Low inventory',
      value: lowStockLabel(snapshot.lowStock),
      icon: Package,
      color: snapshot.lowStock ? '#3b82f6' : 'var(--lawn-green)',
      path: '/inventory',
    },
  ];

  const welcomeName = displayFirstName(currentUser?.name);

  return (
    <div>
      <AdminApprovalsCard />
      <div className="flex justify-between items-center mb-8 page-hero">
        <div>
          <p className="page-kicker">{greeting}</p>
          <h1 className="mb-2">Welcome, {welcomeName}</h1>
          <p className="text-secondary" style={{ maxWidth: '36rem', margin: 0 }}>
            Here&apos;s your live snapshot from forms and trackers on this device.
          </p>
          {queuesClear && (
            <p className="dashboard-welcome-nudge" role="status">
              <Sparkles size={16} strokeWidth={2.25} aria-hidden />
              Work orders, fleet issues, and inventory are all in good shape.
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-start">
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              className="btn btn-secondary dashboard-export-trigger"
              aria-expanded={exportMenuOpen}
              aria-haspopup="listbox"
              aria-controls="dashboard-export-format-menu"
              onClick={() => setExportMenuOpen((o) => !o)}
            >
              <Download size={16} aria-hidden />
              Export all data
              <ChevronDown
                size={16}
                aria-hidden
                className={`dashboard-export-chevron${exportMenuOpen ? ' dashboard-export-chevron--open' : ''}`}
              />
            </button>
            {exportMenuOpen && (
              <div
                id="dashboard-export-format-menu"
                className="dashboard-export-menu"
                role="listbox"
                aria-label="Export format"
              >
                <button
                  type="button"
                  className="dashboard-export-menu__item"
                  role="option"
                  onClick={() => void runExport('sheet')}
                >
                  <FileSpreadsheet size={16} aria-hidden />
                  Spreadsheet (.xlsx)
                </button>
                <button
                  type="button"
                  className="dashboard-export-menu__item"
                  role="option"
                  onClick={() => void runExport('pdf')}
                >
                  <FileText size={16} aria-hidden />
                  PDF
                </button>
              </div>
            )}
          </div>
          <Link to="/time" className="btn btn-primary">
            <Clock size={16} /> Time clock
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {stats.map((stat, i) => (
          <Link
            key={i}
            to={stat.path}
            className="card dashboard-stat-card flex flex-col justify-between"
            style={{
              minHeight: '140px',
              textDecoration: 'none',
              color: 'inherit',
              animationDelay: `${i * 55}ms`,
            }}
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
