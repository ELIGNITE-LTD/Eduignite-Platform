import React, { useEffect, useState } from 'react';
import { useSchool } from '../context/SchoolContext';
import type { ClassStream, FeeTemplate, FinancialTransaction, Student } from '../shared/types';
import type { CollectionsReportRow, StudentBalance } from '../domain/finance';

export default function FinancialsPage() {
  const { school } = useSchool();
  const [tab, setTab] = useState<'templates' | 'payments' | 'transactions' | 'collections'>('templates');

  const [feeTemplates, setFeeTemplates] = useState<FeeTemplate[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [streams, setStreams] = useState<ClassStream[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [collections, setCollections] = useState<CollectionsReportRow[]>([]);

  const [templateForm, setTemplateForm] = useState({ name: '', classId: '', amount: '', dueDate: '' });
  const [paymentForm, setPaymentForm] = useState({
    studentId: '',
    feeTemplateId: '',
    amount: '',
    method: 'cash',
    reference: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [balance, setBalance] = useState<StudentBalance | null>(null);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (!school) return;
    window.api.finance.listFeeTemplates(school.id).then(setFeeTemplates);
    window.api.classes.list(school.id).then(setClasses);
    window.api.classes.listStreams().then(setStreams);
    window.api.students.list({ schoolId: school.id }).then(setStudents);
    window.api.finance.listTransactions({ schoolId: school.id }).then(setTransactions);
  }, [school]);

  async function onCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !templateForm.name || !templateForm.amount) return;
    await window.api.finance.createFeeTemplate({
      school_id: school.id,
      class_id: templateForm.classId || null,
      name: templateForm.name,
      term: school.active_term,
      academic_year: school.academic_year,
      amount: Number(templateForm.amount),
      currency: school.subscription_currency,
      due_date: templateForm.dueDate || null,
      is_mandatory: 1,
    });
    setTemplateForm({ name: '', classId: '', amount: '', dueDate: '' });
    setFeeTemplates(await window.api.finance.listFeeTemplates(school.id));
  }

  async function onRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !paymentForm.studentId || !paymentForm.amount) return;
    const payment = await window.api.finance.recordPayment({
      schoolId: school.id,
      studentId: paymentForm.studentId,
      feeTemplateId: paymentForm.feeTemplateId || null,
      amount: Number(paymentForm.amount),
      currency: school.subscription_currency,
      paymentMethod: paymentForm.method,
      referenceNumber: paymentForm.reference,
      paymentDate: paymentForm.date,
      notes: paymentForm.notes,
    });
    setLastReceipt(payment.receipt_number);
    setLastPaymentId(payment.id);
    setTransactions(await window.api.finance.listTransactions({ schoolId: school.id }));
    await refreshBalance(paymentForm.studentId);
  }

  async function refreshBalance(studentId: string) {
    if (!school || !studentId) {
      setBalance(null);
      return;
    }
    const student = students.find((s) => s.id === studentId);
    const stream = streams.find((s) => s.id === student?.class_stream_id);
    setBalance(
      await window.api.finance.getBalance({
        studentId,
        classId: stream?.class_id ?? null,
        term: school.active_term,
        academicYear: school.academic_year,
      })
    );
  }

  async function loadCollections() {
    if (!school) return;
    setCollections(await window.api.finance.collectionsReport(school.id, school.active_term, school.academic_year));
  }

  useEffect(() => {
    if (tab === 'collections') loadCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, school]);

  const className = (id: string | null) => classes.find((c) => c.id === id)?.name ?? 'All classes';
  const studentName = (id: string) => {
    const s = students.find((st) => st.id === id);
    return s ? `${s.first_name} ${s.last_name}` : id;
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title">Financial Management</h1>

      <div className="flex gap-2 mb-2">
        {(['templates', 'payments', 'transactions', 'collections'] as const).map((t) => (
          <button
            key={t}
            className={`px-3 py-1.5 rounded-md text-sm capitalize ${tab === t ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'templates' && (
        <>
          <form className="card grid grid-cols-4 gap-3 items-end" onSubmit={onCreateTemplate}>
            <div>
              <label className="text-sm font-medium block mb-1">Fee name</label>
              <input className="input-field" value={templateForm.name} onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Class (optional)</label>
              <select className="input-field" value={templateForm.classId} onChange={(e) => setTemplateForm((f) => ({ ...f, classId: e.target.value }))}>
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Amount</label>
              <input className="input-field" type="number" value={templateForm.amount} onChange={(e) => setTemplateForm((f) => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Due date</label>
              <input className="input-field" type="date" value={templateForm.dueDate} onChange={(e) => setTemplateForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div className="col-span-4">
              <button className="btn-primary" type="submit">
                Add fee template
              </button>
            </div>
          </form>

          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Term</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {feeTemplates.map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td>{className(f.class_id)}</td>
                    <td>{f.term}</td>
                    <td>
                      {f.amount.toFixed(2)} {f.currency}
                    </td>
                  </tr>
                ))}
                {feeTemplates.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted-foreground py-6">
                      No fee templates yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'payments' && (
        <>
          <form className="card grid grid-cols-3 gap-3 items-end" onSubmit={onRecordPayment}>
            <div>
              <label className="text-sm font-medium block mb-1">Student</label>
              <select
                className="input-field"
                value={paymentForm.studentId}
                onChange={(e) => {
                  setPaymentForm((f) => ({ ...f, studentId: e.target.value }));
                  refreshBalance(e.target.value);
                }}
                required
              >
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Fee template (optional)</label>
              <select className="input-field" value={paymentForm.feeTemplateId} onChange={(e) => setPaymentForm((f) => ({ ...f, feeTemplateId: e.target.value }))}>
                <option value="">Lump sum</option>
                {feeTemplates.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Amount</label>
              <input className="input-field" type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Method</label>
              <input className="input-field" value={paymentForm.method} onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Reference</label>
              <input className="input-field" value={paymentForm.reference} onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Date</label>
              <input className="input-field" type="date" value={paymentForm.date} onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="col-span-3">
              <button className="btn-primary" type="submit">
                Record payment
              </button>
            </div>
          </form>

          {lastReceipt && (
            <p className="text-sm">
              Receipt <strong>{lastReceipt}</strong> recorded.{' '}
              <button
                className="text-primary underline"
                onClick={async () => {
                  if (lastPaymentId) {
                    const { pdfPath } = await window.api.finance.exportReceiptPdf(lastPaymentId);
                    alert(`Receipt PDF saved to ${pdfPath}`);
                  }
                }}
              >
                Export receipt PDF
              </button>
            </p>
          )}

          {balance && (
            <div className="card max-w-md">
              <h2 className="font-semibold mb-2">Balance ({school?.active_term})</h2>
              <dl className="grid grid-cols-2 text-sm gap-1">
                <dt className="text-muted-foreground">Charged</dt>
                <dd>{balance.totalCharged.toFixed(2)}</dd>
                <dt className="text-muted-foreground">Paid</dt>
                <dd>{balance.totalPaid.toFixed(2)}</dd>
                <dt className="text-muted-foreground">Balance</dt>
                <dd className={balance.balance > 0 ? 'text-destructive font-semibold' : 'font-semibold'}>
                  {balance.balance.toFixed(2)}
                </dd>
              </dl>
            </div>
          )}
        </>
      )}

      {tab === 'transactions' && (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.transaction_date}</td>
                  <td className="capitalize">{t.transaction_type}</td>
                  <td>
                    {t.amount.toFixed(2)} {t.currency}
                  </td>
                  <td>{t.description}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-6">
                    No transactions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'collections' && (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Students</th>
                <th>Charged</th>
                <th>Collected</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c, i) => (
                <tr key={i}>
                  <td>{className(c.classId)}</td>
                  <td>{c.studentCount}</td>
                  <td>{c.totalCharged.toFixed(2)}</td>
                  <td>{c.totalCollected.toFixed(2)}</td>
                  <td>{c.outstandingBalance.toFixed(2)}</td>
                </tr>
              ))}
              {collections.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground py-6">
                    No collections data for this term yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
