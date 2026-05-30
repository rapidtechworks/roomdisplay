import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api.ts';
import type { Theme } from '../api.ts';
import { ThemeEditor } from '../components/ThemeEditor.tsx';

export function ThemeGroupThemePage() {
  const { id }    = useParams<{ id: string }>();
  const groupId   = Number(id);
  const qc        = useQueryClient();

  const { data: group } = useQuery({
    queryKey: ['theme-group', groupId],
    queryFn:  () => api.getThemeGroup(groupId),
  });

  const { data: themeData, isLoading, isError } = useQuery({
    queryKey: ['theme-group-theme', groupId],
    queryFn:  () => api.getThemeGroupTheme(groupId),
    enabled:  !!groupId,
  });

  const [draft,          setDraft]          = useState<Theme | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingLogo,  setUploadingLogo]  = useState(false);
  const [savedMsg,       setSavedMsg]       = useState(false);
  const [enabling,       setEnabling]       = useState(false);
  const [disabling,      setDisabling]      = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  useEffect(() => {
    if (themeData) setDraft(themeData.settings);
  }, [themeData]);

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
      await api.updateThemeGroupTheme(groupId, draft);
      await qc.invalidateQueries({ queryKey: ['theme-group-theme', groupId] });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleEnable = async () => {
    setEnabling(true);
    setError(null);
    try {
      const result = await api.enableThemeGroupTheme(groupId);
      setDraft(result.settings);
      await qc.invalidateQueries({ queryKey: ['theme-group-theme', groupId] });
      await qc.invalidateQueries({ queryKey: ['theme-group', groupId] });
      await qc.invalidateQueries({ queryKey: ['theme-groups'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to enable custom theme.');
    } finally {
      setEnabling(false);
    }
  };

  const handleDisable = async () => {
    if (!confirm('Remove this group\'s custom theme? Rooms will inherit the global theme.')) return;
    setDisabling(true);
    setError(null);
    try {
      await api.disableThemeGroupTheme(groupId);
      await qc.invalidateQueries({ queryKey: ['theme-group-theme', groupId] });
      await qc.invalidateQueries({ queryKey: ['theme-group', groupId] });
      await qc.invalidateQueries({ queryKey: ['theme-groups'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove custom theme.');
    } finally {
      setDisabling(false);
    }
  };

  if (isLoading) return <div className="p-8"><p className="text-gray-400">Loading theme…</p></div>;
  if (isError || !themeData) return <div className="p-8"><p className="text-red-400">Failed to load theme.</p></div>;

  const groupName = group?.name ?? `Group ${groupId}`;

  return (
    <div className="max-w-3xl p-8">
      <Link
        to={`/admin/groups/${groupId}`}
        className="mb-4 inline-block text-sm text-indigo-400 hover:text-indigo-300"
      >
        ← {groupName}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{groupName} — Theme</h1>
          {themeData.usingGlobal ? (
            <p className="mt-0.5 text-sm text-gray-500">
              Currently using the{' '}
              <Link to="/admin/theme" className="text-indigo-400 hover:underline">global theme</Link>.
              Enable a custom theme to override it for all rooms in this group.
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-emerald-500">Custom theme active for this group.</p>
          )}
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

      {themeData.usingGlobal && (
        <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
          <p className="mb-3 text-sm text-gray-300">
            Enable a custom theme to give all rooms in{' '}
            <strong className="text-white">{groupName}</strong> a shared look —
            independent of the global theme, overridable per-room.
          </p>
          <button
            onClick={handleEnable}
            disabled={enabling}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {enabling ? 'Enabling…' : 'Enable custom theme for this group'}
          </button>
        </div>
      )}

      {!themeData.usingGlobal && draft && (
        <>
          <ThemeEditor
            value={draft}
            onChange={handleChange}
            onUploadImage={handleUploadImage}
            uploadingImage={uploadingImage}
            uploadingLogo={uploadingLogo}
            saving={saving}
            onSave={handleSave}
          />

          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/20 p-5">
            <h3 className="mb-2 font-semibold text-red-400">Revert to global theme</h3>
            <p className="mb-4 text-sm text-gray-400">
              Removes this group's custom theme. All rooms in the group will inherit the global
              theme (unless they have their own override).
            </p>
            <button
              onClick={handleDisable}
              disabled={disabling}
              className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 hover:bg-red-900/30 disabled:opacity-50 transition-colors"
            >
              {disabling ? 'Reverting…' : 'Remove custom theme'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
