import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkMonitor } from '../src/NetworkMonitor';

describe('NetworkMonitor', () => {
  let onOnline: vi.Mock;
  let onOffline: vi.Mock;
  let monitor: NetworkMonitor;

  beforeEach(() => {
    onOnline = vi.fn();
    onOffline = vi.fn();
    monitor = new NetworkMonitor(onOnline, onOffline);
  });

  afterEach(() => {
    monitor.stop();
  });

  it('creates NetworkMonitor instance', () => {
    expect(monitor).toBeDefined();
  });

  it('start() adds event listeners', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    monitor.start();

    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    expect(monitor['isRunning']).toBe(true);

    addEventListenerSpy.mockRestore();
  });

  it('stop() removes event listeners', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    monitor.start();
    monitor.stop();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    expect(monitor['isRunning']).toBe(false);

    removeEventListenerSpy.mockRestore();
  });

  it('isOnline() returns true when navigator is undefined', () => {
    const originalNavigator = global.navigator;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).navigator;

    expect(monitor.isOnline()).toBe(true);

    global.navigator = originalNavigator;
  });

  it('triggers onOnline callback when online event fires', () => {
    monitor.start();

    // Simulate online event
    window.dispatchEvent(new Event('online'));

    expect(onOnline).toHaveBeenCalledTimes(1);
  });

  it('triggers onOffline callback when offline event fires', () => {
    monitor.start();

    // Simulate offline event
    window.dispatchEvent(new Event('offline'));

    expect(onOffline).toHaveBeenCalledTimes(1);
  });

  it('does not add duplicate listeners when start() called multiple times', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    monitor.start();
    monitor.start();
    monitor.start();

    // Should only be called once
    expect(addEventListenerSpy).toHaveBeenCalledTimes(2); // online and offline

    addEventListenerSpy.mockRestore();
  });

  it('handles stop() when not running', () => {
    // Should not throw
    expect(() => monitor.stop()).not.toThrow();
  });
});
