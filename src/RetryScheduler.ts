function buildRetryDelays(
  maxRetries: number,
  baseDelay: number,
  maxDelay: number,
  jitter: boolean
): number[] {
  const delays: number[] = [];
  
  for (let i = 0; i < maxRetries; i++) {
    let delay = Math.min(baseDelay * Math.pow(2, i), maxDelay);
    
    if (jitter) {
      // Random factor between 0.75 and 1.25
      const factor = 0.75 + Math.random() * 0.5;
      delay = delay * factor;
    }
    
    delays.push(Math.round(delay));
  }
  
  return delays;
}

async function waitForOnline(): Promise<void> {
  if (typeof window === 'undefined' || typeof window.addEventListener === 'undefined') {
    // Node.js - resolve immediately
    return;
  }
  
  if (navigator.onLine) {
    return;
  }
  
  return new Promise<void>((resolve) => {
    const handler = () => {
      window.removeEventListener('online', handler);
      resolve();
    };
    window.addEventListener('online', handler, { once: true });
  });
}

export { buildRetryDelays, waitForOnline };
