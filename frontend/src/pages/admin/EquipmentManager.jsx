import { useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';

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
      <h1>Equipment manager</h1>

      <form onSubmit={handleSubmit} noValidate aria-label={editingId ? 'Edit equipment' : 'Add equipment'}>
        <h2>{editingId ? `Editing: ${form.name}` : 'Add equipment'}</h2>

        <div>
          <label htmlFor="eq-name">Name</label>
          <input id="eq-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>

        <div>
          <label htmlFor="eq-category">Category</label>
          <input id="eq-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </div>

        <div>
          <label htmlFor="eq-quantity">Quantity available</label>
          <input
            id="eq-quantity"
            type="number"
            min={0}
            value={form.quantityAvailable}
            onChange={(e) => setForm({ ...form, quantityAvailable: e.target.value })}
            required
          />
        </div>

        <div>
          <label htmlFor="eq-description">Description</label>
          <textarea
            id="eq-description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="eq-status">Status</label>
          <select id="eq-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="retired">Retired</option>
          </select>
        </div>

        <button type="submit" disabled={saving}>
          {editingId ? 'Save changes' : 'Add equipment'}
        </button>
        {editingId && (
          <button type="button" onClick={cancelEdit}>
            Cancel
          </button>
        )}

        {formErrors.length > 0 && (
          <ul role="alert">
            {formErrors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        )}
      </form>

      {status === 'loading' && <p>Loading…</p>}
      {status === 'error' && <p role="alert">{error}</p>}

      {status === 'ready' && (
        <table>
          <caption>All equipment</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Category</th>
              <th scope="col">Quantity</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id}>
                <td>{item.name}</td>
                <td>{item.category}</td>
                <td>{item.quantityAvailable}</td>
                <td>{item.status}</td>
                <td>
                  <button type="button" onClick={() => startEdit(item)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(item)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
