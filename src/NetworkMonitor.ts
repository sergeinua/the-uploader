export class NetworkMonitor {
  private onOnline: () => void;
  private onOffline: () => void;
  private isRunning = false;

  constructor(
    onOnline: () => void,
    onOffline: () => void
  ) {
    this.onOnline = onOnline;
    this.onOffline = onOffline;
  }

  start(): void {
    if (this.isRunning) return;
    if (typeof window === 'undefined' || typeof window.addEventListener === 'undefined') {
      return;
    }
    
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    this.isRunning = true;
  }

  stop(): void {
    if (!this.isRunning) return;
    if (typeof window === 'undefined' || typeof window.removeEventListener === 'undefined') {
      return;
    }
    
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.isRunning = false;
  }

  isOnline(): boolean {
    if (typeof navigator === 'undefined') {
      return true; // Assume online in Node.js
    }
    return navigator.onLine;
  }

  private handleOnline = () => {
    this.onOnline();
  };

  private handleOffline = () => {
    this.onOffline();
  };
}
