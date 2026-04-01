import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { WorkRequest, RequestStatus, RequestSource } from '@/lib/requestsTypes';
import { useRequestDetail, useRequestsMutations } from '@/hooks/useRequests';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Save, Trash2, ArrowRightCircle } from 'lucide-react';

const REQUEST_STATUSES: RequestStatus[] = ['New', 'Assessment Scheduled', 'Assessment Complete', 'Converted', 'Archived'];
const REQUEST_SOURCES: RequestSource[] = ['website', 'phone', 'email', 'referral', 'other'];

type FormData = {
  title: string;
  description: string;
  status: RequestStatus;
  source: RequestSource;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  assigned_to: string;
  notes: string;
};

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const { data, isLoading: isLoadingDetail } = useRequestDetail(isNew ? null : id);
  const { create, update, delete: delete_, convertToQuote } = useRequestsMutations();

  const [formData, setFormData] = useState<FormData>(() => {
    if (isNew) {
      return {
        title: '',
        description: '',
        status: 'New',
        source: 'website',
        contact_name: '',
        contact_phone: '',
        contact_email: '',
        assigned_to: '',
        notes: '',
      };
    }
    const req = data?.request;
    return {
      title: req?.title || '',
      description: req?.description || '',
      status: req?.status || 'New',
      source: req?.source || 'website',
      contact_name: req?.contact_name || '',
      contact_phone: req?.contact_phone || '',
      contact_email: req?.contact_email || '',
      assigned_to: req?.assigned_to || '',
      notes: req?.notes || '',
    };
  });

  const isLoading = isLoadingDetail || create.isPending || update.isPending;
  const isConverting = convertToQuote.isPending;
  const isDeleting = delete_.isPending;

  const request = data?.request;

  const handleFieldChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      if (isNew) {
        const result = await create.mutateAsync(formData);
        navigate(`/requests/${result.request.id}`);
      } else {
        await update.mutateAsync({ id: id!, ...formData });
      }
    } catch (error) {
      console.error('Error saving request:', error);
    }
  };

  const handleDelete = async () => {
    if (!id || isNew) return;
    if (!confirm('Are you sure you want to delete this request?')) return;

    try {
      await delete_.mutateAsync(id);
      navigate('/requests');
    } catch (error) {
      console.error('Error deleting request:', error);
    }
  };

  const handleConvertToQuote = async () => {
    if (!id || isNew) return;

    try {
      const result = await convertToQuote.mutateAsync({ id });
      navigate(`/quotes/${result.quote_id}`);
    } catch (error) {
      console.error('Error converting to quote:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/requests')}
            disabled={isLoading}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {isNew ? 'New Request' : `Request: ${formData.title || 'Untitled'}`}
            </h1>
            {!isNew && request && (
              <Badge variant="secondary" className="mt-2">
                {request.status}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoadingDetail && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoadingDetail && (
        <>
          {/* Form Card */}
          <div className="mb-6 rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Title */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  placeholder="—"
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              {/* Description */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  placeholder="—"
                  rows={4}
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => handleFieldChange('status', e.target.value as RequestStatus)}
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={isLoading}
                >
                  {REQUEST_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              {/* Source */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Source
                </label>
                <select
                  value={formData.source}
                  onChange={(e) => handleFieldChange('source', e.target.value as RequestSource)}
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={isLoading}
                >
                  {REQUEST_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </div>

              {/* Contact Name */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={formData.contact_name}
                  onChange={(e) => handleFieldChange('contact_name', e.target.value)}
                  placeholder="—"
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              {/* Contact Phone */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={formData.contact_phone}
                  onChange={(e) => handleFieldChange('contact_phone', e.target.value)}
                  placeholder="—"
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              {/* Contact Email */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => handleFieldChange('contact_email', e.target.value)}
                  placeholder="—"
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              {/* Assigned To */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Assigned To
                </label>
                <input
                  type="text"
                  value={formData.assigned_to}
                  onChange={(e) => handleFieldChange('assigned_to', e.target.value)}
                  placeholder="—"
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>

              {/* Notes */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleFieldChange('notes', e.target.value)}
                  placeholder="—"
                  rows={4}
                  className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={isLoading}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {isLoading ? 'Saving...' : 'Save'}
            </Button>

            {!isNew && request && request.status !== 'Converted' && (
              <Button
                onClick={handleConvertToQuote}
                disabled={isConverting || isLoading}
                variant="secondary"
                className="gap-2"
              >
                <ArrowRightCircle className="h-4 w-4" />
                {isConverting ? 'Converting...' : 'Convert to Quote'}
              </Button>
            )}

            {!isNew && (
              <Button
                onClick={handleDelete}
                disabled={isDeleting || isLoading}
                variant="destructive"
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
