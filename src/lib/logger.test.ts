import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logOnce, warnOnce, logWithTimestamp, Logger, clearLoggedMessages } from '@/lib/logger';

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearLoggedMessages();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- logOnce ---
  describe('logOnce', () => {
    it('should output on first call', () => {
      logOnce('TestTag', 'hello');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('[TestTag] hello', '');
    });

    it('should not output on duplicate call with same tag and message', () => {
      logOnce('TestTag', 'hello');
      logSpy.mockClear();
      logOnce('TestTag', 'hello');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should output with data argument', () => {
      const data = { key: 'value' };
      logOnce('TestTag', 'hello', data);
      expect(logSpy).toHaveBeenCalledWith('[TestTag] hello', data);
    });

    it('should not output in production environment', () => {
      vi.stubEnv('NODE_ENV', 'production');
      logOnce('TestTag', 'hello');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should treat different tags with same message as different messages', () => {
      logOnce('TagA', 'hello');
      logSpy.mockClear();
      logOnce('TagB', 'hello');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('[TagB] hello', '');
    });

    it('should treat same tag with different message as different messages', () => {
      logOnce('TestTag', 'msg1');
      logSpy.mockClear();
      logOnce('TestTag', 'msg2');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('[TestTag] msg2', '');
    });
  });

  // --- warnOnce ---
  describe('warnOnce', () => {
    it('should output on first call', () => {
      warnOnce('TestTag', 'warning');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith('[TestTag] warning', '');
    });

    it('should not output on duplicate call with same tag and message', () => {
      warnOnce('TestTag', 'warning');
      warnSpy.mockClear();
      warnOnce('TestTag', 'warning');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should output with data argument', () => {
      const data = { key: 'value' };
      warnOnce('TestTag', 'warning', data);
      expect(warnSpy).toHaveBeenCalledWith('[TestTag] warning', data);
    });

    it('should not output in production environment', () => {
      vi.stubEnv('NODE_ENV', 'production');
      warnOnce('TestTag', 'warning');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  // --- logOnce and warnOnce share loggedMessages Set ---
  describe('logOnce and warnOnce shared Set', () => {
    it('should not output warnOnce if logOnce was already called with same tag+message', () => {
      logOnce('Shared', 'dup');
      warnSpy.mockClear();
      warnOnce('Shared', 'dup');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should not output logOnce if warnOnce was already called with same tag+message', () => {
      warnOnce('Shared', 'dup');
      logSpy.mockClear();
      logOnce('Shared', 'dup');
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  // --- clearLoggedMessages ---
  describe('clearLoggedMessages', () => {
    it('should allow duplicate tag+message after clearing', () => {
      logOnce('TestTag', 'hello');
      logSpy.mockClear();

      clearLoggedMessages();
      logOnce('TestTag', 'hello');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('[TestTag] hello', '');
    });
  });

  // --- logWithTimestamp ---
  describe('logWithTimestamp', () => {
    it('should output with a timestamp in the message', () => {
      logWithTimestamp('TestTag', 'event');
      expect(logSpy).toHaveBeenCalledTimes(1);
      const call = logSpy.mock.calls[0];
      expect(call[0]).toContain('[TestTag]');
      expect(call[0]).toContain('event');
      // Check that there's a timestamp-like substring
      expect(call[0]).toMatch(/\d{4}/);
    });

    it('should not output in production environment', () => {
      vi.stubEnv('NODE_ENV', 'production');
      logWithTimestamp('TestTag', 'event');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should output with data argument', () => {
      const data = { info: 42 };
      logWithTimestamp('TestTag', 'event', data);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[TestTag]'), data);
    });
  });

  // --- Logger class ---
  describe('Logger', () => {
    it('info should output in non-production', () => {
      Logger.info('hello');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('hello', '');
    });

    it('info should not output in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      Logger.info('hello');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('warn should output in non-production', () => {
      Logger.warn('caution');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith('caution', '');
    });

    it('warn should not output in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      Logger.warn('caution');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('error should always output regardless of NODE_ENV', () => {
      Logger.error('oops');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('oops', '');
    });

    it('error should output even in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      Logger.error('oops');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('oops', '');
    });

    it('debug should output in non-production', () => {
      Logger.debug('trace');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('[DEBUG]', 'trace', '');
    });

    it('debug should not output in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      Logger.debug('trace');
      expect(logSpy).not.toHaveBeenCalled();
    });
  });
});
