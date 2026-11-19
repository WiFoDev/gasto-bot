import type { BankTransaction, InboundEmail } from '../../src/types.js';

/**
 * Anonymized BCP notification emails (GATE #4).
 *
 * Built from real notifications received Oct–Nov 2026. The HTML keeps the
 * real structure of BCP's two purchase templates (label/value table rows,
 * `<b><a>` wrapped values, zero-width spaces, CRLF line breaks); names, card
 * digits and operation numbers are replaced. BCP sends these as HTML only —
 * there is no text/plain part.
 */

export interface BcpEmailFixture {
  label: string;
  email: InboundEmail;
  /** null = the parser must ignore this email. */
  expected: Omit<BankTransaction, 'raw_text'> | null;
}

const CREDIT_SUBJECT =
  'Realizaste un consumo con tu Tarjeta de Crédito BCP - Servicio de Notificaciones BCP';

const BASE = {
  from: 'notificaciones@notificacionesbcp.com.pe',
  to: 'gasto@example.com',
  receivedAt: '2026-11-18T22:15:23Z',
};

interface Row {
  label: string;
  value: string;
}

const TD_LABEL =
  '<td style="width:276px; -webkit-text-size-adjust:none; font-family: Arial, Tahoma, Helvetica; font-size:14px; line-height:24px; padding: 24px 0px 24px 0px; color:#202E44; text-align:left; border-bottom: 1px solid #EAEFF5" bgcolor="#ffffff" valign="top">';
const TD_VALUE =
  '<td style="-webkit-text-size-adjust:none; font-family: Arial, Tahoma, Helvetica; font-size:14px; line-height:24px; padding: 24px 0px 24px 0px; color:#202E44; text-align:right; border-bottom: 1px solid #EAEFF5" bgcolor="#ffffff" valign="top">';

function rows(list: Row[]): string {
  return list
    .map(
      (r) =>
        `      <tr>\r\n       ${TD_LABEL}${r.label}</td>\r\n       ${TD_VALUE}<b>${r.value}</b></td>\r\n      </tr>\r\n`,
    )
    .join('');
}

/** `<a>`-wrapped value, as BCP renders dates and operation numbers. */
function a(value: string, emptyHref = false): string {
  const href = emptyHref ? ' href=""' : '';
  return `<a${href} style="text-decoration:none; white-space:nowrap; color:#202E44 !important; cursor:text !important;">${value}</a>`;
}

const LEGAL_FOOTER =
  '<p style="font-family: Arial, Tahoma, Helvetica; font-size:9px; line-height:16px; text-align:justify; margin:0px 0px 0px 0px;">El BCP nunca te solicitará datos confidenciales por correo, tales como tu clave secreta de cajero de 4 dígitos, clave de internet de 6 dígitos, número de tu tarjeta de débito o crédito.</p>\r\n' +
  '<p style="font-family: Arial, Tahoma, Helvetica; font-size: 9px;">Nuestros correos personalizados únicamente te dirigirán a <span style="white-space:nowrap">www&#8203;.viabcp&#8203;.com</span>. Banco de Crédito del Perú S.A. - RUC: <span>20100&#8203;047218</span>.</p>\r\n';

interface PurchaseOpts {
  /** e.g. `S/ 22.90` or `$ 23.60` — appears in the headline and the amount row. */
  amount: string;
  cardKind?: 'Crédito' | 'Débito';
  merchant: string;
  /** e.g. `18 de noviembre de 2026 - 05:15 PM` */
  datetime: string;
  card: string;
  operation: string;
  /** Template A (2025+ builder, nl-container) or B (older, HTML comments). */
  template?: 'A' | 'B';
  /** Cut the body right after the card row (simulates a truncated email). */
  truncate?: boolean;
}

function purchaseHtml(o: PurchaseOpts): string {
  const kind = o.cardKind ?? 'Crédito';
  const tpl = o.template ?? 'A';
  const emptyHref = tpl === 'B';
  const head =
    tpl === 'A'
      ? '<!DOCTYPE html><html lang="en"><head><title></title><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><style>\r\n*{box-sizing:border-box}body{margin:0;padding:0}\r\n</style></head><body class="body"><table class="nl-container" width="100%"><tbody><tr><td><div style="font-family:Arial,Helvetica Neue,Helvetica,sans-serif;text-align:center" align="center">\r\n<html>\r\n <head>\r\n  <title></title>\r\n  <style>\r\n\t\t\tbody {background:white; margin: 0; padding: 0;}\r\n</style>\r\n </head>\r\n  <table width="600" cellpadding="0" cellspacing="0" border="0" align="center">\r\n'
      : '\r\n<!DOCTYPE html>\r\n<html>\r\n <head>\r\n  <title></title>\r\n  <style type="text/css">\r\n\t\t\tbody {background:white; margin: 0; padding: 0;}\r\n</style>\r\n </head>\r\n <body id="body" yahoo bgcolor="#ffffff">\r\n  <table width="600" cellpadding="0" cellspacing="0" border="0" align="center">\r\n   <!-- inicio.saludo ::::::::::::::::::::::-->\r\n';

  const greeting =
    '   <tr>\r\n    <td>\r\n' +
    '     <p style="font-family: Arial, Tahoma, Helvetica; font-size:16px; color: #1c2e46">Hola <b>Cliente,</b></p>\r\n' +
    `     <p style="font-family: Arial, Tahoma, Helvetica; font-size:24px; color: #002B93">Realizaste un consumo de <b>${o.amount}</b> con tu <b>Tarjeta de ${kind} BCP</b> en <b>${o.merchant}.</b></p>\r\n` +
    '     <p style="font-family: Arial, Tahoma, Helvetica; font-size:16px; color: #1c2e46">Por tu seguridad, te enviamos los <b>datos de tu operación.</b></p>\r\n' +
    '    </td>\r\n   </tr>\r\n';

  const amountTable =
    '   <tr><td><p><b>Monto</b></p></td></tr>\r\n   <tr>\r\n    <td> \r\n     <table width="552" cellpadding="0" cellspacing="0" border="0" align="center">\r\n' +
    rows([{ label: 'Total del consumo', value: o.amount }]) +
    '     </table>\r\n    </td>\r\n   </tr>\r\n';

  const dataRows: Row[] = [
    { label: 'Operación realizada', value: `Consumo Tarjeta de ${kind}` },
    { label: 'Fecha y hora', value: a(o.datetime, emptyHref) },
    { label: `Número de Tarjeta de ${kind}`, value: `************${o.card}` },
  ];
  if (!o.truncate) {
    dataRows.push(
      { label: 'Empresa', value: o.merchant },
      { label: 'Número de operación', value: a(o.operation, emptyHref) },
    );
  }

  const dataTable =
    '   <tr><td><p><b>Datos de la operación</b></p></td></tr>\r\n   <tr>\r\n    <td>\r\n     <table width="552" cellpadding="0" cellspacing="0" border="0" align="center">\r\n' +
    rows(dataRows) +
    '     </table>\r\n    </td>\r\n   </tr>\r\n';

  if (o.truncate) return head + greeting + amountTable + dataTable;

  const tail =
    '   <tr><td><p style="font-size:24px">¿Problemas con tus compras?</p></td></tr>\r\n' +
    '   <tr><td><p>Si tu compra fue rechazada, cancelada o duplicada, el tiempo estimado de devolución será de 3 a 7 días.<br />\r\n     </p></td></tr>\r\n' +
    '   <tr><td><p><b>¿No reconoces esta operación?</b></p><p>Comunícate inmediatamente con nosotros al <a href="#">(01) 311-9898</a> anexo *911.</p></td></tr>\r\n' +
    `   <tr><td>${LEGAL_FOOTER}</td></tr>\r\n` +
    '  </table>\r\n</html></div></td></tr></tbody></table></body></html>\r\n';

  return head + greeting + amountTable + dataTable + tail;
}

function creditEmail(o: PurchaseOpts, subject = CREDIT_SUBJECT): InboundEmail {
  return { ...BASE, subject, text: '', html: purchaseHtml(o) };
}

// ── Purchases that must parse ────────────────────────────────────

const PARSED: BcpEmailFixture[] = [
  {
    label: 'PEN, DLC* prefix, PM time (template A)',
    email: creditEmail({
      amount: 'S/ 22.90',
      merchant: 'DLC*UBER RIDES',
      datetime: '18 de noviembre de 2026 - 05:15 PM',
      card: '1234',
      operation: '0000812345',
    }),
    expected: {
      bank: 'bcp', amount: 22.9, currency: 'PEN', merchant: 'DLC*UBER RIDES',
      date: '2026-11-18', time: '17:15', card_last4: '1234', operation_number: '0000812345',
    },
  },
  {
    label: 'USD, "NAME* PRODUCT" merchant (template B)',
    email: creditEmail({
      amount: '$ 23.60',
      merchant: 'ANTHROPIC* CLAUDE SUB',
      datetime: '20 de octubre de 2026 - 04:48 PM',
      card: '1234',
      operation: '0000398765',
      template: 'B',
    }),
    expected: {
      bank: 'bcp', amount: 23.6, currency: 'USD', merchant: 'ANTHROPIC* CLAUDE SUB',
      date: '2026-10-20', time: '16:48', card_last4: '1234', operation_number: '0000398765',
    },
  },
  {
    label: 'IZI* prefix, multi-word merchant',
    email: creditEmail({
      amount: 'S/ 57.75',
      merchant: 'IZI*X3 PADEL CLUB',
      datetime: '09 de noviembre de 2026 - 08:30 PM',
      card: '1234',
      operation: '0000700001',
    }),
    expected: {
      bank: 'bcp', amount: 57.75, currency: 'PEN', merchant: 'IZI*X3 PADEL CLUB',
      date: '2026-11-09', time: '20:30', card_last4: '1234', operation_number: '0000700001',
    },
  },
  {
    label: 'plain multi-word merchant, AM time',
    email: creditEmail({
      amount: 'S/ 64.00',
      merchant: 'SAN MARCELO RESTAURANTE',
      datetime: '02 de noviembre de 2026 - 09:05 AM',
      card: '1234',
      operation: '0000700002',
    }),
    expected: {
      bank: 'bcp', amount: 64, currency: 'PEN', merchant: 'SAN MARCELO RESTAURANTE',
      date: '2026-11-02', time: '09:05', card_last4: '1234', operation_number: '0000700002',
    },
  },
  {
    label: '"setiembre" (BCP spelling)',
    email: creditEmail({
      amount: 'S/ 34.00',
      merchant: 'NEIRA CAFE LAB',
      datetime: '07 de setiembre de 2026 - 05:55 PM',
      card: '1234',
      operation: '0000700003',
      template: 'B',
    }),
    expected: {
      bank: 'bcp', amount: 34, currency: 'PEN', merchant: 'NEIRA CAFE LAB',
      date: '2026-09-07', time: '17:55', card_last4: '1234', operation_number: '0000700003',
    },
  },
  {
    label: '"septiembre" spelling',
    email: creditEmail({
      amount: 'S/ 12.50',
      merchant: 'OXXO ARONA',
      datetime: '30 de septiembre de 2026 - 11:59 PM',
      card: '1234',
      operation: '0000700004',
    }),
    expected: {
      bank: 'bcp', amount: 12.5, currency: 'PEN', merchant: 'OXXO ARONA',
      date: '2026-09-30', time: '23:59', card_last4: '1234', operation_number: '0000700004',
    },
  },
  {
    label: '12:xx AM → 00:xx (just after midnight)',
    email: creditEmail({
      amount: '$ 1.16',
      merchant: 'APPLE.COM/BILL',
      datetime: '01 de enero de 2027 - 12:07 AM',
      card: '1234',
      operation: '0000700005',
      template: 'B',
    }),
    expected: {
      bank: 'bcp', amount: 1.16, currency: 'USD', merchant: 'APPLE.COM/BILL',
      date: '2027-01-01', time: '00:07', card_last4: '1234', operation_number: '0000700005',
    },
  },
  {
    label: '12:xx PM stays 12:xx (noon)',
    email: creditEmail({
      amount: 'S/ 18.90',
      merchant: 'PYU*Cabify PE',
      datetime: '15 de diciembre de 2026 - 12:40 PM',
      card: '1234',
      operation: '0000700006',
    }),
    expected: {
      bank: 'bcp', amount: 18.9, currency: 'PEN', merchant: 'PYU*Cabify PE',
      date: '2026-12-15', time: '12:40', card_last4: '1234', operation_number: '0000700006',
    },
  },
  {
    label: 'thousands separator + HTML entity in merchant',
    email: creditEmail({
      amount: 'S/ 1,250.00',
      merchant: 'H&amp;M JOCKEY PLAZA',
      datetime: '28 de noviembre de 2026 - 07:10 PM',
      card: '1234',
      operation: '0000700007',
    }),
    expected: {
      bank: 'bcp', amount: 1250, currency: 'PEN', merchant: 'H&M JOCKEY PLAZA',
      date: '2026-11-28', time: '19:10', card_last4: '1234', operation_number: '0000700007',
    },
  },
  {
    label: 'manually forwarded ("Fwd:" subject)',
    email: creditEmail(
      {
        amount: 'S/ 31.30',
        merchant: 'DLC*RAPPI PERU',
        datetime: '17 de noviembre de 2026 - 01:22 PM',
        card: '1234',
        operation: '0000700008',
      },
      `Fwd: ${CREDIT_SUBJECT}`,
    ),
    expected: {
      bank: 'bcp', amount: 31.3, currency: 'PEN', merchant: 'DLC*RAPPI PERU',
      date: '2026-11-17', time: '13:22', card_last4: '1234', operation_number: '0000700008',
    },
  },
];

// ── Emails that must be ignored (null) ───────────────────────────

const YAPEO_HTML =
  '<html>\r\n  <body>\r\n    <table width="600">\r\n      <tr>\r\n        <td>\r\n          <p style="\r\n              font-size: 24px;\r\n            ">\r\n            Recibiste un <b>yapeo de S/ 1,500.00</b> de Persona Ejemplo.\r\n          </p>\r\n        </td>\r\n      </tr>\r\n' +
  '      <tr>\r\n        <td style="\r\n            width: 276px;\r\n          " valign="top">\r\n          Monto recibido\r\n        </td>\r\n        <td valign="top">\r\n          <b>S/ 1,500.00</b>\r\n        </td>\r\n      </tr>\r\n' +
  '      <tr><td>Operación realizada</td><td><b>Yapeo a celular</b></td></tr>\r\n' +
  '      <tr><td>Fecha y hora</td><td><b>02 de noviembre de 2026 - 09:59 AM</b></td></tr>\r\n' +
  '      <tr><td>Enviado por</td><td><b>Persona Ejemplo</b></td></tr>\r\n    </table>\r\n  </body>\r\n</html>\r\n';

const OPERACION_HTML = purchaseHtml({
  amount: '$ 50.00',
  merchant: 'GGPoker',
  datetime: '24 de octubre de 2026 - 03:48 PM',
  card: '1234',
  operation: '0000700009',
  template: 'B',
})
  .replace('Realizaste un consumo de', 'Realizaste una operación de')
  .replace('Total del consumo', 'Total de la operación')
  .replace('Consumo Tarjeta de Crédito', 'Operación con Tarjeta de Crédito');

const IGNORED: BcpEmailFixture[] = [
  {
    label: 'debit-card purchase (out of scope: credit only)',
    email: {
      ...BASE,
      subject: 'Realizaste un consumo con tu Tarjeta de Débito BCP - Servicio de Notificaciones BCP',
      text: '',
      html: purchaseHtml({
        amount: 'S/ 86.00',
        cardKind: 'Débito',
        merchant: 'PYU*CINEPLANET',
        datetime: '06 de octubre de 2026 - 08:12 PM',
        card: '5678',
        operation: '051234',
      }),
    },
    expected: null,
  },
  {
    label: 'credit-card "operación" (cash-type charge, not a consumo)',
    email: {
      ...BASE,
      subject: 'Realizaste una operación con tu Tarjeta de Crédito BCP - Servicio de Notificaciones BCP',
      text: '',
      html: OPERACION_HTML,
    },
    expected: null,
  },
  {
    label: 'Yapeo received',
    email: {
      ...BASE,
      subject: 'Constancia de recepción de Yapeo a celular BCP - Servicio de Notificaciones BCP',
      text: '',
      html: YAPEO_HTML,
    },
    expected: null,
  },
  {
    label: 'statement email',
    email: {
      ...BASE,
      subject: 'Estado de Cuenta de tu Tarjeta de Crédito BCP',
      text: 'Hola Cliente, adjuntamos tu estado de cuenta del mes. Total a pagar S/ 2,345.67',
      html: null,
    },
    expected: null,
  },
  {
    label: 'credit-card subject but truncated body (no Empresa / operación)',
    email: creditEmail({
      amount: 'S/ 45.00',
      merchant: 'LA MORA',
      datetime: '10 de noviembre de 2026 - 02:00 PM',
      card: '1234',
      operation: '0000700010',
      truncate: true,
    }),
    expected: null,
  },
];

export const BCP_EMAIL_FIXTURES: BcpEmailFixture[] = [...PARSED, ...IGNORED];
