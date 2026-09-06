import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Payment, School, Student } from '../shared/types';

export interface ReceiptPdfInput {
  school: School;
  student: Student;
  payment: Payment;
}

export function buildReceiptDocDefinition(input: ReceiptPdfInput): TDocumentDefinitions {
  const { school, student, payment } = input;

  return {
    pageSize: 'A5',
    pageMargins: [30, 40, 30, 40],
    content: [
      { text: school.name, style: 'header' },
      { text: [school.location, school.address].filter(Boolean).join(' — '), style: 'muted' },
      { text: ' ' },
      { text: 'PAYMENT RECEIPT', style: 'subheader', alignment: 'center' },
      { text: payment.receipt_number, alignment: 'center', bold: true, margin: [0, 0, 0, 10] },
      {
        table: {
          widths: ['auto', '*'],
          body: [
            ['Student', `${student.first_name} ${student.last_name} (${student.admission_number})`],
            ['Amount', `${payment.amount.toFixed(2)} ${payment.currency}`],
            ['Payment method', payment.payment_method],
            ['Reference', payment.reference_number || '—'],
            ['Date', payment.payment_date],
            ['Notes', payment.notes || '—'],
          ],
        },
        layout: 'noBorders',
      },
      { text: 'Thank you.', margin: [0, 20, 0, 0], alignment: 'center' },
    ],
    styles: {
      header: { fontSize: 14, bold: true },
      subheader: { fontSize: 12, bold: true, margin: [0, 8, 0, 4] },
      muted: { fontSize: 8, color: '#666666' },
    },
  };
}
