// Sorta: notes stored as Markdown files in a private GitHub repo.
// Reads use one GraphQL query; writes use the REST contents API (one commit per save).

const NOTES_DIR = "notes";
const SAVE_DELAY_MS = 1500;
const CONFIG_KEY = "sorta.config";
const CACHE_KEY = "sorta.cache";

const $ = (id) => document.getElementById(id);

let config = loadJSON(CONFIG_KEY);
let notes = loadJSON(CACHE_KEY) || []; // [{ path, sha, text }]
let current = null;                    // note open in the editor
let saveTimer = null;
let saving = Promise.resolve();

// ---------- storage helpers ----------

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ---------- GitHub API ----------

async function gh(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.message || `GitHub error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function fetchNotes() {
  const query = `query($owner: String!, $repo: String!, $expr: String!) {
    repository(owner: $owner, name: $repo) {
      object(expression: $expr) {
        ... on Tree { entries { path oid object { ... on Blob { text } } } }
      }
    }
  }`;
  const data = await gh("/graphql", {
    method: "POST",
    body: JSON.stringify({
      query,
      variables: { owner: config.owner, repo: config.repo, expr: `HEAD:${NOTES_DIR}` },
    }),
  });
  if (data.errors) throw new Error(data.errors[0].message);
  if (!data.data.repository) throw new Error("Repo not found, or the token can't access it.");
  const entries = data.data.repository.object?.entries || [];
  return entries
    .filter((e) => e.path.endsWith(".md"))
    .map((e) => ({ path: e.path, sha: e.oid, text: e.object?.text ?? "" }));
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function putNote(note) {
  const body = {
    message: `Update ${titleOf(note)}`,
    content: toBase64(note.text),
    ...(note.sha ? { sha: note.sha } : {}),
  };
  const res = await gh(`/repos/${config.owner}/${config.repo}/contents/${note.path}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  note.sha = res.content.sha;
}

async function deleteNote(note) {
  await gh(`/repos/${config.owner}/${config.repo}/contents/${note.path}`, {
    method: "DELETE",
    body: JSON.stringify({ message: `Delete ${titleOf(note)}`, sha: note.sha }),
  });
}

// ---------- notes ----------

function titleOf(note) {
  return note.text.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").trim() || "Untitled";
}

function createdAt(note) {
  const ms = parseInt(note.path.split("/").pop(), 36);
  return isNaN(ms) ? 0 : ms;
}

async function refresh() {
  setStatus("Syncing…");
  try {
    notes = await fetchNotes();
    saveJSON(CACHE_KEY, notes);
    setStatus("");
  } catch (e) {
    setStatus(`Couldn't sync: ${e.message}`);
  }
  renderList();
}

// ---------- views ----------

function show(viewId) {
  for (const id of ["setup", "list", "editor"]) $(id).hidden = id !== viewId;
}

function setStatus(msg) { $("status").textContent = msg; }

function renderList() {
  const q = $("search").value.toLowerCase();
  const ul = $("notes");
  ul.replaceChildren();
  const visible = notes
    .filter((n) => !q || n.text.toLowerCase().includes(q))
    .sort((a, b) => createdAt(b) - createdAt(a));
  for (const note of visible) {
    const li = document.createElement("li");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = titleOf(note);
    const meta = document.createElement("div");
    meta.className = "meta";
    const ms = createdAt(note);
    meta.textContent = ms ? new Date(ms).toLocaleString() : "";
    li.append(title, meta);
    li.onclick = () => openNote(note);
    ul.append(li);
  }
  if (!visible.length) {
    const li = document.createElement("li");
    li.className = "meta";
    li.textContent = q ? "No matches." : "No notes yet. Tap + New.";
    ul.append(li);
  }
}

function openNote(note) {
  current = note;
  $("text").value = note.text;
  $("save-state").textContent = "";
  show("editor");
  $("text").focus();
}

function newNote() {
  const note = { path: `${NOTES_DIR}/${Date.now().toString(36)}.md`, sha: null, text: "" };
  openNote(note);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  $("save-state").textContent = "Editing…";
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

function saveNow() {
  clearTimeout(saveTimer);
  const note = current;
  if (!note || note.text === $("text").value) return saving;
  note.text = $("text").value;
  if (!notes.includes(note)) notes.push(note);
  saveJSON(CACHE_KEY, notes);

  // Chain saves so two PUTs for the same file never race.
  saving = saving.then(async () => {
    $("save-state").textContent = "Saving…";
    try {
      await putNote(note);
      saveJSON(CACHE_KEY, notes);
      $("save-state").textContent = "Saved";
    } catch (e) {
      $("save-state").textContent =
        e.status === 409 || e.status === 422
          ? "Changed on another device — go back and refresh"
          : `Not saved: ${e.message}`;
    }
  });
  return saving;
}

// ---------- wiring ----------

$("setup-form").onsubmit = async (ev) => {
  ev.preventDefault();
  const form = new FormData(ev.target);
  config = {
    owner: form.get("owner").trim(),
    repo: form.get("repo").trim(),
    token: form.get("token").trim(),
  };
  $("setup-error").textContent = "";
  try {
    notes = await fetchNotes();
  } catch (e) {
    $("setup-error").textContent = e.message;
    return;
  }
  saveJSON(CONFIG_KEY, config);
  saveJSON(CACHE_KEY, notes);
  show("list");
  renderList();
};

$("new-note").onclick = newNote;
$("refresh").onclick = refresh;
$("search").oninput = renderList;
$("text").oninput = scheduleSave;

$("back").onclick = async () => {
  await saveNow();
  current = null;
  show("list");
  renderList();
};

$("delete").onclick = async () => {
  if (!current || !confirm(`Delete "${titleOf(current)}"?`)) return;
  clearTimeout(saveTimer);
  await saving;
  try {
    if (current.sha) await deleteNote(current);
  } catch (e) {
    alert(`Couldn't delete: ${e.message}`);
    return;
  }
  notes = notes.filter((n) => n !== current);
  saveJSON(CACHE_KEY, notes);
  current = null;
  show("list");
  renderList();
};

$("disconnect").onclick = () => {
  if (!confirm("Remove the token and cached notes from this device?")) return;
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(CACHE_KEY);
  location.reload();
};

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); saveNow(); }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveNow();
});
window.addEventListener("focus", () => { if (!$("list").hidden) refresh(); });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

if (config) {
  show("list");
  renderList();
  refresh();
} else {
  show("setup");
}
