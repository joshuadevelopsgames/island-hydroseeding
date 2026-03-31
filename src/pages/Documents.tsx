import { Search, FileText, Download, FileArchive, ShieldCheck } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

type DocRecord = {
  id: string;
  name: string;
  category: string;
  size: string;
  type: string;
};

const STORAGE_KEY = 'documentsRepository';

function docIcon(category: string, type: string) {
  const t = type.toLowerCase();
  const c = category.toLowerCase();
  if (c.includes('safety') || c.includes('manual')) return ShieldCheck;
  if (c.includes('emergency') || t.includes('zip')) return FileArchive;
  return FileText;
}

export default function Documents() {
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setDocuments(JSON.parse(saved));
      } catch {
        setDocuments([]);
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      }
    } else {
      setDocuments([]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    }
  }, []);

  const categories = useMemo(() => {
    const fromData = [...new Set(documents.map((d) => d.category))].filter(Boolean).sort();
    return ['All', ...fromData];
  }, [documents]);

  const filteredDocs = documents.filter(
    (doc) =>
      (activeCategory && activeCategory !== 'All' ? doc.category === activeCategory : true) &&
      doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const row: DocRecord = {
      id: Math.random().toString(36).slice(2, 11),
      name: (formData.get('name') as string).trim(),
      category: (formData.get('category') as string).trim() || 'General',
      size: (formData.get('size') as string).trim() || '—',
      type: (formData.get('type') as string).trim() || 'file',
    };
    const next = [row, ...documents];
    setDocuments(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setIsAdding(false);
    e.currentTarget.reset();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="mb-2">Documents & Safety Manual</h1>
          <p>Track SDS sheets, safety manuals, and references (metadata only in this prototype).</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? 'Cancel' : 'Register file'}
        </button>
      </div>

      {isAdding && (
        <div className="card mb-8">
          <h3 className="mb-4">Register a document</h3>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label>Title *</label>
                <input name="name" required placeholder="e.g. Safety manual 2026" />
              </div>
              <div>
                <label>Category</label>
                <input name="category" placeholder="e.g. SDS Sheets" />
              </div>
              <div>
                <label>Size (label)</label>
                <input name="size" placeholder="e.g. 1.2 MB" />
              </div>
              <div>
                <label>Type</label>
                <input name="type" placeholder="e.g. pdf, docx" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
              Save entry
            </button>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem' }}>
        <div className="card" style={{ height: 'fit-content' }}>
          <h3 className="mb-4">Categories</h3>
          <div className="flex flex-col gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`btn ${
                  activeCategory === cat || (activeCategory === null && cat === 'All') ? 'btn-primary' : 'btn-secondary'
                }`}
                style={{ justifyContent: 'flex-start' }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

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
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
            <span className="badge badge-gray">{filteredDocs.length} files</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {filteredDocs.map((doc) => {
              const Icon = docIcon(doc.category, doc.type);
              return (
                <div
                  key={doc.id}
                  style={{ border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '1.25rem', display: 'flex', flexDirection: 'column' }}
                  className="doc-card cursor-pointer"
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ backgroundColor: 'var(--light-green)', color: 'var(--lawn-green)', padding: '0.5rem', borderRadius: '0.5rem' }}>
                      <Icon size={24} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p className="font-semibold text-sm line-clamp-2" style={{ marginBottom: '0.25rem' }}>
                        {doc.name}
                      </p>
                      <p className="text-sm text-secondary">
                        {doc.size} · {doc.type.toUpperCase()}
                      </p>
                      <p className="text-xs text-muted mt-tight">{doc.category}</p>
                    </div>
                  </div>

                  <button type="button" className="btn btn-secondary w-full doc-card__cta">
                    <Download size={16} /> Download
                  </button>
                </div>
              );
            })}

            {filteredDocs.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
                <p>No documents registered. Use Register file to add entries, or upload files when storage is connected.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
