import { useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Field, { inputClass } from '../../components/ui/Field';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';

const EMPTY_FORM = { name: '', description: '', category: '', quantityAvailable: 1, status: 'active' };

export default function EquipmentManager() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [formErrors, setFormErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  function load() {
    setStatus('loading');
    axiosClient
      .get('/equipment', { params: { limit: 100 } })
      .then(({ data }) => {
        setItems(data.equipment);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Failed to load equipment');
        setStatus('error');
      });
  }

  useEffect(load, []);

  function startEdit(item) {
    setEditingId(item._id);
    setForm({
      name: item.name,
      description: item.description || '',
      category: item.category || '',
      quantityAvailable: item.quantityAvailable,
      status: item.status,
    });
    setFormErrors([]);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormErrors([]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormErrors([]);
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description || undefined,
      category: form.category || undefined,
      quantityAvailable: Number(form.quantityAvailable),
      status: form.status,
    };
    try {
      if (editingId) {
        await axiosClient.patch(`/equipment/${editingId}`, payload);
      } else {
        await axiosClient.post('/equipment', payload);
      }
      cancelEdit();
      load();
    } catch (err) {
      setFormErrors(err.response?.data?.details || [err.response?.data?.error || 'Save failed']);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await axiosClient.delete(`/equipment/${item._id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
    }
  }

  return (
    <div>
      <PageHeader title="Equipment manager" subtitle="Add, edit, and retire equipment in the catalog." />

      <Card className="mb-8">
        <form onSubmit={handleSubmit} noValidate aria-label={editingId ? 'Edit equipment' : 'Add equipment'}>
          <h2 className="text-base font-semibold text-slate-900">
            {editingId ? `Editing: ${form.name}` : 'Add equipment'}
          </h2>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="eq-name">
              <input
                id="eq-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                required
              />
            </Field>

            <Field label="Category" htmlFor="eq-category">
              <input
                id="eq-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={inputClass}
              />
            </Field>

            <Field label="Quantity available" htmlFor="eq-quantity">
              <input
                id="eq-quantity"
                type="number"
                min={0}
                value={form.quantityAvailable}
                onChange={(e) => setForm({ ...form, quantityAvailable: e.target.value })}
                className={inputClass}
                required
              />
            </Field>

            <Field label="Status" htmlFor="eq-status">
              <select
                id="eq-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={inputClass}
              >
                <option value="active">Active</option>
                <option value="retired">Retired</option>
              </select>
            </Field>

            <div className="sm:col-span-2">
              <Field label="Description" htmlFor="eq-description">
                <textarea
                  id="eq-description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {editingId ? 'Save changes' : 'Add equipment'}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={cancelEdit}>
                Cancel
              </Button>
            )}
          </div>

          {formErrors.length > 0 && (
            <Alert className="mt-4">
              <ul className="list-disc space-y-0.5 pl-4">
                {formErrors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </Alert>
          )}
        </form>
      </Card>

      {status === 'loading' && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}
      {status === 'error' && <Alert>{error}</Alert>}

      {status === 'ready' && (
        <div className="animate-fade-in-up overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <caption className="sr-only">All equipment</caption>
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Name</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Category</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Quantity</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item._id} className="transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{item.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{item.category}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{item.quantityAvailable}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          item.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(item)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(item)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
