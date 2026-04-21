import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api.ts';
import type { Theme } from '../api.ts';
import { ThemeEditor } from '../components/ThemeEditor.tsx';

export function ThemePage() {
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['global-theme'],
    queryFn:  () => api.getGlobalTheme(),
  });

  const [draft,          setDraft]          = useState<Theme | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savedMsg,       setSavedMsg]       = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  // Initialise (or re-initialise) the draft whenever server data arrives
  useEffect(() => {
    if (data && !draft) setDraft(data.settings);
  }, [data, draft]);

  const handleChange = (updates: Partial<Theme>) => {
    setDraft((d) => d ? { ...d, ...updates } : null);
  };

  const handleUploadImage = async (file: File) => {
    setUploadingImage(true);
    setError(null);
    try {
      const result = await api.uploadImage(file);
      setDraft((d) => d ? { ...d, defaultBackgroundImagePath: result.path } : null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateGlobalTheme(draft);
      await qc.invalidateQueries({ queryKey: ['global-theme'] });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-gray-400">Loading theme…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8">
        <p className="text-red-400">Failed to load global theme.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Global Theme</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Default appearance for all rooms. Individual rooms can override these settings.
          </p>
        </div>
        {savedMsg && (
          <span className="rounded-lg bg-emerald-900/40 px-3 py-1.5 text-sm text-emerald-400">
            ✓ Saved
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-900 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {draft && (
        <ThemeEditor
          value={draft}
          onChange={handleChange}
          onUploadImage={handleUploadImage}
          uploadingImage={uploadingImage}
          saving={saving}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
