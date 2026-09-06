import React, { useEffect, useState } from 'react';
import { useSchool } from '../context/SchoolContext';
import type { ClassStream, SchoolClass, Teacher } from '../shared/types';

export default function ClassesPage() {
  const { school } = useSchool();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [streams, setStreams] = useState<ClassStream[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [enrollment, setEnrollment] = useState<Record<string, number>>({});

  const [className, setClassName] = useState('');
  const [cycle, setCycle] = useState('FIRST');

  const [streamClassId, setStreamClassId] = useState('');
  const [streamName, setStreamName] = useState('');
  const [streamTeacherId, setStreamTeacherId] = useState('');

  const [fromStream, setFromStream] = useState('');
  const [toStream, setToStream] = useState('');
  const [promotionResult, setPromotionResult] = useState<string | null>(null);

  async function load() {
    if (!school) return;
    const [c, s, t] = await Promise.all([
      window.api.classes.list(school.id),
      window.api.classes.listStreams(),
      window.api.teachers.list(school.id),
    ]);
    setClasses(c);
    setStreams(s);
    setTeachers(t);
    const counts: Record<string, number> = {};
    for (const stream of s) {
      counts[stream.id] = await window.api.classes.countEnrollment(stream.id);
    }
    setEnrollment(counts);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school]);

  async function onCreateClass(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !className) return;
    await window.api.classes.create({ school_id: school.id, name: className, cycle, display_order: classes.length });
    setClassName('');
    await load();
  }

  async function onCreateStream(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !streamClassId || !streamName) return;
    await window.api.classes.createStream({
      class_id: streamClassId,
      name: streamName,
      academic_year: school.academic_year,
      class_teacher_id: streamTeacherId || null,
      capacity: null,
    });
    setStreamName('');
    setStreamTeacherId('');
    await load();
  }

  async function onPromote(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !fromStream || !toStream) return;
    const result = await window.api.students.promoteClass({
      fromClassStreamId: fromStream,
      toClassStreamId: toStream,
      academicYear: school.academic_year,
    });
    setPromotionResult(`Promoted ${result.promotedCount} of ${result.total}; ${result.repeatedCount} repeated.`);
    await load();
  }

  const classNameOf = (id: string) => classes.find((c) => c.id === id)?.name ?? '—';

  return (
    <div className="space-y-6">
      <h1 className="page-title">Classes</h1>

      <section className="card">
        <h2 className="font-semibold mb-3">Create class</h2>
        <form className="flex gap-3 items-end" onSubmit={onCreateClass}>
          <div>
            <label className="text-sm font-medium block mb-1">Class name</label>
            <input className="input-field" value={className} onChange={(e) => setClassName(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Cycle</label>
            <input className="input-field" value={cycle} onChange={(e) => setCycle(e.target.value)} />
          </div>
          <button className="btn-primary" type="submit">
            Add class
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">Create class stream</h2>
        <form className="flex gap-3 items-end flex-wrap" onSubmit={onCreateStream}>
          <div>
            <label className="text-sm font-medium block mb-1">Class</label>
            <select className="input-field" value={streamClassId} onChange={(e) => setStreamClassId(e.target.value)} required>
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Stream name</label>
            <input className="input-field" value={streamName} onChange={(e) => setStreamName(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Class teacher</label>
            <select className="input-field" value={streamTeacherId} onChange={(e) => setStreamTeacherId(e.target.value)}>
              <option value="">Unassigned</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.first_name} {t.last_name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary" type="submit">
            Add stream
          </button>
        </form>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Class streams</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Stream</th>
              <th>Class</th>
              <th>Academic year</th>
              <th>Active enrollment</th>
            </tr>
          </thead>
          <tbody>
            {streams.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{classNameOf(s.class_id)}</td>
                <td>{s.academic_year}</td>
                <td>{enrollment[s.id] ?? '—'}</td>
              </tr>
            ))}
            {streams.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted-foreground py-6">
                  No class streams yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">Promote class to next class</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Promotes every active student in the source stream using their latest compiled annual average
          (see Report Cards). Students below the promotion average are held back in the same stream.
        </p>
        <form className="flex gap-3 items-end flex-wrap" onSubmit={onPromote}>
          <div>
            <label className="text-sm font-medium block mb-1">From stream</label>
            <select className="input-field" value={fromStream} onChange={(e) => setFromStream(e.target.value)} required>
              <option value="">Select stream</option>
              {streams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">To stream</label>
            <select className="input-field" value={toStream} onChange={(e) => setToStream(e.target.value)} required>
              <option value="">Select stream</option>
              {streams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary" type="submit">
            Run promotion
          </button>
        </form>
        {promotionResult && <p className="text-sm mt-3">{promotionResult}</p>}
      </section>
    </div>
  );
}
