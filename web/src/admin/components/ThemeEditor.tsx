/**
 * ThemeEditor — reusable full theme editor.
 * Used by both ThemePage (global) and RoomThemePage (per-room override).
 */
import { useRef } from 'react';
import type { ReactNode } from 'react';
import type { Theme } from '@roomdisplay/shared';

// ─── Field helpers ────────────────────────────────────────────────────────────

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

function Field({ label, children, wide = false }: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="mb-1 block text-xs text-gray-400">{label}</label>
      {children}
    </div>
  );
}

/** Colour picker: native swatch + hex text input side-by-side */
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

/** Plain text input (used for CSS values like "96px", "clamp(…)", font names) */
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

/** Numeric input */
function NumberField({ label, value, onChange, min, max, step, wide = false }: {
  label:    string;
  value:    number;
  onChange: (v: number) => void;
  min?:     number;
  max?:     number;
  step?:    number;
  wide?:    boolean;
}) {
  return (
    <Field label={label} wide={wide}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input"
      />
    </Field>
  );
}

/** Select dropdown */
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

/** Range slider + current value display */
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

/**
 * Try to convert any CSS colour string to a 6-digit hex for <input type="color">.
 * Falls back to #000000 for complex values like rgba(…) that the browser picker can't handle.
 */
function toHex(val: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(val)) return val;
  if (/^#[0-9a-fA-F]{3}$/.test(val)) {
    const m = val.match(/^#(.)(.)(.)/);
    if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  }
  // rgba/named/clamp — can't feed to colour picker; return safe black
  return '#000000';
}

const WEIGHT_OPTIONS = [
  { label: 'Light (300)',    value: 300 },
  { label: 'Regular (400)',  value: 400 },
  { label: 'Medium (500)',   value: 500 },
  { label: 'SemiBold (600)', value: 600 },
  { label: 'Bold (700)',     value: 700 },
  { label: 'ExtraBold (800)', value: 800 },
];

// ─── Main component ───────────────────────────────────────────────────────────

export interface ThemeEditorProps {
  value:           Theme;
  onChange:        (updates: Partial<Theme>) => void;
  onUploadImage:   (file: File) => Promise<void>;
  uploadingImage:  boolean;
  saving:          boolean;
  onSave:          () => void;
}

export function ThemeEditor({
  value, onChange, onUploadImage, uploadingImage, saving, onSave,
}: ThemeEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Theme>(key: K, val: Theme[K]) => onChange({ [key]: val } as Partial<Theme>);

  return (
    <div>

      {/* ── Background ──────────────────────────────────────────────────────── */}
      <Section title="Background">
        <ColorField
          label="Solid background colour (no image)"
          value={value.backgroundColor}
          onChange={(v) => set('backgroundColor', v)}
          wide
        />

        {/* Upload */}
        <Field label="Background image — upload from computer" wide>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={uploadingImage}
              onClick={() => fileRef.current?.click()}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              {uploadingImage ? 'Uploading…' : 'Choose file…'}
            </button>
            {value.defaultBackgroundImagePath && (
              <span className="font-mono text-xs text-gray-400 truncate max-w-[220px]">
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
                if (f) void onUploadImage(f);
                e.target.value = '';
              }}
            />
          </div>
        </Field>

        {/* URL */}
        <TextField
          label="Background image — external URL (overrides upload)"
          value={value.backgroundImageUrl ?? ''}
          onChange={(v) => set('backgroundImageUrl', v || null)}
          placeholder="https://…"
          wide
        />

        {/* Preview thumbnail */}
        {(value.backgroundImageUrl || value.defaultBackgroundImagePath) && (
          <Field label="Preview" wide>
            <img
              src={value.backgroundImageUrl ?? value.defaultBackgroundImagePath}
              alt="Background preview"
              className="h-24 w-full rounded-lg object-cover opacity-80"
            />
          </Field>
        )}

        <TextField
          label="Overlay gradient (CSS)"
          value={value.backgroundOverlayGradient}
          onChange={(v) => set('backgroundOverlayGradient', v)}
          placeholder="linear-gradient(…)"
          wide
        />
      </Section>

      {/* ── Status colours ──────────────────────────────────────────────────── */}
      <Section title="Status Colours">
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
      </Section>

      {/* ── Room name ───────────────────────────────────────────────────────── */}
      <Section title="Room Name Typography">
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
      </Section>

      {/* ── Clock ───────────────────────────────────────────────────────────── */}
      <Section title="Clock Typography">
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
      </Section>

      {/* ── Status word ─────────────────────────────────────────────────────── */}
      <Section title="Status Word Typography">
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
      </Section>

      {/* ── Current event ───────────────────────────────────────────────────── */}
      <Section title="Current Event Typography">
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
      </Section>

      {/* ── Book Now button ──────────────────────────────────────────────────── */}
      <Section title="Book Now Button">
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
      </Section>

      {/* ── Agenda panel ────────────────────────────────────────────────────── */}
      <Section title="Agenda Panel">
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
      </Section>

      {/* ── Offline banner ───────────────────────────────────────────────────── */}
      <Section title="Offline Banner">
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
      </Section>

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
