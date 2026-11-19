import { describe, it, expect, vi, beforeEach } from 'vitest';

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'ANTHROPIC_API_KEY',
  'KAPSO_API_KEY',
  'KAPSO_WEBHOOK_SECRET',
];

const VALID_ENV = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_KEY: 'test-key',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  KAPSO_API_KEY: 'kapso-test',
  KAPSO_WEBHOOK_SECRET: 'webhook-secret',
};

const BANK_EMAIL_VARS = [
  'INBOUND_EMAIL_SECRET',
  'KAPSO_PHONE_NUMBER_ID',
  'BANK_EMAIL_USER_PHONE',
];

function loadConfig() {
  // Reset module cache so config.ts re-evaluates on each import
  vi.resetModules();
  return import('../../src/config.js');
}

describe('config', () => {
  beforeEach(() => {
    // Clear all env vars before each test
    for (const key of [...REQUIRED_VARS, 'PORT', ...BANK_EMAIL_VARS]) {
      delete process.env[key];
    }
  });

  describe('required env vars', () => {
    for (const varName of REQUIRED_VARS) {
      it(`throws when ${varName} is missing`, async () => {
        // Set all vars except the one being tested
        for (const key of REQUIRED_VARS) {
          if (key !== varName) {
            process.env[key] = VALID_ENV[key as keyof typeof VALID_ENV];
          }
        }

        await expect(loadConfig()).rejects.toThrow(varName);
      });
    }

    it('does not throw when all required vars are set', async () => {
      for (const key of REQUIRED_VARS) {
        process.env[key] = VALID_ENV[key as keyof typeof VALID_ENV];
      }

      const config = await loadConfig();
      expect(config.SUPABASE_URL).toBe(VALID_ENV.SUPABASE_URL);
      expect(config.SUPABASE_KEY).toBe(VALID_ENV.SUPABASE_KEY);
      expect(config.ANTHROPIC_API_KEY).toBe(VALID_ENV.ANTHROPIC_API_KEY);
      expect(config.KAPSO_API_KEY).toBe(VALID_ENV.KAPSO_API_KEY);
      expect(config.KAPSO_WEBHOOK_SECRET).toBe(VALID_ENV.KAPSO_WEBHOOK_SECRET);
    });
  });

  describe('PORT default', () => {
    it('defaults to 3000 when PORT is not set', async () => {
      for (const key of REQUIRED_VARS) {
        process.env[key] = VALID_ENV[key as keyof typeof VALID_ENV];
      }

      const config = await loadConfig();
      expect(config.PORT).toBe(3000);
    });

    it('uses PORT from env when set', async () => {
      for (const key of REQUIRED_VARS) {
        process.env[key] = VALID_ENV[key as keyof typeof VALID_ENV];
      }
      process.env.PORT = '8080';

      const config = await loadConfig();
      expect(config.PORT).toBe(8080);
    });
  });

  describe('bank-email env vars (optional)', () => {
    for (const varName of BANK_EMAIL_VARS) {
      it(`boots and leaves ${varName} undefined when unset`, async () => {
        for (const key of REQUIRED_VARS) {
          process.env[key] = VALID_ENV[key as keyof typeof VALID_ENV];
        }

        const config = await loadConfig();
        expect(config[varName as keyof typeof config]).toBeUndefined();
      });

      it(`treats an empty ${varName} as unset`, async () => {
        for (const key of REQUIRED_VARS) {
          process.env[key] = VALID_ENV[key as keyof typeof VALID_ENV];
        }
        process.env[varName] = '';

        const config = await loadConfig();
        expect(config[varName as keyof typeof config]).toBeUndefined();
      });

      it(`reads ${varName} from env when set`, async () => {
        for (const key of REQUIRED_VARS) {
          process.env[key] = VALID_ENV[key as keyof typeof VALID_ENV];
        }
        process.env[varName] = 'some-value';

        const config = await loadConfig();
        expect(config[varName as keyof typeof config]).toBe('some-value');
      });
    }
  });

  describe('constants', () => {
    it('exports correct confidence thresholds', async () => {
      for (const key of REQUIRED_VARS) {
        process.env[key] = VALID_ENV[key as keyof typeof VALID_ENV];
      }

      const config = await loadConfig();
      expect(config.CONFIDENCE_AUTO_LOG).toBe(0.85);
      expect(config.CONFIDENCE_CONFIRM).toBe(0.6);
    });

    it('exports correct state TTL', async () => {
      for (const key of REQUIRED_VARS) {
        process.env[key] = VALID_ENV[key as keyof typeof VALID_ENV];
      }

      const config = await loadConfig();
      expect(config.STATE_TTL_MS).toBe(300_000);
    });

    it('exports correct defaults', async () => {
      for (const key of REQUIRED_VARS) {
        process.env[key] = VALID_ENV[key as keyof typeof VALID_ENV];
      }

      const config = await loadConfig();
      expect(config.DEFAULT_TIMEZONE).toBe('America/Lima');
      expect(config.DEFAULT_CURRENCY).toBe('PEN');
    });
  });
});
