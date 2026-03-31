import { useState, useEffect } from 'react';
import { Plus, AlertTriangle, Save } from 'lucide-react';

type InventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  threshold: number;
};

const STORAGE_KEY = 'inventoryState';

export default function Inventory() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [dailyUsage, setDailyUsage] = useState<Record<string, number>>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as InventoryItem[];
        setInventory(Array.isArray(parsed) ? parsed : []);
      } catch {
        setInventory([]);
      }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    }
  }, []);

  const persist = (next: InventoryItem[]) => {
    setInventory(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const handleAddItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const qty = parseInt(String(formData.get('quantity')), 10) || 0;
    const thresh = parseInt(String(formData.get('threshold')), 10) || 0;
    const item: InventoryItem = {
      id: Math.random().toString(36).slice(2, 11),
      name: String(formData.get('name') || '').trim(),
      category: String(formData.get('category') || '').trim() || 'General',
      quantity: qty,
      unit: String(formData.get('unit') || '').trim() || 'units',
      threshold: thresh,
    };
    persist([item, ...inventory]);
    setIsAdding(false);
    e.currentTarget.reset();
  };

  const handleUsageChange = (id: string, amount: string) => {
    setDailyUsage((prev) => ({
      ...prev,
      [id]: parseInt(amount, 10) || 0,
    }));
  };

  const processDailyUsage = () => {
    const updatedInventory = inventory.map((item) => {
      const used = dailyUsage[item.id] || 0;
      return { ...item, quantity: Math.max(0, item.quantity - used) };
    });

    persist(updatedInventory);
    setIsUpdating(false);
    setDailyUsage({});
  };

  const lowStockItems = inventory.filter((item) => item.quantity <= item.threshold);

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="mb-2">Inventory Tracking</h1>
          <p>Monitor stock levels and record daily usage of materials.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setIsUpdating(!isUpdating)}>
          {isUpdating ? 'Cancel update' : 'Log daily usage'}
        </button>
      </div>

      {lowStockItems.length > 0 && !isUpdating && (
        <div className="card mb-8" style={{ backgroundColor: '#fffbfa', borderLeft: '4px solid #ef4444' }}>
          <h3 className="mb-2 flex items-center gap-2" style={{ color: '#ef4444' }}>
            <AlertTriangle size={20} /> Reorder requirements
          </h3>
          <p className="text-sm text-secondary mb-4">Items at or below their minimum threshold.</p>
          <div className="flex flex-col gap-2">
            {lowStockItems.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center"
                style={{ padding: '0.75rem', backgroundColor: 'var(--surface-color)', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}
              >
                <span className="font-semibold">{item.name}</span>
                <span className="text-sm">
                  <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{item.quantity}</span> / {item.threshold} {item.unit} threshold
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdding && (
        <div className="card mb-8">
          <h3 className="mb-4">Add material</h3>
          <form onSubmit={handleAddItem} className="flex flex-col gap-4">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div>
                <label>Name *</label>
                <input name="name" required placeholder="Material name" />
              </div>
              <div>
                <label>Category</label>
                <input name="category" placeholder="Seed, mulch, …" />
              </div>
              <div>
                <label>Quantity *</label>
                <input name="quantity" type="number" min="0" required placeholder="0" />
              </div>
              <div>
                <label>Unit</label>
                <input name="unit" placeholder="bags, bales, …" />
              </div>
              <div>
                <label>Reorder threshold *</label>
                <input name="threshold" type="number" min="0" required placeholder="0" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary">
                Save
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setIsAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {isUpdating ? (
        <div className="card mb-8">
          <div className="flex justify-between items-center mb-6">
            <h3>Log daily usage</h3>
            <button type="button" className="btn btn-primary" onClick={processDailyUsage}>
              <Save size={16} /> Save deductions
            </button>
          </div>
          {inventory.length === 0 ? (
            <p className="text-muted">No materials to update. Add items first.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '1rem 0.5rem' }}>Material</th>
                  <th style={{ padding: '1rem 0.5rem' }}>Current stock</th>
                  <th style={{ padding: '1rem 0.5rem' }}>Used today</th>
                  <th style={{ padding: '1rem 0.5rem' }}>New balance</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => {
                  const used = dailyUsage[item.id] || 0;
                  const balance = item.quantity - used;
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '1rem 0.5rem', fontWeight: 500 }}>{item.name}</td>
                      <td style={{ padding: '1rem 0.5rem' }}>
                        {item.quantity} {item.unit}
                      </td>
                      <td style={{ padding: '1rem 0.5rem' }}>
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={dailyUsage[item.id] ?? ''}
                          onChange={(e) => handleUsageChange(item.id, e.target.value)}
                          placeholder="0"
                          style={{ width: '100px', padding: '0.5rem' }}
                        />
                      </td>
                      <td style={{ padding: '1rem 0.5rem', fontWeight: 600, color: balance <= item.threshold ? '#ef4444' : 'inherit' }}>
                        {balance} {item.unit}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h3>Current stock</h3>
            <button type="button" className="btn btn-secondary" onClick={() => setIsAdding(!isAdding)}>
              <Plus size={16} /> {isAdding ? 'Close form' : 'Add item'}
            </button>
          </div>
          {inventory.length === 0 ? (
            <p className="text-muted">No inventory yet. Use Add item to create a line.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '1rem 0.5rem' }}>Category</th>
                  <th style={{ padding: '1rem 0.5rem' }}>Material</th>
                  <th style={{ padding: '1rem 0.5rem' }}>Quantity</th>
                  <th style={{ padding: '1rem 0.5rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>{item.category}</td>
                    <td style={{ padding: '1rem 0.5rem', fontWeight: 500 }}>{item.name}</td>
                    <td style={{ padding: '1rem 0.5rem' }}>
                      {item.quantity} {item.unit}
                    </td>
                    <td style={{ padding: '1rem 0.5rem' }}>
                      {item.quantity <= item.threshold ? (
                        <span className="badge" style={{ backgroundColor: '#fee2e2', color: '#ef4444' }}>
                          Low stock
                        </span>
                      ) : (
                        <span className="badge badge-green">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
