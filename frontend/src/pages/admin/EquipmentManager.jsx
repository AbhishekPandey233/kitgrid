import { useEffect, useRef, useState } from 'react';
import axiosClient, { resolveImageUrl } from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Field, { inputClass } from '../../components/ui/Field';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import EquipmentThumbnail from '../../components/ui/EquipmentThumbnail';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const EMPTY_FORM = { name: '', description: '', category: '', quantityAvailable: 1, status: 'active', photoUrl: '' };

export default function EquipmentManager() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [formErrors, setFormErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef(null);

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
      photoUrl: item.photos?.[0] || '',
    });
    setFormErrors([]);
    setUploadError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormErrors([]);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');
    setUploading(true);
    try {
      const body = new FormData();
      body.append('image', file);
      const { data } = await axiosClient.post('/equipment/upload-image', body);
      setForm((f) => ({ ...f, photoUrl: data.url }));
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Image upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleRemovePhoto() {
    setForm((f) => ({ ...f, photoUrl: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      photos: form.photoUrl ? [form.photoUrl] : [],
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

  async function confirmDelete() {
    setDeleting(true);
    try {
      await axiosClient.delete(`/equipment/${deleteTarget._id}`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(false);
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
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Photo</label>
              <div className="flex items-center gap-4">
                <EquipmentThumbnail
                  src={resolveImageUrl(form.photoUrl)}
                  alt=""
                  className="h-40 w-40 shrink-0 rounded-lg"
                  iconClassName="h-12 w-12"
                />
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handlePhotoChange}
                    disabled={uploading}
                    className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                  <div className="flex items-center gap-3">
                    {uploading && <span className="text-xs text-slate-500">Uploading…</span>}
                    {form.photoUrl && !uploading && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="text-xs font-medium text-rose-600 hover:text-rose-700"
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                  {uploadError && <p className="text-xs text-rose-600">{uploadError}</p>}
                </div>
              </div>
            </div>

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
            <Button type="submit" disabled={saving || uploading}>
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
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Photo</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Name</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Category</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Available / Total</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item._id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <EquipmentThumbnail
                        src={resolveImageUrl(item.photos?.[0])}
                        alt={`Photo of ${item.name}`}
                        className="h-10 w-10 rounded-md"
                        iconClassName="h-4 w-4"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{item.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{item.category}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{item.available} / {item.quantityAvailable}</td>
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
                        <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => setDeleteTarget(item)}>
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

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        message="This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
