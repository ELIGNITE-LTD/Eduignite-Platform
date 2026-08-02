/**
 * Front Desk — Reception Desk.
 *
 * Sign a visitor in, see who is currently in the building, sign them out.
 * Runs inside the EduIgnite frame with no network access; everything goes
 * through window.eduignite.
 */

const bridge = window.eduignite;
const root = document.getElementById("root");

const PURPOSES = [
  { key: "parent", label: "Parent / guardian" },
  { key: "official", label: "Official" },
  { key: "supplier", label: "Supplier" },
  { key: "interview", label: "Interview" },
  { key: "other", label: "Other" },
];

const style = document.createElement("style");
style.textContent = `
  :root { color-scheme: light; }
  body { color:#1f2b38; font-size:14px; }
  .grid { display:grid; gap:16px; grid-template-columns:1fr; }
  @media (min-width:720px){ .grid { grid-template-columns: 300px 1fr; } }
  .card { border:1px solid #e6ecf2; border-radius:14px; background:#fff; padding:16px; }
  h2 { margin:0 0 12px; font-size:14px; text-transform:uppercase; letter-spacing:.06em; color:#5b6b7c; }
  label { display:block; font-size:12px; font-weight:700; color:#41505f; margin:10px 0 4px; }
  input, select { width:100%; box-sizing:border-box; font:inherit; padding:9px 10px;
                  border:1px solid #d8e0e8; border-radius:9px; background:#fff; }
  button.primary { margin-top:14px; width:100%; font:inherit; font-weight:800; cursor:pointer;
                   padding:11px; border:none; border-radius:10px; background:#264D73; color:#fff; }
  button.primary:disabled { opacity:.6; cursor:default; }
  .count { font-size:12px; font-weight:700; color:#5b6b7c; margin-bottom:8px; }
  .visit { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between;
           padding:11px 12px; border:1px solid #e6ecf2; border-radius:12px; margin-bottom:8px; }
  .visit.open { border-color:#bfe3cf; background:#f4fbf7; }
  .who { min-width:0; }
  .name { font-weight:700; }
  .meta { font-size:12px; color:#7a8a99; }
  .times { font-size:12px; color:#41505f; text-align:right; white-space:nowrap; }
  button.out { font:inherit; font-size:12px; font-weight:700; cursor:pointer; padding:6px 12px;
               border-radius:999px; border:1px solid #264D73; background:#fff; color:#264D73; }
  button.out:disabled { opacity:.5; cursor:default; }
  .empty { padding:26px 12px; text-align:center; color:#7a8a99; }
  .error { color:#b3261e; }
  .skeleton { height:52px; border-radius:12px; background:#eef2f6; margin-bottom:8px; }
`;
document.head.appendChild(style);

let visits = [];
let submitting = false;

function report() { bridge.ui.resize(document.documentElement.scrollHeight); }

function escapeHtml(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function clock(iso) {
  if (!iso) return "";
  const t = String(iso).slice(11, 16);
  return t || "";
}

async function load() {
  render(true);
  try {
    const result = await bridge.call("todays_visits", {});
    if (result && result.error) throw new Error(result.error);
    visits = (result && result.visits) || [];
    render(false);
  } catch (error) {
    root.innerHTML = `<div class="error">${escapeHtml(error.message || "Could not load the desk.")}</div>`;
    report();
  }
}

function render(loading) {
  const open = visits.filter((v) => !v.time_out).length;

  const list = loading
    ? '<div class="skeleton"></div><div class="skeleton"></div>'
    : visits.length
      ? visits.map(visitHtml).join("")
      : '<div class="empty">No visitors signed in today.</div>';

  root.innerHTML = `
    <div class="grid">
      <div class="card">
        <h2>Sign a visitor in</h2>
        <label>Visitor name</label>
        <input id="visitor_name" placeholder="Full name" autocomplete="off">
        <label>Phone (optional)</label>
        <input id="phone" placeholder="6xx xxx xxx" inputmode="tel" autocomplete="off">
        <label>Purpose</label>
        <select id="purpose">
          <option value="">Choose…</option>
          ${PURPOSES.map((p) => `<option value="${p.key}">${p.label}</option>`).join("")}
        </select>
        <label>Visiting (office / person)</label>
        <input id="visiting" placeholder="e.g. Bursar's office" autocomplete="off">
        <button class="primary" id="signin" ${submitting ? "disabled" : ""}>
          ${submitting ? "Signing in…" : "Sign in"}
        </button>
      </div>

      <div>
        <div class="count">${open} in the building • ${visits.length} today</div>
        ${list}
      </div>
    </div>
  `;

  const signin = document.getElementById("signin");
  if (signin) signin.addEventListener("click", onSignIn);

  root.querySelectorAll("button.out").forEach((button) =>
    button.addEventListener("click", () => onSignOut(button.dataset.id))
  );

  report();
}

function visitHtml(visit) {
  const isOpen = !visit.time_out;
  const purpose = (PURPOSES.find((p) => p.key === visit.purpose) || {}).label || visit.purpose || "";
  return `
    <div class="visit ${isOpen ? "open" : ""}">
      <div class="who">
        <div class="name">${escapeHtml(visit.visitor_name || "Visitor")}</div>
        <div class="meta">${escapeHtml(purpose)}${visit.visiting ? " • " + escapeHtml(visit.visiting) : ""}</div>
      </div>
      <div class="times">
        In ${clock(visit.time_in)}${visit.time_out ? " · Out " + clock(visit.time_out) : ""}
      </div>
      ${isOpen
        ? `<button class="out" data-id="${escapeHtml(visit.id)}">Sign out</button>`
        : ""}
    </div>
  `;
}

async function onSignIn() {
  if (submitting) return;
  const value = (id) => (document.getElementById(id) || {}).value || "";
  const body = {
    visitor_name: value("visitor_name").trim(),
    phone: value("phone").trim(),
    purpose: value("purpose"),
    visiting: value("visiting").trim(),
  };
  if (!body.visitor_name) { bridge.ui.toast("Enter a visitor name."); return; }
  if (!body.purpose) { bridge.ui.toast("Choose a purpose."); return; }

  submitting = true;
  render(false);
  try {
    const result = await bridge.call("sign_in", body);
    if (result && result.error) throw new Error(result.error);
    if (result && result.visit) visits.unshift(result.visit);
    bridge.ui.toast(result && result.visit && result.visit.id && result.queued ? "Queued (offline)" : "Signed in");
  } catch (error) {
    bridge.ui.toast(error.message || "Could not sign that visitor in.");
  } finally {
    submitting = false;
    render(false);
  }
}

async function onSignOut(id) {
  if (!id) return;
  const button = root.querySelector(`button.out[data-id="${CSS.escape(id)}"]`);
  if (button) { button.disabled = true; button.textContent = "…"; }
  try {
    const result = await bridge.call("sign_out", { id });
    if (result && result.error) throw new Error(result.error);
    const visit = visits.find((v) => v.id === id);
    if (visit && result.visit) visit.time_out = result.visit.time_out;
    render(false);
  } catch (error) {
    bridge.ui.toast(error.message || "Could not sign that visitor out.");
    if (button) { button.disabled = false; button.textContent = "Sign out"; }
  }
}

bridge.on("init", load);
if (bridge.context && bridge.context.appKey) load();
