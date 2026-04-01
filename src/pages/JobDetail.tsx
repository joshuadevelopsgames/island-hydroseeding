import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Job, JobLineItem, JobVisit, JobExpense, JobTimeEntry, JobStatus } from '@/lib/jobsTypes';
import { useJobDetail, useJobsMutations } from '@/hooks/useJobs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatInVancouver } from '@/lib/vancouverTime';
import {
  ArrowLeft,
  Loader2,
  Save,
  Trash2,
  Plus,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle,
} from 'lucide-react';

const STATUS_COLORS: Record<JobStatus, 'default' | 'secondary' | 'outline'> = {
  Active: 'default',
  Late: 'outline',
  'Requires Invoicing': 'secondary',
  Completed: 'secondary',
  Archived: 'outline',
};

const VISIT_STATUS_COLORS: Record<string, 'default' | 'secondary' | 'outline'> = {
  Scheduled: 'secondary',
  'In Progress': 'default',
  Completed: 'default',
  Overdue: 'outline',
};

function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'line-items' | 'visits' | 'expenses' | 'time' | 'profitability'>('overview');
  const [editingFields, setEditingFields] = useState<Record<string, string | null>>({});

  const { data: bundle, isLoading, error } = useJobDetail(id);
  const {
    updateJob,
    createLineItem,
    deleteLineItem,
    createVisit,
    completeVisit,
    createExpense,
    deleteExpense,
    createTimeEntry,
    deleteTimeEntry,
  } = useJobsMutations();

  // Create mode
  if (id === 'new') {
    return <CreateJobForm onSuccess={(jobId) => navigate(`/jobs/${jobId}`)} />;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // Error state
  if (error || !bundle) {
    return (
      <div className="p-6">
        <Button onClick={() => navigate('/jobs')} variant="ghost">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error?.message || 'Job not found'}
        </div>
      </div>
    );
  }

  const { job, line_items, visits, expenses, time_entries, account, property } = bundle;

  const handleJobUpdate = async () => {
    const updates: Partial<Job> = {};
    if (editingFields.status !== undefined) updates.status = editingFields.status as JobStatus;
    if (editingFields.job_type !== undefined) updates.job_type = editingFields.job_type as string;
    if (editingFields.end_date !== undefined) updates.end_date = editingFields.end_date as string | null;
    if (editingFields.notes !== undefined) updates.notes = editingFields.notes as string;

    if (Object.keys(updates).length > 0) {
      await updateJob.mutateAsync({ id: job.id, ...updates });
      setEditingFields({});
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Button onClick={() => navigate('/jobs')} variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">Job #{job.job_number}</h1>
                <Badge variant={STATUS_COLORS[job.status as JobStatus] ?? 'outline'}>{job.status}</Badge>
                {job.job_type && <Badge variant="secondary">{job.job_type}</Badge>}
              </div>
              <p className="text-lg text-slate-600">{job.title}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">
                {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(job.total_price)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Client & Property Info */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {account && (
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <h3 className="font-semibold text-slate-900 mb-2">Client</h3>
              <p className="text-sm text-slate-600">{account.name}</p>
              <p className="text-sm text-slate-600">{account.company}</p>
              <p className="text-sm text-slate-600">{account.phone}</p>
              <p className="text-sm text-slate-600">{account.email}</p>
            </div>
          )}

          {property && (
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <h3 className="font-semibold text-slate-900 mb-2">Property</h3>
              <p className="text-sm text-slate-600">{property.address}</p>
              <p className="text-sm text-slate-600">
                {property.city}, {property.province} {property.postal_code}
              </p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="border-b border-slate-200">
            <div className="flex">
              {['overview', 'line-items', 'visits', 'expenses', 'time', 'profitability'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab === 'line-items' ? 'Line Items' : tab === 'profitability' ? 'Profitability' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Status</label>
                  <select
                    value={(editingFields.status as string) ?? job.status}
                    onChange={(e) => setEditingFields({ ...editingFields, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="Active">Active</option>
                    <option value="Late">Late</option>
                    <option value="Requires Invoicing">Requires Invoicing</option>
                    <option value="Completed">Completed</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Job Type</label>
                  <select
                    value={(editingFields.job_type as string) ?? job.job_type}
                    onChange={(e) => setEditingFields({ ...editingFields, job_type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="">Select Type</option>
                    <option value="One-off">One-off</option>
                    <option value="Recurring">Recurring</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-900 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={job.start_date?.split('T')[0] || ''}
                      disabled
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-900 mb-2">End Date</label>
                    <input
                      type="date"
                      value={(editingFields.end_date as string) ?? job.end_date?.split('T')[0] ?? ''}
                      onChange={(e) => setEditingFields({ ...editingFields, end_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Notes</label>
                  <textarea
                    value={(editingFields.notes as string) ?? job.notes ?? ''}
                    onChange={(e) => setEditingFields({ ...editingFields, notes: e.target.value })}
                    placeholder="—"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg h-32"
                  />
                </div>

                <Button onClick={handleJobUpdate} disabled={updateJob.isPending}>
                  <Save className="w-4 h-4 mr-2" />
                  {updateJob.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            )}

            {/* Line Items Tab */}
            {activeTab === 'line-items' && (
              <LineItemsSection
                lineItems={line_items}
                jobId={job.id}
                createLineItem={createLineItem}
                deleteLineItem={deleteLineItem}
              />
            )}

            {/* Visits Tab */}
            {activeTab === 'visits' && (
              <VisitsSection
                visits={visits}
                jobId={job.id}
                createVisit={createVisit}
                completeVisit={completeVisit}
              />
            )}

            {/* Expenses Tab */}
            {activeTab === 'expenses' && (
              <ExpensesSection
                expenses={expenses}
                jobId={job.id}
                createExpense={createExpense}
                deleteExpense={deleteExpense}
              />
            )}

            {/* Time Tab */}
            {activeTab === 'time' && (
              <TimeEntriesSection
                timeEntries={time_entries}
                jobId={job.id}
                createTimeEntry={createTimeEntry}
                deleteTimeEntry={deleteTimeEntry}
              />
            )}

            {/* Profitability Tab */}
            {activeTab === 'profitability' && (
              <ProfitabilitySection
                job={job}
                lineItems={line_items}
                expenses={expenses}
                timeEntries={time_entries}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateJobForm({ onSuccess }: { onSuccess: (jobId: string) => void }) {
  const navigate = useNavigate();
  const { createJob } = useJobsMutations();
  const [formData, setFormData] = useState({
    title: '',
    job_type: 'One-off' as string,
    status: 'Active' as JobStatus,
    start_date: new Date().toISOString().split('T')[0],
    notes: '',
    account_id: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await createJob.mutateAsync({
        ...formData,
        account_id: formData.account_id || null,
      });
      onSuccess(result.job.id);
    } catch (error) {
      console.error('Failed to create job:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Button onClick={() => navigate('/jobs')} variant="ghost" size="sm" className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <h1 className="text-3xl font-bold mb-8">Create New Job</h1>

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg border border-slate-200 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="—"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-2">Job Type</label>
              <select
                value={formData.job_type}
                onChange={(e) => setFormData({ ...formData, job_type: e.target.value as 'One-off' | 'Recurring' })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="One-off">One-off</option>
                <option value="Recurring">Recurring</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 mb-2">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as JobStatus })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="Active">Active</option>
                <option value="Late">Late</option>
                <option value="Requires Invoicing">Requires Invoicing</option>
                <option value="Completed">Completed</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">Start Date</label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">Account ID</label>
            <input
              type="text"
              value={formData.account_id}
              onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
              placeholder="—"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="—"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg h-32"
            />
          </div>

          <Button type="submit" disabled={createJob.isPending}>
            {createJob.isPending ? 'Creating...' : 'Create Job'}
          </Button>
        </form>
      </div>
    </div>
  );
}

function LineItemsSection({
  lineItems,
  jobId,
  createLineItem,
  deleteLineItem,
}: {
  lineItems: JobLineItem[];
  jobId: string;
  createLineItem: any;
  deleteLineItem: any;
}) {
  const [formData, setFormData] = useState({
    product_service_name: '',
    description: '',
    quantity: '1',
    unit_price: '0',
  });

  const handleAddLineItem = async (e: React.FormEvent) => {
    e.preventDefault();
    await createLineItem.mutateAsync({
      jobId,
      product_service_name: formData.product_service_name,
      description: formData.description,
      quantity: parseInt(formData.quantity),
      unit_price: parseFloat(formData.unit_price),
    });
    setFormData({ product_service_name: '', description: '', quantity: '1', unit_price: '0' });
  };

  const lineItemCost = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-4 font-medium text-slate-900">Product/Service</th>
              <th className="text-left py-2 px-4 font-medium text-slate-900">Description</th>
              <th className="text-right py-2 px-4 font-medium text-slate-900">Qty</th>
              <th className="text-right py-2 px-4 font-medium text-slate-900">Unit Price</th>
              <th className="text-right py-2 px-4 font-medium text-slate-900">Total</th>
              <th className="text-right py-2 px-4 font-medium text-slate-900">Action</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-3 px-4">{item.product_service_name}</td>
                <td className="py-3 px-4">{item.description}</td>
                <td className="py-3 px-4 text-right">{item.quantity}</td>
                <td className="py-3 px-4 text-right">
                  {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(item.unit_price)}
                </td>
                <td className="py-3 px-4 text-right font-medium">
                  {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(
                    item.quantity * item.unit_price
                  )}
                </td>
                <td className="py-3 px-4 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteLineItem.mutateAsync({ id: item.id })}
                    disabled={deleteLineItem.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-50 p-4 rounded-lg">
        <div className="text-right">
          <p className="text-sm text-slate-600 mb-1">Line Items Total:</p>
          <p className="text-xl font-bold text-slate-900">
            {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(lineItemCost)}
          </p>
        </div>
      </div>

      <form onSubmit={handleAddLineItem} className="bg-slate-50 p-4 rounded-lg space-y-4">
        <h3 className="font-medium text-slate-900 flex items-center">
          <Plus className="w-4 h-4 mr-2" />
          Add Line Item
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Product/Service"
            value={formData.product_service_name}
            onChange={(e) => setFormData({ ...formData, product_service_name: e.target.value })}
            className="px-3 py-2 border border-slate-300 rounded-lg"
            required
          />
          <input
            type="text"
            placeholder="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="px-3 py-2 border border-slate-300 rounded-lg"
          />
          <input
            type="number"
            placeholder="Qty"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            min="1"
            className="px-3 py-2 border border-slate-300 rounded-lg"
            required
          />
          <input
            type="number"
            placeholder="Unit Price"
            value={formData.unit_price}
            onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
            step="0.01"
            className="px-3 py-2 border border-slate-300 rounded-lg"
            required
          />
        </div>

        <Button type="submit" size="sm" disabled={createLineItem.isPending}>
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </form>
    </div>
  );
}

function VisitsSection({
  visits,
  jobId,
  createVisit,
  completeVisit,
}: {
  visits: JobVisit[];
  jobId: string;
  createVisit: any;
  completeVisit: any;
}) {
  const [formData, setFormData] = useState({
    scheduled_at: '',
    assigned_to: '',
    notes: '',
  });

  const handleAddVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createVisit.mutateAsync({
      jobId,
      scheduled_at: formData.scheduled_at,
      assigned_to: formData.assigned_to,
      notes: formData.notes,
    });
    setFormData({ scheduled_at: '', assigned_to: '', notes: '' });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {visits.length === 0 ? (
          <p className="text-slate-600">No visits scheduled yet.</p>
        ) : (
          visits.map((visit) => (
            <div key={visit.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <div>
                    <p className="font-medium text-slate-900">
                      {formatInVancouver(new Date(visit.scheduled_at), 'MMM dd, yyyy h:mm a')}
                    </p>
                    <p className="text-sm text-slate-600">Assigned to: {visit.assigned_to || '—'}</p>
                  </div>
                </div>
                <Badge variant={VISIT_STATUS_COLORS[visit.status] || 'secondary'}>{visit.status}</Badge>
              </div>

              {visit.notes && <p className="text-sm text-slate-600 mb-3">{visit.notes}</p>}

              {visit.status === 'Scheduled' && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => completeVisit.mutateAsync({ id: visit.id })}
                  disabled={completeVisit.isPending}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Complete
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleAddVisit} className="bg-slate-50 p-4 rounded-lg space-y-4">
        <h3 className="font-medium text-slate-900 flex items-center">
          <Plus className="w-4 h-4 mr-2" />
          Schedule Visit
        </h3>

        <div className="space-y-3">
          <input
            type="datetime-local"
            value={formData.scheduled_at}
            onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            required
          />
          <input
            type="text"
            placeholder="Assigned to"
            value={formData.assigned_to}
            onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
          <textarea
            placeholder="Notes (optional)"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg h-20"
          />
        </div>

        <Button type="submit" size="sm" disabled={createVisit.isPending}>
          <Plus className="w-4 h-4 mr-2" />
          Schedule
        </Button>
      </form>
    </div>
  );
}

function ExpensesSection({
  expenses,
  jobId,
  createExpense,
  deleteExpense,
}: {
  expenses: JobExpense[];
  jobId: string;
  createExpense: any;
  deleteExpense: any;
}) {
  const [formData, setFormData] = useState({
    description: '',
    amount: '0',
    category: '',
  });

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    await createExpense.mutateAsync({
      jobId,
      description: formData.description,
      amount: parseFloat(formData.amount),
      category: formData.category,
    });
    setFormData({ description: '', amount: '0', category: '' });
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {expenses.length === 0 ? (
          <p className="text-slate-600">No expenses recorded yet.</p>
        ) : (
          expenses.map((expense) => (
            <div key={expense.id} className="flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex items-center gap-3">
                <DollarSign className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="font-medium text-slate-900">{expense.description}</p>
                  <p className="text-sm text-slate-600">{expense.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-medium text-slate-900">
                  {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(expense.amount)}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteExpense.mutateAsync({ id: expense.id })}
                  disabled={deleteExpense.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-slate-50 p-4 rounded-lg">
        <div className="text-right">
          <p className="text-sm text-slate-600 mb-1">Total Expenses:</p>
          <p className="text-xl font-bold text-slate-900">
            {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(totalExpenses)}
          </p>
        </div>
      </div>

      <form onSubmit={handleAddExpense} className="bg-slate-50 p-4 rounded-lg space-y-4">
        <h3 className="font-medium text-slate-900 flex items-center">
          <Plus className="w-4 h-4 mr-2" />
          Add Expense
        </h3>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            required
          />
          <input
            type="number"
            placeholder="Amount"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            step="0.01"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            required
          />
          <input
            type="text"
            placeholder="Category"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>

        <Button type="submit" size="sm" disabled={createExpense.isPending}>
          <Plus className="w-4 h-4 mr-2" />
          Add Expense
        </Button>
      </form>
    </div>
  );
}

function TimeEntriesSection({
  timeEntries,
  jobId,
  createTimeEntry,
  deleteTimeEntry,
}: {
  timeEntries: JobTimeEntry[];
  jobId: string;
  createTimeEntry: any;
  deleteTimeEntry: any;
}) {
  const [formData, setFormData] = useState({
    started_at: '',
    ended_at: '',
    notes: '',
  });

  const handleAddTimeEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTimeEntry.mutateAsync({
      jobId,
      started_at: formData.started_at,
      ended_at: formData.ended_at,
      notes: formData.notes,
    });
    setFormData({ started_at: '', ended_at: '', notes: '' });
  };

  const totalMinutes = timeEntries.reduce((sum, entry) => sum + (entry.duration_minutes ?? 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(2);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {timeEntries.length === 0 ? (
          <p className="text-slate-600">No time entries recorded yet.</p>
        ) : (
          timeEntries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="font-medium text-slate-900">
                    {formatInVancouver(new Date(entry.started_at), 'MMM dd h:mm a')} -{' '}
                    {entry.ended_at ? formatInVancouver(new Date(entry.ended_at), 'h:mm a') : 'In progress'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {((entry.duration_minutes ?? 0) / 60).toFixed(2)} hours {entry.user_id ? `• ${entry.user_id}` : ''}
                  </p>
                  {entry.notes && <p className="text-sm text-slate-600">{entry.notes}</p>}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => deleteTimeEntry.mutateAsync({ id: entry.id })}
                disabled={deleteTimeEntry.isPending}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="bg-slate-50 p-4 rounded-lg">
        <div className="text-right">
          <p className="text-sm text-slate-600 mb-1">Total Time:</p>
          <p className="text-xl font-bold text-slate-900">{totalHours} hours</p>
        </div>
      </div>

      <form onSubmit={handleAddTimeEntry} className="bg-slate-50 p-4 rounded-lg space-y-4">
        <h3 className="font-medium text-slate-900 flex items-center">
          <Plus className="w-4 h-4 mr-2" />
          Log Time
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Start Time</label>
            <input
              type="datetime-local"
              value={formData.started_at}
              onChange={(e) => setFormData({ ...formData, started_at: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">End Time</label>
            <input
              type="datetime-local"
              value={formData.ended_at}
              onChange={(e) => setFormData({ ...formData, ended_at: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              required
            />
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg h-20"
          />
        </div>

        <Button type="submit" size="sm" disabled={createTimeEntry.isPending}>
          <Plus className="w-4 h-4 mr-2" />
          Log Entry
        </Button>
      </form>
    </div>
  );
}

function ProfitabilitySection({
  job,
  lineItems,
  expenses,
  timeEntries,
}: {
  job: Job;
  lineItems: JobLineItem[];
  expenses: JobExpense[];
  timeEntries: JobTimeEntry[];
}) {
  const revenue = job.total_price;
  const lineItemCost = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const labourCost = (timeEntries.reduce((sum, entry) => sum + (entry.duration_minutes ?? 0), 0) / 60) * 45;
  const expenseCost = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalCost = lineItemCost + labourCost + expenseCost;
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const isPositive = profit >= 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Revenue */}
        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-slate-900">Revenue</h3>
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-3xl font-bold text-green-600">
            {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(revenue)}
          </p>
        </div>

        {/* Total Costs */}
        <div className="bg-orange-50 p-6 rounded-lg border border-orange-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-slate-900">Total Costs</h3>
            <DollarSign className="w-5 h-5 text-orange-600" />
          </div>
          <p className="text-3xl font-bold text-orange-600">
            {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(totalCost)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-600 mb-1">Line Items Cost</p>
          <p className="text-xl font-bold text-slate-900">
            {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(lineItemCost)}
          </p>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-600 mb-1">Labour Cost</p>
          <p className="text-xl font-bold text-slate-900">
            {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(labourCost)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {(timeEntries.reduce((sum, entry) => sum + (entry.duration_minutes ?? 0), 0) / 60).toFixed(2)} hours @ $45/hr
          </p>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-600 mb-1">Expenses</p>
          <p className="text-xl font-bold text-slate-900">
            {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(expenseCost)}
          </p>
        </div>

        <div className={`p-4 rounded-lg border ${isPositive ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-sm text-slate-600 mb-1">Profit</p>
          <p className={`text-xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(profit)}
          </p>
        </div>
      </div>

      <div className={`p-6 rounded-lg border ${isPositive ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div className="text-center">
          <p className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>Profit Margin</p>
          <p className={`text-4xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {margin.toFixed(2)}%
          </p>
        </div>
      </div>
    </div>
  );
}

export default JobDetail;
