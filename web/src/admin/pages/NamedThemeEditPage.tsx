import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api.ts';
import type { Theme } from '../api.ts';
import { ThemeEditor } from '../components/ThemeEditor.tsx';

export function NamedThemeEditPage() {
  const { id } = useParams<{ id: string }>();
  const themeId = Number(id);
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['named-theme', themeId],
    queryFn:  () => api.getNamedTheme(themeId),
    enabled:  !!themeId,
  });

  const [draft,          setDraft]          = useState<Theme | null>(null);
  const [name,           setName]           = useState('');
  const [editingName,    setEditingName]    = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingLogo,  setUploadingLogo]  = useState(false);
  const [savedMsg,       setSavedMsg]       = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      if (!draft) setDraft(data.settings);
      if (!name)  setName(data.name);
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (updates: Partial<Theme>) => {
    setDraft((d) => d ? { ...d, ...updates } : null);
  };

  const handleUploadImage = async (file: File, target: 'background' | 'logo') => {
    const setUploading = target === 'logo' ? setUploadingLogo : setUploadingImage;
    setUploading(true);
    setError(null);
    try {
      const result = await api.uploadImage(file);
      if (target === 'logo') {
        setDraft((d) => d ? { ...d, logoImagePath: result.path } : null);
      } else {
        setDraft((d) => d ? { ...d, defaultBackgroundImagePath: result.path } : null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateNamedTheme(themeId, draft);
      await qc.invalidateQueries({ queryKey: ['named-theme', themeId] });
      await qc.invalidateQueries({ queryKey: ['named-themes'] });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleRenameSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateNamedTheme(themeId, { name: name.trim() });
      await qc.invalidateQueries({ queryKey: ['named-theme', themeId] });
      await qc.invalidateQueries({ queryKey: ['named-themes'] });
      setEditingName(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Rename failed.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-8"><p className="text-gray-400">Loading theme…</p></div>;
  }

  if (isError || !data) {
    return <div className="p-8"><p className="text-red-400">Theme not found.</p></div>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b border-gray-800 px-8 py-5">
        <div>
          <Link to="/admin/themes" className="mb-1 inline-block text-sm text-indigo-400 hover:text-indigo-300">
            ← Themes
          </Link>
          {editingName ? (
            <div className="flex items-center gap-3 mt-1">
              <input
                autoFocus
                className="input text-xl font-semibold"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleRenameSave(); if (e.key === 'Escape') setEditingName(false); }}
              />
              <button
                onClick={handleRenameSave}
                disabled={saving}
                className="btn-primary text-sm"
              >
                {saving ? 'Saving…' : 'Save Name'}
              </button>
              <button
                onClick={() => { setEditingName(false); setName(data.name); }}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-white">{data.name}</h1>
              <button
                onClick={() => setEditingName(true)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Rename
              </button>
            </div>
          )}
          <p className="mt-0.5 text-sm text-gray-500">
            Used by {data.usedByRooms} room{data.usedByRooms !== 1 ? 's' : ''},{' '}
            {data.usedByGroups} group{data.usedByGroups !== 1 ? 's' : ''},{' '}
            {data.usedBySchedules} schedule{data.usedBySchedules !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedMsg && (
            <span className="rounded-lg bg-emerald-900/40 px-3 py-1.5 text-sm text-emerald-400">
              ✓ Saved
            </span>
          )}
          <button
            type="button"
            disabled={saving || !draft}
            onClick={handleSave}
            className="btn-primary px-6 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 mx-8 mt-4 rounded-lg border border-red-900 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {draft && (
        <div className="flex-1 min-h-0">
          <ThemeEditor
            value={draft}
            onChange={handleChange}
            onUploadImage={handleUploadImage}
            uploadingImage={uploadingImage}
            uploadingLogo={uploadingLogo}
            saving={saving}
            onSave={handleSave}
            layout="three-panel"
          />
        </div>
      )}
    </div>
  );
}
