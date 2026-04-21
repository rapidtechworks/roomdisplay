/**
 * ThemeEditor — reusable full theme editor.
 * Used by both ThemePage (global) and RoomThemePage (per-room override).
 *
 * Layout:
 *   1. Background   — always visible
 *   2. Logo         — always visible
 *   3. Advanced Settings — collapsible wrapper
 *        └ each sub-section inside is individually collapsible
 */
import { useState, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Theme } from '@roomdisplay/shared';

// ─── Always-open section (Background, Logo) ───────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900">
      <div className="border-b border-gray-800 px-5 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400">{title}</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">{children}</div>
    </div>
  );
}

// ─── Collapsible sub-section (used inside Advanced Settings) ──────────────────

function CollapseSection({ title, children, defaultOpen = false }: {
  title:        string;
  children:     ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3 rounded-xl border border-gray-700 bg-gray-800/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-semibold uppercase tracking-widest text-gray-400">
          {title}
        </span>
        <span className="text-gray-500 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-4 border-t border-gray-700 p-5 sm:grid-cols-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function Field({ label, children, wide = false }: {
  label:    string;
  children: ReactNode;
  wide?:    boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="mb-1 block text-xs text-gray-400">{label}</label>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange, wide = false }: {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
  wide?:    boolean;
}) {
  return (
    <Field label={label} wide={wide}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={toHex(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-gray-700 bg-transparent p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#ffffff or rgba(…)"
          className="input flex-1 font-mono text-xs"
        />
      </div>
    </Field>
  );
}

function TextField({ label, value, onChange, placeholder, wide = false }: {
  label:        string;
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  wide?:        boolean;
}) {
  return (
    <Field label={label} wide={wide}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input font-mono text-xs"
      />
    </Field>
  );
}

function SelectField<T extends string | number>({ label, value, onChange, options, wide = false }: {
  label:    string;
  value:    T;
  onChange: (v: T) => void;
  options:  { label: string; value: T }[];
  wide?:    boolean;
}) {
  return (
    <Field label={label} wide={wide}>
      <select
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange((typeof value === 'number' ? Number(raw) : raw) as T);
        }}
        className="input"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

function RangeField({ label, value, onChange, min, max, step, wide = false }: {
  label:    string;
  value:    number;
  onChange: (v: number) => void;
  min:      number;
  max:      number;
  step:     number;
  wide?:    boolean;
}) {
  return (
    <Field label={`${label} — ${value}`} wide={wide}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </Field>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toHex(val: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(val)) return val;
  if (/^#[0-9a-fA-F]{3}$/.test(val)) {
    const m = val.match(/^#(.)(.)(.)/);
    if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  }
  return '#000000';
}

// ─── Theme presets (colour/appearance only — never touches fonts or sizes) ─────

const COLOR_PRESET_DARK: Partial<Theme> = {
  backgroundColor:          '#0f172a',
  scrimColor:               '#000000',
  scrimOpacity:             0.25,
  glassPanelTint:           'rgba(255, 255, 255, 0.14)',
  glassPanelBorderColor:    'rgba(255, 255, 255, 0.2)',
  roomNameColor:            '#FFFFFF',
  roomNameTextShadow:       '0 2px 16px rgba(0,0,0,0.3)',
  clockColor:               '#FFFFFF',
  clockOpacity:             0.65,
  eventColor:               '#FFFFFF',
  accentColorAvailable:     '#34D399',
  accentColorBusy:          '#F87171',
  accentColorEndingSoon:    '#FBBF24',
  accentColorBookButton:    '#3B82F6',
  bookButtonTextColor:      '#FFFFFF',
  agendaDayHeaderColor:     'rgba(255, 255, 255, 0.85)',
  agendaEventColor:         'rgba(255, 255, 255, 0.95)',
  agendaMutedColor:         'rgba(255, 255, 255, 0.5)',
  agendaEventItemBackground:'rgba(255,255,255,0.07)',
  offlineBannerBackground:  'rgba(251, 191, 36, 0.92)',
  offlineBannerTextColor:   '#1F2937',
};

const COLOR_PRESET_LIGHT: Partial<Theme> = {
  backgroundColor:          '#F1F5F9',
  scrimColor:               '#FFFFFF',
  scrimOpacity:             0.45,
  glassPanelTint:           'rgba(0, 0, 0, 0.05)',
  glassPanelBorderColor:    'rgba(0, 0, 0, 0.12)',
  roomNameColor:            '#0F172A',
  roomNameTextShadow:       '0 1px 6px rgba(255,255,255,0.6)',
  clockColor:               '#334155',
  clockOpacity:             0.75,
  eventColor:               '#1E293B',
  accentColorAvailable:     '#059669',
  accentColorBusy:          '#DC2626',
  accentColorEndingSoon:    '#D97706',
  accentColorBookButton:    '#2563EB',
  bookButtonTextColor:      '#FFFFFF',
  agendaDayHeaderColor:     'rgba(15, 23, 42, 0.85)',
  agendaEventColor:         'rgba(15, 23, 42, 0.9)',
  agendaMutedColor:         'rgba(15, 23, 42, 0.5)',
  agendaEventItemBackground:'rgba(0, 0, 0, 0.05)',
  offlineBannerBackground:  'rgba(251, 191, 36, 0.92)',
  offlineBannerTextColor:   '#1F2937',
};

const WEIGHT_OPTIONS = [
  { label: 'Light (300)',      value: 300 },
  { label: 'Regular (400)',    value: 400 },
  { label: 'Medium (500)',     value: 500 },
  { label: 'SemiBold (600)',   value: 600 },
  { label: 'Bold (700)',       value: 700 },
  { label: 'ExtraBold (800)',  value: 800 },
];

// ─── Main component ───────────────────────────────────────────────────────────

export interface ThemeEditorProps {
  value:            Theme;
  onChange:         (updates: Partial<Theme>) => void;
  onUploadImage:    (file: File, target: 'background' | 'logo') => Promise<void>;
  uploadingImage:   boolean;
  uploadingLogo:    boolean;
  saving:           boolean;
  onSave:           () => void;
}

export function ThemeEditor({
  value, onChange, onUploadImage, uploadingImage, uploadingLogo, saving, onSave,
}: ThemeEditorProps) {
  const fileRef     = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const set = <K extends keyof Theme>(key: K, val: Theme[K]) =>
    onChange({ [key]: val } as Partial<Theme>);

  return (
    <div>

      {/* ══ 0. PRESETS ═══════════════════════════════════════════════════════════ */}
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Colour Presets
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChange(COLOR_PRESET_DARK)}
            className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 hover:border-indigo-500 hover:text-white transition-colors"
          >
            <span>🌙</span> Dark
          </button>
          <button
            type="button"
            onClick={() => onChange(COLOR_PRESET_LIGHT)}
            className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 hover:border-indigo-500 hover:text-white transition-colors"
          >
            <span>☀️</span> Light
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Applies colour defaults only — fonts, sizes, and logo are unchanged.
        </p>
      </div>

      {/* ══ 1. BACKGROUND ════════════════════════════════════════════════════════ */}
      <Section title="Background">
        <ColorField
          label="Solid background colour (no image)"
          value={value.backgroundColor}
          onChange={(v) => set('backgroundColor', v)}
          wide
        />

        <Field label="Background image — upload from computer" wide>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              disabled={uploadingImage}
              onClick={() => fileRef.current?.click()}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              {uploadingImage ? 'Uploading…' : 'Choose file…'}
            </button>
            {value.defaultBackgroundImagePath && (
              <span className="font-mono text-xs text-gray-400 truncate max-w-[200px]">
                {value.defaultBackgroundImagePath}
              </span>
            )}
            {value.defaultBackgroundImagePath && (
              <button
                type="button"
                onClick={() => set('defaultBackgroundImagePath', '')}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUploadImage(f, 'background');
                e.target.value = '';
              }}
            />
          </div>
        </Field>

        <TextField
          label="Background image — external URL (overrides upload)"
          value={value.backgroundImageUrl ?? ''}
          onChange={(v) => set('backgroundImageUrl', v || null)}
          placeholder="https://…"
          wide
        />

        {(value.backgroundImageUrl || value.defaultBackgroundImagePath) && (
          <Field label="Preview" wide>
            <img
              src={value.backgroundImageUrl ?? value.defaultBackgroundImagePath}
              alt="Background preview"
              className="h-24 w-full rounded-lg object-cover opacity-80"
            />
          </Field>
        )}

        <ColorField
          label="Image scrim colour"
          value={value.scrimColor}
          onChange={(v) => set('scrimColor', v)}
        />
        <RangeField
          label="Scrim opacity"
          value={value.scrimOpacity}
          onChange={(v) => set('scrimOpacity', v)}
          min={0} max={0.95} step={0.05}
        />
      </Section>

      {/* ══ 2. LOGO ══════════════════════════════════════════════════════════════ */}
      <Section title="Logo">
        <Field label="Logo image — upload from computer" wide>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              disabled={uploadingLogo}
              onClick={() => logoFileRef.current?.click()}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              {uploadingLogo ? 'Uploading…' : 'Choose file…'}
            </button>
            {value.logoImagePath && (
              <span className="font-mono text-xs text-gray-400 truncate max-w-[200px]">
                {value.logoImagePath}
              </span>
            )}
            {value.logoImagePath && (
              <button
                type="button"
                onClick={() => set('logoImagePath', null)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            )}
            <input
              ref={logoFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUploadImage(f, 'logo');
                e.target.value = '';
              }}
            />
          </div>
        </Field>

        <TextField
          label="Logo image — external URL (overrides upload)"
          value={value.logoImageUrl ?? ''}
          onChange={(v) => set('logoImageUrl', v || null)}
          placeholder="https://…"
          wide
        />

        {(value.logoImageUrl || value.logoImagePath) && (
          <Field label="Preview" wide>
            <img
              src={value.logoImageUrl ?? value.logoImagePath ?? ''}
              alt="Logo preview"
              className="h-16 rounded-lg object-contain bg-gray-800 p-2"
            />
          </Field>
        )}

        <SelectField
          label="Position"
          value={value.logoPosition}
          onChange={(v) => set('logoPosition', v)}
          options={[
            { label: 'None (hidden)',          value: 'none' },
            { label: 'Beside Book Now button', value: 'beside-book-now' },
            { label: 'Top left corner',        value: 'top-left' },
            { label: 'Top right corner',       value: 'top-right' },
            { label: 'Bottom left corner',     value: 'bottom-left' },
            { label: 'Bottom right corner',    value: 'bottom-right' },
          ]}
        />

        <TextField
          label="Max height (CSS)"
          value={value.logoMaxHeight}
          onChange={(v) => set('logoMaxHeight', v)}
          placeholder="80px"
        />
      </Section>

      {/* ══ 3. ADVANCED SETTINGS ═════════════════════════════════════════════════ */}
      <div className="mb-6 rounded-xl border border-gray-700 bg-gray-900/50">

        {/* Advanced toggle header */}
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div>
            <span className="text-sm font-semibold text-gray-300">Advanced Settings</span>
            <span className="ml-3 text-xs text-gray-600">
              Typography · Colours · Agenda panel · Offline banner
            </span>
          </div>
          <span
            className="text-gray-500 transition-transform duration-200"
            style={{ transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ▾
          </span>
        </button>

        {advancedOpen && (
          <div className="border-t border-gray-700 px-5 pb-5 pt-4">

            {/* Status colours */}
            <CollapseSection title="Status Colours">
              <ColorField
                label="Available"
                value={value.accentColorAvailable}
                onChange={(v) => set('accentColorAvailable', v)}
              />
              <ColorField
                label="In Use / Busy"
                value={value.accentColorBusy}
                onChange={(v) => set('accentColorBusy', v)}
              />
              <ColorField
                label="Ending Soon"
                value={value.accentColorEndingSoon}
                onChange={(v) => set('accentColorEndingSoon', v)}
              />
            </CollapseSection>

            {/* Room name */}
            <CollapseSection title="Room Name Typography">
              <TextField
                label="Font family"
                value={value.roomNameFontFamily}
                onChange={(v) => set('roomNameFontFamily', v)}
                placeholder="'Inter', system-ui, sans-serif"
                wide
              />
              <TextField
                label="Font size (CSS)"
                value={value.roomNameFontSize}
                onChange={(v) => set('roomNameFontSize', v)}
                placeholder="96px"
              />
              <SelectField
                label="Font weight"
                value={value.roomNameFontWeight}
                onChange={(v) => set('roomNameFontWeight', v)}
                options={WEIGHT_OPTIONS}
              />
              <ColorField
                label="Colour"
                value={value.roomNameColor}
                onChange={(v) => set('roomNameColor', v)}
              />
              <TextField
                label="Text shadow (CSS)"
                value={value.roomNameTextShadow}
                onChange={(v) => set('roomNameTextShadow', v)}
                placeholder="0 2px 16px rgba(0,0,0,0.3)"
                wide
              />
            </CollapseSection>

            {/* Clock */}
            <CollapseSection title="Clock Typography">
              <TextField
                label="Font family"
                value={value.clockFontFamily}
                onChange={(v) => set('clockFontFamily', v)}
                placeholder="'Inter', system-ui, sans-serif"
                wide
              />
              <TextField
                label="Font size (CSS)"
                value={value.clockFontSize}
                onChange={(v) => set('clockFontSize', v)}
                placeholder="clamp(20px, 2.5vw, 36px)"
              />
              <ColorField
                label="Colour"
                value={value.clockColor}
                onChange={(v) => set('clockColor', v)}
              />
              <RangeField
                label="Opacity"
                value={value.clockOpacity}
                onChange={(v) => set('clockOpacity', v)}
                min={0} max={1} step={0.05}
              />
            </CollapseSection>

            {/* Status word */}
            <CollapseSection title="Status Word Typography">
              <TextField
                label="Font size (CSS)"
                value={value.statusFontSize}
                onChange={(v) => set('statusFontSize', v)}
                placeholder="120px"
              />
              <SelectField
                label="Font weight"
                value={value.statusFontWeight}
                onChange={(v) => set('statusFontWeight', v)}
                options={WEIGHT_OPTIONS}
              />
            </CollapseSection>

            {/* Current event */}
            <CollapseSection title="Current Event Typography">
              <TextField
                label="Font family"
                value={value.eventFontFamily}
                onChange={(v) => set('eventFontFamily', v)}
                placeholder="'Inter', system-ui, sans-serif"
                wide
              />
              <TextField
                label="Font size (CSS)"
                value={value.eventFontSize}
                onChange={(v) => set('eventFontSize', v)}
                placeholder="88px"
              />
              <SelectField
                label="Font weight"
                value={value.eventFontWeight}
                onChange={(v) => set('eventFontWeight', v)}
                options={WEIGHT_OPTIONS}
              />
              <ColorField
                label="Colour"
                value={value.eventColor}
                onChange={(v) => set('eventColor', v)}
              />
            </CollapseSection>

            {/* Book Now button */}
            <CollapseSection title="Book Now Button">
              <ColorField
                label="Button colour"
                value={value.accentColorBookButton}
                onChange={(v) => set('accentColorBookButton', v)}
              />
              <ColorField
                label="Text colour"
                value={value.bookButtonTextColor}
                onChange={(v) => set('bookButtonTextColor', v)}
              />
              <TextField
                label="Font size (CSS)"
                value={value.bookButtonFontSize}
                onChange={(v) => set('bookButtonFontSize', v)}
                placeholder="clamp(18px, 2.2vw, 28px)"
              />
              <TextField
                label="Border radius (CSS)"
                value={value.buttonBorderRadius}
                onChange={(v) => set('buttonBorderRadius', v)}
                placeholder="16px"
              />
            </CollapseSection>

            {/* Agenda panel */}
            <CollapseSection title="Agenda Panel">
              <ColorField
                label="Panel background (glass tint)"
                value={value.glassPanelTint}
                onChange={(v) => set('glassPanelTint', v)}
                wide
              />
              <RangeField
                label="Backdrop blur (px)"
                value={value.glassPanelBlur}
                onChange={(v) => set('glassPanelBlur', v)}
                min={0} max={60} step={2}
              />
              <ColorField
                label="Panel border colour"
                value={value.glassPanelBorderColor}
                onChange={(v) => set('glassPanelBorderColor', v)}
                wide
              />
              <ColorField
                label="Day header text colour"
                value={value.agendaDayHeaderColor}
                onChange={(v) => set('agendaDayHeaderColor', v)}
              />
              <ColorField
                label="Event text colour"
                value={value.agendaEventColor}
                onChange={(v) => set('agendaEventColor', v)}
              />
              <ColorField
                label="Muted / secondary text colour"
                value={value.agendaMutedColor}
                onChange={(v) => set('agendaMutedColor', v)}
              />
              <ColorField
                label="Event card background"
                value={value.agendaEventItemBackground}
                onChange={(v) => set('agendaEventItemBackground', v)}
                wide
              />
              <TextField
                label="Chip border radius (CSS)"
                value={value.chipBorderRadius}
                onChange={(v) => set('chipBorderRadius', v)}
                placeholder="16px"
              />
            </CollapseSection>

            {/* Offline banner */}
            <CollapseSection title="Offline Banner">
              <ColorField
                label="Background"
                value={value.offlineBannerBackground}
                onChange={(v) => set('offlineBannerBackground', v)}
              />
              <ColorField
                label="Text colour"
                value={value.offlineBannerTextColor}
                onChange={(v) => set('offlineBannerTextColor', v)}
              />
            </CollapseSection>

          </div>
        )}
      </div>

      {/* ── Save ─────────────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 flex justify-end border-t border-gray-800 bg-gray-950 py-4">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="btn-primary px-8 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

    </div>
  );
}
