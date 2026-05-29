import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  context?: string; // e.g. "admin" or "display" — shown in the error UI
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.context ?? 'app'}]`, error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isDisplay = this.props.context === 'display';

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-950 p-8">
        <div className="max-w-lg text-center">
          {isDisplay ? (
            <>
              <p className="text-2xl font-semibold text-white">Display Error</p>
              <p className="mt-2 text-gray-400">
                Something went wrong. The display will retry automatically.
              </p>
              <button
                onClick={() => this.setState({ error: null })}
                className="mt-6 rounded-lg bg-white/10 px-6 py-3 text-sm text-white hover:bg-white/20"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold text-white">Something went wrong</p>
              <p className="mt-2 text-sm text-gray-400">{error.message}</p>
              <button
                onClick={() => this.setState({ error: null })}
                className="mt-6 rounded-lg bg-white/10 px-6 py-3 text-sm text-white hover:bg-white/20"
              >
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    );
  }
}
