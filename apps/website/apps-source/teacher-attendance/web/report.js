/**
 * Teacher Attendance — Monthly Report.
 *
 * Counting happens on the server, so this moves one small summary rather than
 * a month of records. That matters on the connections these schools have.
 */

const bridge = window.eduignite;
const root = document.getElementById("root");

const style = document.createElement("style");
style.textContent = `
  :root { color-scheme: light; }
  body { color:#1f2b38; font-size:14px; }
  .bar { display:flex; flex-wrap:wrap; gap:10px; align-items:center;
         justify-content:space-between; margin-bottom:14px; }
  input[type=month] { font:inherit; padding:7px 10px; border:1px solid #d8e0e8;
                      border-radius:9px; background:#fff; }
  .note { font-size:12px; color:#7a8a99; }
  .scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
  table { width:100%; border-collapse:collapse; min-width:520px; }
  th, td { padding:9px 10px; text-align:left; border-bottom:1px solid #eef2f6;
           white-space:nowrap; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.06em;
       color:#5b6b7c; background:#f7fafc; }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; }
  tr:last-child td { border-bottom:none; }
  .name { font-weight:700; }
  .warn { margin-top:10px; padding:9px 11px; border-radius:9px;
          background:#fff8e6; color:#8a6d1f; font-size:12px; }
  .empty, .error { padding:34px 14px; text-align:center; color:#5b6b7c; }
  .error { color:#b3261e; }
  .skeleton { height:44px; border-radius:9px; background:#eef2f6; margin-bottom:7px; }
`;
document.head.appendChild(style);

function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

let month = thisMonth();

function report() {
  bridge.ui.resize(document.documentElement.scrollHeight);
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

async function load() {
  root.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  report();
  try {
    const result = await bridge.call("monthly_summary", { month });
    if (result && result.error) throw new Error(result.error);
    render(result);
  } catch (error) {
    root.innerHTML = `<div class="error">${escapeHtml(error.message || "Could not load the report.")}</div>`;
    report();
  }
}

function render(result) {
  const staff = (result && result.staff) || [];

  const body = staff.length
    ? staff.map(rowHtml).join("")
    : '<tr><td colspan="6" class="empty">Nothing recorded for this month yet.</td></tr>';

  root.innerHTML = `
    <div class="bar">
      <label><input type="month" id="month" value="${escapeHtml(month)}" max="${escapeHtml(thisMonth())}"></label>
      <span class="note">${(result && result.records) || 0} record(s)</span>
    </div>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>Staff</th>
            <th class="n">Present</th>
            <th class="n">Late</th>
            <th class="n">Absent</th>
            <th class="n">Excused</th>
            <th class="n">Mins late</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${
      result && result.truncated
        ? '<div class="warn">This month has more records than can be summarised at once, so these totals are partial.</div>'
        : ""
    }
  `;

  const picker = document.getElementById("month");
  if (picker) {
    picker.addEventListener("change", (event) => {
      month = event.target.value || thisMonth();
      load();
    });
  }
  report();
}

function rowHtml(entry) {
  return `
    <tr>
      <td class="name">${escapeHtml(entry.name || "Unnamed")}</td>
      <td class="n">${entry.present || 0}</td>
      <td class="n">${entry.late || 0}</td>
      <td class="n">${entry.absent || 0}</td>
      <td class="n">${entry.excused || 0}</td>
      <td class="n">${entry.minutes_late || 0}</td>
    </tr>
  `;
}

bridge.on("init", load);
if (bridge.context && bridge.context.appKey) load();
