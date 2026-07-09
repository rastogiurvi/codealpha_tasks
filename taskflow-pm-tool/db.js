/*
 * Lightweight JSON-file datastore.
 * No native dependencies (unlike sqlite3 drivers) so `npm install` always
 * works, on any OS, with no build tools required. Good enough for an
 * internship-scale project. Data is persisted to data.json on every write.
 */
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

function loadData() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
      console.error('Could not parse data.json, starting with a fresh database:', e.message);
    }
  }
  return {
    users: [],
    projects: [],
    project_members: [],
    tasks: [],
    comments: [],
    counters: { users: 0, projects: 0, tasks: 0, comments: 0 },
  };
}

const data = loadData();

function persist() {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function nextId(key) {
  data.counters[key] = (data.counters[key] || 0) + 1;
  return data.counters[key];
}

function nowISO() {
  return new Date().toISOString();
}

/* ---------------- Users ---------------- */
const users = {
  create({ name, email, password_hash }) {
    const user = { id: nextId('users'), name, email, password_hash, created_at: nowISO() };
    data.users.push(user);
    persist();
    return user;
  },
  findByEmail(email) {
    return data.users.find((u) => u.email === email) || null;
  },
  findById(id) {
    return data.users.find((u) => u.id === Number(id)) || null;
  },
};

/* ---------------- Projects ---------------- */
const projects = {
  create({ name, description, owner_id }) {
    const project = {
      id: nextId('projects'),
      name,
      description: description || '',
      owner_id: Number(owner_id),
      created_at: nowISO(),
    };
    data.projects.push(project);
    persist();
    return project;
  },
  findById(id) {
    return data.projects.find((p) => p.id === Number(id)) || null;
  },
  listForUser(userId) {
    const myProjectIds = data.project_members
      .filter((m) => m.user_id === Number(userId))
      .map((m) => m.project_id);
    return data.projects
      .filter((p) => myProjectIds.includes(p.id))
      .map((p) => {
        const owner = users.findById(p.owner_id);
        return { ...p, owner_name: owner ? owner.name : 'Unknown' };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },
  delete(id) {
    const pid = Number(id);
    const taskIds = data.tasks.filter((t) => t.project_id === pid).map((t) => t.id);
    data.projects = data.projects.filter((p) => p.id !== pid);
    data.project_members = data.project_members.filter((m) => m.project_id !== pid);
    data.tasks = data.tasks.filter((t) => t.project_id !== pid);
    data.comments = data.comments.filter((c) => !taskIds.includes(c.task_id));
    persist();
  },
};

/* ---------------- Project members ---------------- */
const members = {
  add(project_id, user_id, role = 'member') {
    const m = { project_id: Number(project_id), user_id: Number(user_id), role };
    data.project_members.push(m);
    persist();
    return m;
  },
  isMember(project_id, user_id) {
    return !!data.project_members.find(
      (m) => m.project_id === Number(project_id) && m.user_id === Number(user_id)
    );
  },
  listForProject(project_id) {
    return data.project_members
      .filter((m) => m.project_id === Number(project_id))
      .map((m) => {
        const u = users.findById(m.user_id);
        return u ? { id: u.id, name: u.name, email: u.email, role: m.role } : null;
      })
      .filter(Boolean);
  },
};

/* ---------------- Tasks ---------------- */
function hydrateTask(t) {
  const assignee = t.assignee_id ? users.findById(t.assignee_id) : null;
  return { ...t, assignee_name: assignee ? assignee.name : null };
}

const tasks = {
  create({ project_id, title, description, status, assignee_id, due_date, created_by }) {
    const statusVal = status || 'todo';
    const siblings = data.tasks.filter(
      (t) => t.project_id === Number(project_id) && t.status === statusVal
    );
    const maxPos = siblings.reduce((m, t) => Math.max(m, t.position || 0), 0);
    const task = {
      id: nextId('tasks'),
      project_id: Number(project_id),
      title,
      description: description || '',
      status: statusVal,
      assignee_id: assignee_id ? Number(assignee_id) : null,
      due_date: due_date || null,
      created_by: Number(created_by),
      position: maxPos + 1,
      created_at: nowISO(),
    };
    data.tasks.push(task);
    persist();
    return hydrateTask(task);
  },
  findById(id) {
    return data.tasks.find((t) => t.id === Number(id)) || null;
  },
  update(id, fields) {
    const t = data.tasks.find((t) => t.id === Number(id));
    if (!t) return null;
    Object.keys(fields).forEach((key) => {
      let val = fields[key];
      if (key === 'assignee_id') val = val ? Number(val) : null;
      t[key] = val;
    });
    persist();
    return hydrateTask(t);
  },
  delete(id) {
    const tid = Number(id);
    data.tasks = data.tasks.filter((t) => t.id !== tid);
    data.comments = data.comments.filter((c) => c.task_id !== tid);
    persist();
  },
  listForProject(project_id) {
    return data.tasks
      .filter((t) => t.project_id === Number(project_id))
      .map(hydrateTask)
      .sort((a, b) => a.position - b.position || new Date(a.created_at) - new Date(b.created_at));
  },
};

/* ---------------- Comments ---------------- */
function hydrateComment(c) {
  const u = users.findById(c.user_id);
  return { ...c, user_name: u ? u.name : 'Unknown' };
}

const comments = {
  create({ task_id, user_id, content }) {
    const c = {
      id: nextId('comments'),
      task_id: Number(task_id),
      user_id: Number(user_id),
      content,
      created_at: nowISO(),
    };
    data.comments.push(c);
    persist();
    return hydrateComment(c);
  },
  listForTask(task_id) {
    return data.comments
      .filter((c) => c.task_id === Number(task_id))
      .map(hydrateComment)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  },
};

module.exports = { users, projects, members, tasks, comments };
