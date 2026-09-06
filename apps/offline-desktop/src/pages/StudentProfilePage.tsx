import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Payment, ReportCard, Student, StudentPromotion } from '../shared/types';

export default function StudentProfilePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [promotions, setPromotions] = useState<StudentPromotion[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    if (!studentId) return;
    (async () => {
      const [s, p, rc, pay] = await Promise.all([
        window.api.students.get(studentId),
        window.api.students.listPromotions(studentId),
        window.api.reportCards.list({ studentId }),
        window.api.finance.listPaymentsForStudent(studentId),
      ]);
      setStudent(s);
      setPromotions(p);
      setReportCards(rc);
      setPayments(pay);
    })();
  }, [studentId]);

  if (!student) return <div>Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">
          {student.first_name} {student.last_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Admission #{student.admission_number} · {student.status} · Annual average:{' '}
          {student.annual_average !== null ? student.annual_average.toFixed(2) : '—'}
          {student.is_on_honour_roll ? ' · Honour Roll' : ''}
        </p>
      </div>

      <section className="card">
        <h2 className="font-semibold mb-2">Contact / Guardian</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Gender</dt>
          <dd className="capitalize">{student.gender}</dd>
          <dt className="text-muted-foreground">Date of birth</dt>
          <dd>{student.date_of_birth || '—'}</dd>
          <dt className="text-muted-foreground">Guardian</dt>
          <dd>{student.guardian_name || '—'}</dd>
          <dt className="text-muted-foreground">Guardian phone</dt>
          <dd>{student.guardian_phone || '—'}</dd>
        </dl>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-2">Promotion history</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Status</th>
              <th>Average</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {promotions.map((p) => (
              <tr key={p.id}>
                <td>{p.academic_year}</td>
                <td className="capitalize">{p.status}</td>
                <td>{p.average_score !== null ? p.average_score.toFixed(2) : '—'}</td>
                <td>{p.remarks}</td>
              </tr>
            ))}
            {promotions.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted-foreground py-4">
                  No promotion decisions recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-2">Report cards</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Term</th>
              <th>Year</th>
              <th>Average</th>
              <th>Grade</th>
              <th>Rank</th>
            </tr>
          </thead>
          <tbody>
            {reportCards.map((rc) => (
              <tr key={rc.id}>
                <td>{rc.term}</td>
                <td>{rc.academic_year}</td>
                <td>{rc.average_score.toFixed(2)}</td>
                <td>{rc.grade_range}</td>
                <td>
                  {rc.class_rank ?? '—'}/{rc.class_size ?? '—'}
                </td>
              </tr>
            ))}
            {reportCards.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted-foreground py-4">
                  No report cards compiled yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-2">Payments</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Receipt</th>
              <th>Amount</th>
              <th>Method</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.payment_date}</td>
                <td>{p.receipt_number}</td>
                <td>
                  {p.amount.toFixed(2)} {p.currency}
                </td>
                <td>{p.payment_method}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted-foreground py-4">
                  No payments recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
