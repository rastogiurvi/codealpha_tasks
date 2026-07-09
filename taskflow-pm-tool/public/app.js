/* =========================================================
   TaskFlow front-end (vanilla JS, no build step required)
   ========================================================= */

let token = localStorage.getItem('tf_token') || null;
let currentUser = JSON.parse(localStorage.getItem('tf_user') || 'null');
let socket = null;

let currentProject = null; // { project, members, tasks }
let editingTaskId = null; // null = creating a new task
let draggedTaskId = null;

/* ---------------- API helper ---------------- */
async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------------- Toasts ---------------- */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

/* ---------------- View switching ---------------- */
function showView(viewId) {
  ['auth-view', 'dashboard-view', 'board-view'].forEach((id) => {
    document.getElementById(id).classList.toggle('hidden', id !== viewId);
  });
  document.getElementById('app-header').classList.toggle('hidden', viewId === 'auth-view');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

document.querySelectorAll('[data-close-modal]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
});

/* ---------------- Auth ---------------- */
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const isLogin = btn.dataset.tab === 'login';
    document.getElementById('login-form').classList.toggle('hidden', !isLogin);
    document.getElementById('register-form').classList.toggle('hidden', isLogin);
  });
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    onAuthSuccess(data);
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  errEl.textContent = '';
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  try {
    const data = await api('/auth/register', { method: 'POST', body: { name, email, password } });
    onAuthSuccess(data);
  } catch (err) {
    errEl.textContent = err.message;
  }
});

function onAuthSuccess(data) {
  token = data.token;
  currentUser = data.user;
  localStorage.setItem('tf_token', token);
  localStorage.setItem('tf_user', JSON.stringify(currentUser));
  document.getElementById('user-name').textContent = currentUser.name;
  initSocket();
  showView('dashboard-view');
  loadProjects();
}

document.getElementById('logout-btn').addEventListener('click', () => {
  token = null;
  currentUser = null;
  localStorage.removeItem('tf_token');
  localStorage.removeItem('tf_user');
  if (socket) socket.disconnect();
  showView('auth-view');
});

/* ---------------- Socket.io realtime ---------------- */
function initSocket() {
  if (socket) socket.disconnect();
  socket = io({ auth: { token } });

  socket.on('connect_error', () => {
    showToast('Realtime connection failed (it will keep retrying)', 'error');
  });

  socket.on('notification', (n) => {
    showToast(n.message, 'info');
  });

  socket.on('task:created', (task) => {
    if (!currentProject || task.project_id !== currentProject.project.id) return;
    if (!currentProject.tasks.find((t) => t.id === task.id)) {
      currentProject.tasks.push(task);
      renderBoard();
    }
  });

  socket.on('task:updated', (task) => {
    if (!currentProject || task.project_id !== currentProject.project.id) return;
    const idx = currentProject.tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) currentProject.tasks[idx] = task;
    else currentProject.tasks.push(task);
    renderBoard();
    if (editingTaskId === task.id) populateTaskModal(task);
  });

  socket.on('task:deleted', ({ id, project_id }) => {
    if (!currentProject || project_id !== currentProject.project.id) return;
    currentProject.tasks = currentProject.tasks.filter((t) => t.id !== id);
    renderBoard();
    if (editingTaskId === id) closeModal('task-modal');
  });

  socket.on('member:added', (member) => {
    if (!currentProject) return;
    if (!currentProject.members.find((m) => m.id === member.id)) {
      currentProject.members.push(member);
      renderMembers();
      populateAssigneeSelect();
    }
  });

  socket.on('project:deleted', ({ projectId }) => {
    if (currentProject && currentProject.project.id === projectId) {
      showToast('This project was deleted by its owner', 'error');
      currentProject = null;
      showView('dashboard-view');
      loadProjects();
    }
  });

  socket.on('comment:created', (comment) => {
    if (!editingTaskId || comment.task_id !== editingTaskId) return;
    appendComment(comment);
  });
}

/* ---------------- Dashboard / Projects ---------------- */
async function loadProjects() {
  try {
    const { projects } = await api('/projects');
    const grid = document.getElementById('projects-grid');
    grid.innerHTML = '';
    document.getElementById('no-projects').classList.toggle('hidden', projects.length > 0);
    projects.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.innerHTML = `
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description || 'No description')}</p>
        <div class="meta">Owner: ${escapeHtml(p.owner_name)}</div>
      `;
      card.addEventListener('click', () => openProject(p.id));
      grid.appendChild(card);
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('new-project-btn').addEventListener('click', () => {
  document.getElementById('project-name').value = '';
  document.getElementById('project-desc').value = '';
  document.getElementById('project-error').textContent = '';
  openModal('project-modal');
});

document.getElementById('create-project-confirm').addEventListener('click', async () => {
  const name = document.getElementById('project-name').value.trim();
  const description = document.getElementById('project-desc').value.trim();
  const errEl = document.getElementById('project-error');
  if (!name) { errEl.textContent = 'Project name is required'; return; }
  try {
    const { project } = await api('/projects', { method: 'POST', body: { name, description } });
    closeModal('project-modal');
    showToast('Project created!', 'success');
    await loadProjects();
    openProject(project.id);
  } catch (err) {
    errEl.textContent = err.message;
  }
});

/* ---------------- Board ---------------- */
async function openProject(id) {
  try {
    const data = await api(`/projects/${id}`);
    currentProject = data;
    document.getElementById('board-title').textContent = data.project.name;
    socket.emit('join_project', id);
    showView('board-view');
    renderBoard();
    populateAssigneeSelect();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('back-to-dashboard').addEventListener('click', () => {
  if (currentProject) socket.emit('leave_project', currentProject.project.id);
  currentProject = null;
  showView('dashboard-view');
  loadProjects();
});

function renderBoard() {
  if (!currentProject) return;
  ['todo', 'in_progress', 'done'].forEach((status) => {
    const list = document.getElementById(`list-${status}`);
    list.innerHTML = '';
    const tasks = currentProject.tasks
      .filter((t) => t.status === status)
      .sort((a, b) => a.position - b.position);
    document.getElementById(`count-${status}`).textContent = tasks.length;
    tasks.forEach((task) => list.appendChild(renderTaskCard(task)));
  });
}

function renderTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.draggable = true;
  card.dataset.taskId = task.id;

  const dueBadge = task.due_date
    ? `<span class="due-badge">📅 ${escapeHtml(task.due_date)}</span>`
    : '<span></span>';
  const assigneeBadge = task.assignee_name
    ? `<span class="assignee-badge">${escapeHtml(task.assignee_name)}</span>`
    : '';

  card.innerHTML = `
    <h4>${escapeHtml(task.title)}</h4>
    <div class="task-card-meta">${dueBadge}${assigneeBadge}</div>
  `;

  card.addEventListener('click', () => openTaskModal(task));
  card.addEventListener('dragstart', () => {
    draggedTaskId = task.id;
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  return card;
}

document.querySelectorAll('.column').forEach((col) => {
  col.addEventListener('dragover', (e) => {
    e.preventDefault();
    col.classList.add('drag-over');
  });
  col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
  col.addEventListener('drop', async (e) => {
    e.preventDefault();
    col.classList.remove('drag-over');
    if (!draggedTaskId) return;
    const newStatus = col.dataset.status;
    const task = currentProject.tasks.find((t) => t.id === draggedTaskId);
    if (!task || task.status === newStatus) { draggedTaskId = null; return; }
    try {
      await api(`/tasks/${draggedTaskId}`, { method: 'PUT', body: { status: newStatus } });
    } catch (err) {
      showToast(err.message, 'error');
    }
    draggedTaskId = null;
  });
});

/* ---------------- Members ---------------- */
document.getElementById('members-btn').addEventListener('click', () => {
  renderMembers();
  document.getElementById('invite-email').value = '';
  document.getElementById('invite-error').textContent = '';
  openModal('members-modal');
});

function renderMembers() {
  const list = document.getElementById('members-list');
  list.innerHTML = '';
  currentProject.members.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `<span>${escapeHtml(m.name)} <span style="color:#9097a3">(${escapeHtml(m.email)})</span></span><span class="role">${escapeHtml(m.role)}</span>`;
    list.appendChild(row);
  });
}

document.getElementById('invite-confirm').addEventListener('click', async () => {
  const email = document.getElementById('invite-email').value.trim();
  const errEl = document.getElementById('invite-error');
  errEl.textContent = '';
  if (!email) { errEl.textContent = 'Enter an email address'; return; }
  try {
    const { member } = await api(`/projects/${currentProject.project.id}/members`, {
      method: 'POST',
      body: { email },
    });
    currentProject.members.push(member);
    renderMembers();
    populateAssigneeSelect();
    document.getElementById('invite-email').value = '';
    showToast(`${member.name} added to the project`, 'success');
  } catch (err) {
    errEl.textContent = err.message;
  }
});

function populateAssigneeSelect() {
  const select = document.getElementById('task-assignee');
  select.innerHTML = '<option value="">Unassigned</option>';
  currentProject.members.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    select.appendChild(opt);
  });
}

/* ---------------- Tasks ---------------- */
document.getElementById('add-task-btn').addEventListener('click', () => openTaskModal(null));

function openTaskModal(task) {
  editingTaskId = task ? task.id : null;
  document.getElementById('task-modal-title').textContent = task ? 'Edit Task' : 'New Task';
  document.getElementById('task-error').textContent = '';
  document.getElementById('delete-task-btn').classList.toggle('hidden', !task);
  document.getElementById('comments-section').classList.toggle('hidden', !task);

  if (task) {
    populateTaskModal(task);
    loadComments(task.id);
  } else {
    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-status').value = 'todo';
    document.getElementById('task-assignee').value = '';
    document.getElementById('task-due').value = '';
  }
  openModal('task-modal');
}

function populateTaskModal(task) {
  document.getElementById('task-title').value = task.title;
  document.getElementById('task-desc').value = task.description || '';
  document.getElementById('task-status').value = task.status;
  document.getElementById('task-assignee').value = task.assignee_id || '';
  document.getElementById('task-due').value = task.due_date || '';
}

document.getElementById('save-task-btn').addEventListener('click', async () => {
  const title = document.getElementById('task-title').value.trim();
  const description = document.getElementById('task-desc').value.trim();
  const status = document.getElementById('task-status').value;
  const assignee_id = document.getElementById('task-assignee').value || null;
  const due_date = document.getElementById('task-due').value || null;
  const errEl = document.getElementById('task-error');
  errEl.textContent = '';
  if (!title) { errEl.textContent = 'Title is required'; return; }

  try {
    if (editingTaskId) {
      await api(`/tasks/${editingTaskId}`, {
        method: 'PUT',
        body: { title, description, status, assignee_id, due_date },
      });
    } else {
      await api(`/projects/${currentProject.project.id}/tasks`, {
        method: 'POST',
        body: { title, description, status, assignee_id, due_date },
      });
    }
    closeModal('task-modal');
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('delete-task-btn').addEventListener('click', async () => {
  if (!editingTaskId) return;
  if (!confirm('Delete this task?')) return;
  try {
    await api(`/tasks/${editingTaskId}`, { method: 'DELETE' });
    closeModal('task-modal');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

/* ---------------- Comments ---------------- */
async function loadComments(taskId) {
  const list = document.getElementById('comments-list');
  list.innerHTML = '<p style="color:#9097a3;font-size:13px;">Loading...</p>';
  try {
    const { comments } = await api(`/tasks/${taskId}/comments`);
    list.innerHTML = '';
    comments.forEach((c) => appendComment(c));
  } catch (err) {
    list.innerHTML = `<p style="color:#e5484d;font-size:13px;">${escapeHtml(err.message)}</p>`;
  }
}

function appendComment(comment) {
  const list = document.getElementById('comments-list');
  const el = document.createElement('div');
  el.className = 'comment-item';
  const when = new Date(comment.created_at).toLocaleString();
  el.innerHTML = `<div class="comment-meta">${escapeHtml(comment.user_name)} · ${when}</div>${escapeHtml(comment.content)}`;
  list.appendChild(el);
  list.scrollTop = list.scrollHeight;
}

document.getElementById('comment-send-btn').addEventListener('click', sendComment);
document.getElementById('comment-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendComment();
});

async function sendComment() {
  if (!editingTaskId) return;
  const input = document.getElementById('comment-input');
  const content = input.value.trim();
  if (!content) return;
  try {
    await api(`/tasks/${editingTaskId}/comments`, { method: 'POST', body: { content } });
    input.value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ---------------- Utils ---------------- */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------------- Boot ---------------- */
(function boot() {
  if (token && currentUser) {
    document.getElementById('user-name').textContent = currentUser.name;
    initSocket();
    showView('dashboard-view');
    loadProjects();
  } else {
    showView('auth-view');
  }
})();
