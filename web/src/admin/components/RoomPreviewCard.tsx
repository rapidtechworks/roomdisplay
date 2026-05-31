import type { Room, Tablet } from '../api.ts';

// Iframe is rendered at 1280×720 then scaled to 384×216 (scale = 0.3)
const IFRAME_W = 1280;
const IFRAME_H = 720;
const SCALE    = 0.3;
const CARD_W   = IFRAME_W * SCALE; // 384
const CARD_H   = IFRAME_H * SCALE; // 216

interface Props {
  room:    Room;
  tablets: Tablet[];
  onClick: () => void;
}

export function RoomPreviewCard({ room, tablets, onClick }: Props) {
  const activeTablet = tablets.find(
    (t) => t.currentSlug === room.slug && t.online,
  );
  const assignedTablet = tablets.find(
    (t) => t.assignedRoomId === room.id,
  );
  const isOnline     = !!activeTablet;
  // A room "has a device" if something is actively displaying it OR if a
  // tablet has been administratively assigned to it.
  const hasAnyTablet = isOnline || !!assignedTablet;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-[20px]"
    >
      {/* Tablet body — thin metallic silver shell */}
      <div
        className="rounded-[20px] p-[2px] shadow-xl shadow-black/60 transition-shadow group-hover:shadow-indigo-950/60"
        style={{
          background: 'linear-gradient(145deg, #d4d8de 0%, #a8adb5 40%, #8e9299 100%)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.25) inset, 0 20px 40px rgba(0,0,0,0.55)',
        }}
      >
        {/* Bezel — dark surround inside the silver body */}
        <div className="rounded-[18px] bg-gray-950 p-[8px] overflow-hidden">

          {/* Screen area */}
          <div
            className="relative rounded-[6px]"
            style={{ width: CARD_W, height: CARD_H, overflow: 'hidden', clipPath: 'inset(0px round 6px)' }}
          >
            <iframe
              src={`/display/${room.slug}?preview=1`}
              title={room.displayName}
              tabIndex={-1}
              className="absolute top-0 left-0 border-none pointer-events-none select-none"
              style={{
                width:           IFRAME_W,
                height:          IFRAME_H,
                transform:       `scale(${SCALE})`,
                transformOrigin: 'top left',
              }}
            />

            {/* Dim overlay when no tablet is actively displaying this room */}
            {!isOnline && (
              <div className="absolute inset-0 bg-gray-950/50" />
            )}

            {/* Hover drill-in hint */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <span className="rounded-lg bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                Edit Room →
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* Room label row */}
      <div className="mt-2.5 flex w-full items-center gap-2 px-0.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            isOnline
              ? 'bg-emerald-400'
              : hasAnyTablet
                ? 'bg-gray-600'
                : 'bg-gray-700'
          }`}
        />

        <span className="flex-1 truncate text-sm font-medium text-white">
          {room.displayName}
        </span>

        {isOnline && (
          <span className="shrink-0 text-xs text-emerald-400">Live</span>
        )}
        {!isOnline && hasAnyTablet && (
          <span className="shrink-0 text-xs text-gray-500">Offline</span>
        )}
        {!hasAnyTablet && (
          <span className="shrink-0 text-xs text-gray-600">No device</span>
        )}
      </div>
    </button>
  );
}
