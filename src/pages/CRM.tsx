import { useState, useEffect } from 'react';
import { Plus, Users, Search, Phone, Edit2, Trash2 } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';

type LeadStatus = 'New Lead' | 'Contacted' | 'Estimate Sent' | 'Won / Closed' | 'Lost';
type LeadType = 'Residential' | 'Commercial' | 'Municipal';

type Lead = {
  id: string;
  name: string;
  company: string;
  type: LeadType;
  status: LeadStatus;
  contact: string;
  marketingSource: string;
  lastContacted: string;
  notes: string;
};

const STORAGE_KEY = 'crmLeads';

export default function CRM() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setLeads(JSON.parse(saved));
      } catch {
        setLeads([]);
      }
    } else {
      setLeads([]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    }
  }, []);

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newLead: Lead = {
      id: Math.random().toString(36).substr(2, 9),
      name: formData.get('name') as string,
      company: formData.get('company') as string,
      type: formData.get('type') as LeadType,
      status: formData.get('status') as LeadStatus,
      contact: formData.get('contact') as string,
      marketingSource: formData.get('marketingSource') as string,
      lastContacted: new Date().toISOString(),
      notes: formData.get('notes') as string,
    };

    const updated = [newLead, ...leads];
    setLeads(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setIsAdding(false);
  };

  const leadPendingDelete = deleteLeadId ? leads.find((l) => l.id === deleteLeadId) : null;

  const confirmDeleteLead = () => {
    if (!deleteLeadId) return;
    const updated = leads.filter((l) => l.id !== deleteLeadId);
    setLeads(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setDeleteLeadId(null);
  };

  const getStatusColor = (status: LeadStatus) => {
    switch (status) {
      case 'New Lead':
        return { bg: '#e0e7ff', text: '#4338ca' };
      case 'Contacted':
        return { bg: '#fef3c7', text: '#b45309' };
      case 'Estimate Sent':
        return { bg: '#e0f2fe', text: '#0369a1' };
      case 'Won / Closed':
        return { bg: 'var(--light-green)', text: 'var(--lawn-green)' };
      case 'Lost':
        return { bg: '#fee2e2', text: '#ef4444' };
      default:
        return { bg: '#f1f5f9', text: '#64748b' };
    }
  };

  const filteredLeads = leads.filter(
    (l) =>
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <ConfirmDialog
        open={deleteLeadId !== null}
        title="Delete this lead?"
        message={
          leadPendingDelete
            ? `Remove “${leadPendingDelete.name}”${leadPendingDelete.company ? ` (${leadPendingDelete.company})` : ''} from the CRM. This cannot be undone.`
            : 'Remove this lead from the CRM. This cannot be undone.'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteLead}
        onCancel={() => setDeleteLeadId(null)}
      />

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="mb-2">Leads & CRM</h1>
          <p>Track prospective clients, marketing sources, and sales.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? 'Cancel' : (
            <>
              <Plus size={16} /> New Lead
            </>
          )}
        </button>
      </div>

      {isAdding && (
        <div className="card mb-8">
          <h3 className="mb-4">Add New Lead</h3>
          <form onSubmit={handleSave} className="flex flex-col gap-6">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <label>Contact Name *</label>
                <input name="name" required placeholder="Name" />
              </div>
              <div>
                <label>Company (if Commercial)</label>
                <input name="company" placeholder="Company name (optional)" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
              <div>
                <label>Lead Type *</label>
                <select name="type" required>
                  <option value="Residential">Residential</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Municipal">Municipal</option>
                </select>
              </div>
              <div>
                <label>Status *</label>
                <select name="status" required>
                  <option value="New Lead">New Lead</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Estimate Sent">Estimate Sent</option>
                  <option value="Won / Closed">Won / Closed</option>
                  <option value="Lost">Lost</option>
                </select>
              </div>
              <div>
                <label>Marketing Source</label>
                <select name="marketingSource">
                  <option value="Google Search">Google Search</option>
                  <option value="Facebook Ad">Facebook Ad</option>
                  <option value="Referral">Word of Mouth / Referral</option>
                  <option value="Truck Signage">Truck Signage</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label>Phone or Email *</label>
              <input name="contact" required placeholder="Phone or email" />
            </div>

            <div>
              <label>Notes / Follow Up Action</label>
              <textarea name="notes" rows={3} placeholder="Notes (optional)" />
            </div>

            <div className="flex justify-end pt-4 border-t-subtle">
              <button type="submit" className="btn btn-primary">
                Save Lead
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <div style={{ position: 'relative', width: '300px' }}>
            <Search
              size={18}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
          <div className="flex gap-4 items-center">
            <span className="text-sm font-semibold text-secondary">Total: {leads.length} leads</span>
            <span className="text-sm font-semibold text-secondary">
              Won: {leads.filter((l) => l.status === 'Won / Closed').length}
            </span>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>Name / Company</th>
                <th style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>Contact</th>
                <th style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>Type & Source</th>
                <th style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>Status</th>
                <th style={{ padding: '1rem 0.5rem', fontSize: '0.875rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => {
                const colors = getStatusColor(lead.status);
                return (
                  <tr key={lead.id} style={{ borderBottom: '1px solid var(--border-color)' }} className="row-hover">
                    <td style={{ padding: '1rem 0.5rem' }}>
                      <p className="font-semibold">{lead.name}</p>
                      {lead.company && <p className="text-xs text-muted mt-tight">{lead.company}</p>}
                    </td>
                    <td style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>
                      <p className="flex items-center gap-1 text-sm">
                        <Phone size={14} /> {lead.contact}
                      </p>
                    </td>
                    <td style={{ padding: '1rem 0.5rem' }}>
                      <p className="text-sm">{lead.type}</p>
                      <p className="text-xs text-muted mt-tight">{lead.marketingSource}</p>
                    </td>
                    <td style={{ padding: '1rem 0.5rem' }}>
                      <span className="badge" style={{ backgroundColor: colors.bg, color: colors.text }}>
                        {lead.status}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 0.5rem' }}>
                      <div className="flex items-center" style={{ gap: '0.35rem' }}>
                        <button className="btn btn-secondary" style={{ padding: '0.4rem 0.6rem' }} type="button" title="Edit Lead">
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.4rem 0.6rem' }}
                          type="button"
                          title="Delete lead"
                          onClick={() => setDeleteLeadId(lead.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                    <Users size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                    <p>No leads yet. Add one with New Lead.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
