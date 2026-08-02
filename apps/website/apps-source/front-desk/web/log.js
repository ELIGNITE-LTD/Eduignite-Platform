/**
 * Front Desk — Visitor Log.
 *
 * The record for one day: who came, why, when in, when out. Admins only.
 */

const bridge = window.eduignite;
const root = document.getElementById("root");

const PURPOSE_LABEL = {
  parent: "Parent / guardian",
  official: "Official",
  supplier: "Supplier",
  interview: "Interview",
  other: "Other",
};

const style = document.createElement("style");
style.textContent = `
  :root { color-scheme: light; }
  body { color:#1f2b38; font-size:14px; }
  .bar { display:flex; flex-wrap:wrap; gap:10px; align-items:center;
         justify-content:space-between; margin-bottom:14px; }
  input[type=date] { font:inherit; padding:7px 10px; border:1px solid #d8e0e8;
                     border-radius:9px; background:#fff; }
  .note { font-size:12px; color:#7a8a99; }
  .scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
  table { width:100%; border-collapse:collapse; min-width:560px; }
  th, td { padding:9px 10px; text-align:left; border-bottom:1px solid #eef2f6; white-space:nowrap; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#5b6b7c; background:#f7fafc; }
  tr:last-child td { border-bottom:none; }
  .name { font-weight:700; }
  .in { color:#1c7a4a; font-variant-numeric:tabular-nums; }
  .out { color:#41505f; font-variant-numeric:tabular-nums; }
  .still { color:#a2801f; font-weight:700; }
  .empty { padding:30px 12px; text-align:center; color:#7a8a99; }
  .error { color:#b3261e; padding:20px; }
  .skeleton { height:42px; border-radius:9px; background:#eef2f6; margin-bottom:7px; }
`;
document.head.appendChild(style);

function today() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

let date = today();

function report() { bridge.ui.resize(document.documentElement.scrollHeight); }

function escapeHtml(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function clock(iso) { return iso ? String(iso).slice(11, 16) : ""; }

async function load() {
  root.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  report();
  try {
    const result = await bridge.call("visits_for_date", { date });
    if (result && result.error) throw new Error(result.error);
    render(result);
  } catch (error) {
    root.innerHTML = `<div class="error">${escapeHtml(error.message || "Could not load the log.")}</div>`;
    report();
  }
}

function render(result) {
  const visits = (result && result.visits) || [];
  const body = visits.length
    ? visits.map(rowHtml).join("")
    : '<tr><td colspan="5" class="empty">No visitors recorded for this day.</td></tr>';

  root.innerHTML = `
    <div class="bar">
      <label><input type="date" id="date" value="${escapeHtml(date)}" max="${escapeHtml(today())}"></label>
      <span class="note">${visits.length} visitor(s)</span>
    </div>
    <div class="scroll">
      <table>
        <thead>
          <tr><th>Visitor</th><th>Purpose</th><th>Visiting</th><th>In</th><th>Out</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;

  const picker = document.getElementById("date");
  if (picker) picker.addEventListener("change", (e) => { date = e.target.value || today(); load(); });
  report();
}

function rowHtml(v) {
  return `
    <tr>
      <td class="name">${escapeHtml(v.visitor_name || "Visitor")}${v.phone ? `<div class="note">${escapeHtml(v.phone)}</div>` : ""}</td>
      <td>${escapeHtml(PURPOSE_LABEL[v.purpose] || v.purpose || "")}</td>
      <td>${escapeHtml(v.visiting || "")}</td>
      <td class="in">${clock(v.time_in)}</td>
      <td>${v.time_out ? `<span class="out">${clock(v.time_out)}</span>` : '<span class="still">still in</span>'}</td>
    </tr>
  `;
}

bridge.on("init", load);
if (bridge.context && bridge.context.appKey) load();
