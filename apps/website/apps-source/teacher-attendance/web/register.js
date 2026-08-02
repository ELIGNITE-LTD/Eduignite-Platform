/**
 * Teacher Attendance — Daily Register.
 *
 * Plain ES module, no build step. It runs inside the EduIgnite frame, which
 * has no network access, so everything goes through `window.eduignite`.
 *
 * Written to be usable on a phone over a bad connection: the whole register
 * loads in one call, marking is a single tap, and each row reports its own
 * state so a failure never leaves you guessing which one did not save.
 */

const bridge = window.eduignite;
const root = document.getElementById("root");

const STATUSES = [
  { key: "present", label: "Present" },
  { key: "late", label: "Late" },
  { key: "absent", label: "Absent" },
  { key: "excused", label: "Excused" },
];

const style = document.createElement("style");
style.textContent = `
  :root { color-scheme: light; }
  body { color: #1f2b38; font-size: 14px; }
  .bar { display:flex; flex-wrap:wrap; gap:10px; align-items:center;
         justify-content:space-between; margin-bottom:14px; }
  .count { font-size:12px; font-weight:700; color:#5b6b7c; }
  input[type=date] { font:inherit; padding:7px 10px; border:1px solid #d8e0e8;
                     border-radius:9px; background:#fff; }
  .row { display:flex; flex-wrap:wrap; gap:10px; align-items:center;
         padding:11px 12px; border:1px solid #e6ecf2; border-radius:12px;
         background:#fff; margin-bottom:8px; }
  .who { flex:1 1 190px; min-width:0; }
  .name { font-weight:700; }
  .role { font-size:11px; color:#7a8a99; text-transform:uppercase;
          letter-spacing:.06em; }
  .picks { display:flex; gap:6px; flex-wrap:wrap; }
  button.pick { font:inherit; font-size:12px; font-weight:700; cursor:pointer;
                padding:6px 11px; border-radius:999px; border:1px solid #d8e0e8;
                background:#fff; color:#41505f; }
  button.pick[aria-pressed="true"] { background:#264D73; border-color:#264D73; color:#fff; }
  button.pick:disabled { opacity:.5; cursor:default; }
  .state { font-size:11px; font-weight:700; min-width:52px; text-align:right; }
  .state.saving { color:#a2801f; }
  .state.saved  { color:#1c7a4a; }
  .state.failed { color:#b3261e; }
  .empty, .error { padding:34px 14px; text-align:center; color:#5b6b7c; }
  .error { color:#b3261e; }
  .skeleton { height:56px; border-radius:12px; background:#eef2f6; margin-bottom:8px; }
`;
document.head.appendChild(style);

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

let date = today();
let entries = [];

function report() {
  bridge.ui.resize(document.documentElement.scrollHeight);
}

function renderSkeleton() {
  root.innerHTML =
    '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  report();
}

async function load() {
  renderSkeleton();
  try {
    const result = await bridge.call("register_for_day", { date });
    if (result && result.error) throw new Error(result.error);
    entries = (result && result.entries) || [];
    render(result);
  } catch (error) {
    root.innerHTML = `<div class="error">${escapeHtml(error.message || "Could not load the register.")}</div>`;
    report();
  }
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function render(result) {
  const marked = (result && result.marked) || 0;
  const total = (result && result.total) || entries.length;

  const rows = entries.length
    ? entries.map(rowHtml).join("")
    : '<div class="empty">No staff found for this school.</div>';

  root.innerHTML = `
    <div class="bar">
      <label>
        <input type="date" id="date" value="${escapeHtml(date)}" max="${escapeHtml(today())}">
      </label>
      <span class="count">${marked} of ${total} marked</span>
    </div>
    ${rows}
  `;

  const picker = document.getElementById("date");
  if (picker) {
    picker.addEventListener("change", (event) => {
      date = event.target.value || today();
      load();
    });
  }

  root.querySelectorAll("button.pick").forEach((button) => {
    button.addEventListener("click", () => mark(button));
  });

  report();
}

function rowHtml(entry) {
  const picks = STATUSES.map(
    (status) =>
      `<button class="pick" type="button" data-teacher="${escapeHtml(entry.teacher)}"
         data-status="${status.key}" aria-pressed="${entry.status === status.key}">
         ${status.label}
       </button>`
  ).join("");

  return `
    <div class="row" data-row="${escapeHtml(entry.teacher)}">
      <div class="who">
        <div class="name">${escapeHtml(entry.name || "Unnamed")}</div>
        <div class="role">${escapeHtml(entry.role || "")}</div>
      </div>
      <div class="picks">${picks}</div>
      <div class="state" data-state="${escapeHtml(entry.teacher)}"></div>
    </div>
  `;
}

async function mark(button) {
  const teacher = button.dataset.teacher;
  const status = button.dataset.status;
  const row = root.querySelector(`[data-row="${CSS.escape(teacher)}"]`);
  const state = root.querySelector(`[data-state="${CSS.escape(teacher)}"]`);
  if (!row || !state) return;

  const buttons = row.querySelectorAll("button.pick");
  buttons.forEach((other) => {
    other.disabled = true;
    other.setAttribute("aria-pressed", String(other === button));
  });
  state.className = "state saving";
  state.textContent = "Saving";

  let minutesLate = 0;
  if (status === "late") {
    const asked = window.prompt("How many minutes late?", "10");
    if (asked === null) {
      buttons.forEach((other) => (other.disabled = false));
      state.textContent = "";
      restore(teacher);
      return;
    }
    minutesLate = Math.max(parseInt(asked, 10) || 0, 0);
  }

  try {
    const result = await bridge.call("mark", {
      date, teacher, status, minutes_late: minutesLate,
    });
    if (result && result.error) throw new Error(result.error);

    const entry = entries.find((item) => item.teacher === teacher);
    if (entry) {
      const wasUnmarked = !entry.status;
      entry.status = status;
      entry.minutes_late = minutesLate;
      if (wasUnmarked) bumpCount();
    }

    state.className = "state saved";
    // A write made offline is queued, not lost; say which happened.
    state.textContent = result && result.queued ? "Queued" : "Saved";
  } catch (error) {
    state.className = "state failed";
    state.textContent = "Failed";
    bridge.ui.toast(error.message || "Could not save that.");
    restore(teacher);
  } finally {
    buttons.forEach((other) => (other.disabled = false));
    report();
  }
}

function restore(teacher) {
  const entry = entries.find((item) => item.teacher === teacher);
  const row = root.querySelector(`[data-row="${CSS.escape(teacher)}"]`);
  if (!entry || !row) return;
  row.querySelectorAll("button.pick").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.status === entry.status));
  });
}

function bumpCount() {
  const counter = root.querySelector(".count");
  if (!counter) return;
  const marked = entries.filter((entry) => entry.status).length;
  counter.textContent = `${marked} of ${entries.length} marked`;
}

bridge.on("init", load);
if (bridge.context && bridge.context.appKey) load();
