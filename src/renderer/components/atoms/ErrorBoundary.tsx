import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /**
   * Optional fallback override. If omitted, the default recovery panel is shown.
   * Receives the captured error so callers can render rich error details.
   */
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Top-level error boundary. Captures rendering errors, forwards them to the
 * main-process logger via the `window.vizcloud` bridge (when present), and
 * presents a recovery UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Forward to main process when the IPC bridge is available.
    // Falls back silently in environments where the bridge isn't loaded
    // (e.g. component tests).
    const bridge = (window as unknown as { vizcloud?: { log?: { error?: (msg: string, data?: unknown) => void } } }).vizcloud;
    if (bridge?.log?.error) {
      try {
        bridge.log.error('renderer:uncaught', {
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        });
        return;
      } catch {
        // fall through to console
      }
    }
     
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  private readonly retry = (): void => {
    this.setState({ hasError: false, error: undefined });
  };

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    const error = this.state.error ?? new Error('Unknown error');
    if (this.props.fallback) {
      return this.props.fallback(error, this.retry);
    }
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background p-6"
        role="alert"
        aria-live="assertive"
      >
        <div className="max-w-md w-full bg-page border border-error rounded-xl p-8 text-center">
          <div className="mb-4">
            <svg
              className="w-16 h-16 text-error mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h1>
          <p className="text-muted mb-6">
            An unexpected error occurred. You can try to recover the view, or reload the application.
          </p>
          <details className="text-left mb-6">
            <summary className="cursor-pointer text-sm text-muted hover:text-foreground mb-2">
              Error details
            </summary>
            <pre className="text-xs text-error bg-error/10 p-4 rounded overflow-auto whitespace-pre-wrap break-words">
              {error.stack ?? error.message}
            </pre>
          </details>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={this.retry}
              className="px-5 py-2.5 bg-page border border-border text-foreground rounded-lg hover:bg-sidebar-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={(): void => {
                window.location.reload();
              }}
              className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Reload application"
            >
              Reload Application
            </button>
          </div>
        </div>
      </div>
    );
  }
}
