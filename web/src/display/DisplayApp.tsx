import { useParams } from 'react-router-dom';
import { RoomDisplay } from './RoomDisplay.tsx';

export function DisplayApp() {
  const { slug } = useParams<{ slug: string }>();

  if (!slug) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="text-center">
          <p className="text-xl text-gray-300">No room selected.</p>
          <p className="mt-2 text-sm text-gray-500">
            Navigate to <code className="text-gray-400">/display/[room-slug]</code>
          </p>
        </div>
      </div>
    );
  }

  return <RoomDisplay slug={slug} />;
}
