import { describe, it, expect } from 'vitest';
import { parseBcpEmail, bankReference, mimeToInboundEmail } from '../../src/parse-bank-email.js';
import { BCP_EMAIL_FIXTURES, BCP_SENDER, toMime } from '../fixtures/bcp-emails.js';
import type { InboundEmail } from '../../src/types.js';

const SUBJECT =
  'Realizaste un consumo con tu Tarjeta de Crédito BCP - Servicio de Notificaciones BCP';

function textEmail(text: string, subject = SUBJECT): InboundEmail {
  return {
    from: 'notificaciones@notificacionesbcp.com.pe',
    to: 'gasto@example.com',
    subject,
    text,
    html: null,
    receivedAt: '2026-11-18T22:15:23Z',
  };
}

const PLAIN_BODY = [
  'Hola Cliente,',
  'Realizaste un consumo de S/ 22.90 con tu Tarjeta de Crédito BCP en DLC*UBER RIDES.',
  'Total del consumo',
  'S/ 22.90',
  'Operación realizada',
  'Consumo Tarjeta de Crédito',
  'Fecha y hora',
  '18 de noviembre de 2026 - 05:15 PM',
  'Número de Tarjeta de Crédito',
  '************1234',
  'Empresa',
  'DLC*UBER RIDES',
  'Número de operación',
  '0000812345',
].join('\n');

describe('parseBcpEmail', () => {
  describe('GATE #4: 100% field accuracy on fixtures', () => {
    for (const fixture of BCP_EMAIL_FIXTURES) {
      it(fixture.label, () => {
        const result = parseBcpEmail(fixture.email);

        if (fixture.expected === null) {
          expect(result).toBeNull();
          return;
        }

        expect(result).not.toBeNull();
        const { raw_text, ...fields } = result!;
        expect(fields).toEqual(fixture.expected);
        expect(raw_text.length).toBeGreaterThan(0);
      });
    }

    it('gate summary: every fixture matches', () => {
      const failures = BCP_EMAIL_FIXTURES.filter((f) => {
        const result = parseBcpEmail(f.email);
        if (f.expected === null) return result !== null;
        if (result === null) return true;
        const { raw_text: _ignored, ...fields } = result;
        return JSON.stringify(fields) !== JSON.stringify(f.expected);
      }).map((f) => f.label);

      console.log(JSON.stringify({
        event: 'gate_4_result',
        total: BCP_EMAIL_FIXTURES.length,
        passed: BCP_EMAIL_FIXTURES.length - failures.length,
      }));
      expect(failures).toEqual([]);
    });
  });

  describe('plain-text body', () => {
    it('parses a text/plain body when there is no HTML', () => {
      const result = parseBcpEmail(textEmail(PLAIN_BODY));
      expect(result).toMatchObject({
        amount: 22.9,
        currency: 'PEN',
        merchant: 'DLC*UBER RIDES',
        date: '2026-11-18',
        time: '17:15',
        card_last4: '1234',
        operation_number: '0000812345',
      });
    });

    it('accepts "Label: value" on one line', () => {
      const body = PLAIN_BODY
        .replace('Empresa\nDLC*UBER RIDES', 'Empresa: DLC*UBER RIDES')
        .replace('Número de operación\n0000812345', 'Número de operación: 0000812345');
      const result = parseBcpEmail(textEmail(body));
      expect(result?.merchant).toBe('DLC*UBER RIDES');
      expect(result?.operation_number).toBe('0000812345');
    });

    it('prefers HTML when both are present', () => {
      const email = { ...textEmail('garbage only'), html: `<p>${PLAIN_BODY.replace(/\n/g, '</p><p>')}</p>` };
      expect(parseBcpEmail(email)?.operation_number).toBe('0000812345');
    });
  });

  describe('rejects malformed values', () => {
    it('returns null for an unknown month', () => {
      const body = PLAIN_BODY.replace('noviembre', 'brumario');
      expect(parseBcpEmail(textEmail(body))).toBeNull();
    });

    it('returns null for an impossible date', () => {
      const body = PLAIN_BODY.replace('18 de noviembre', '31 de noviembre');
      expect(parseBcpEmail(textEmail(body))).toBeNull();
    });

    it('returns null for an unknown currency', () => {
      const body = PLAIN_BODY.replace(/S\/ 22\.90/g, '€ 22.90');
      expect(parseBcpEmail(textEmail(body))).toBeNull();
    });

    it('returns null for a zero amount', () => {
      const body = PLAIN_BODY.replace(/S\/ 22\.90/g, 'S/ 0.00');
      expect(parseBcpEmail(textEmail(body))).toBeNull();
    });

    it('returns null when the body says débito despite a crédito subject', () => {
      const body = PLAIN_BODY.replace('Consumo Tarjeta de Crédito', 'Consumo Tarjeta de Débito');
      expect(parseBcpEmail(textEmail(body))).toBeNull();
    });

    it('returns null for an empty email', () => {
      expect(parseBcpEmail(textEmail(''))).toBeNull();
    });
  });

  describe('raw_text', () => {
    it('is plain text: no tags, entities or zero-width spaces', () => {
      const fixture = BCP_EMAIL_FIXTURES.find((f) => f.expected?.merchant === 'H&M JOCKEY PLAZA')!;
      const { raw_text } = parseBcpEmail(fixture.email)!;
      expect(raw_text).not.toMatch(/[<>]|&amp;|&#\d+;|​/);
      expect(raw_text).toContain('H&M JOCKEY PLAZA');
      expect(raw_text).toContain('Número de operación');
    });

    it('excludes the legal footer', () => {
      const { raw_text } = parseBcpEmail(BCP_EMAIL_FIXTURES[0].email)!;
      expect(raw_text).not.toContain('RUC');
      expect(raw_text).not.toContain('Problemas con tus compras');
    });
  });
});

describe('bankReference', () => {
  it('namespaces the operation number by bank', () => {
    const tx = parseBcpEmail(BCP_EMAIL_FIXTURES[0].email)!;
    expect(bankReference(tx)).toBe('bcp:0000812345');
  });
});

describe('mimeToInboundEmail', () => {
  const fixture = BCP_EMAIL_FIXTURES[0];

  it('decodes sender, subject and HTML from raw MIME', async () => {
    const email = await mimeToInboundEmail(toMime(fixture.email));
    expect(email.from).toBe(BCP_SENDER);
    expect(email.subject).toBe(fixture.email.subject);
    // postal-mime normalizes CRLF to LF
    expect(email.html).toBe(fixture.email.html!.replace(/\r\n/g, '\n'));
    expect(email.text).toBe('');
    expect(email.receivedAt).toBe('2026-11-18T22:15:23.000Z');
  });

  it('accepts a Buffer', async () => {
    const email = await mimeToInboundEmail(Buffer.from(toMime(fixture.email), 'utf8'));
    expect(email.subject).toBe(fixture.email.subject);
  });

  it('lowercases the sender address and drops the display name', async () => {
    const email = await mimeToInboundEmail(toMime(fixture.email, 'BCP <Notificaciones@NotificacionesBCP.com.pe>'));
    expect(email.from).toBe(BCP_SENDER);
  });

  it('round-trips into parseBcpEmail', async () => {
    const tx = parseBcpEmail(await mimeToInboundEmail(toMime(fixture.email)));
    const { raw_text: _ignored, ...fields } = tx!;
    expect(fields).toEqual(fixture.expected);
  });

  it('a plain-text email has html null', async () => {
    const email = await mimeToInboundEmail(toMime({ ...fixture.email, html: null, text: 'hola' }));
    expect(email.html).toBeNull();
    expect(email.text.trim()).toBe('hola');
  });

  it('missing headers become empty strings', async () => {
    const email = await mimeToInboundEmail('\r\n\r\nbody only');
    expect(email.from).toBe('');
    expect(email.subject).toBe('');
    expect(email.to).toBe('');
  });
});
