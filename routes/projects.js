const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// List projects the current user belongs to
router.get('/', (req, res) => {
  res.json({ projects: db.projects.listForUser(req.user.id) });
});

// Create a new project (creator becomes owner + member)
router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });
  const project = db.projects.create({ name, description, owner_id: req.user.id });
  db.members.add(project.id, req.user.id, 'owner');
  res.json({ project });
});

// Get a project with its members and tasks
router.get('/:id', (req, res) => {
  const projectId = req.params.id;
  if (!db.members.isMember(projectId, req.user.id)) {
    return res.status(403).json({ error: 'Not a member of this project' });
  }
  const project = db.projects.findById(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const members = db.members.listForProject(projectId);
  const tasks = db.tasks.listForProject(projectId);
  res.json({ project, members, tasks });
});

// Invite / add a member by email
router.post('/:id/members', (req, res) => {
  const projectId = req.params.id;
  const { email } = req.body;
  if (!db.members.isMember(projectId, req.user.id)) {
    return res.status(403).json({ error: 'Not a member of this project' });
  }
  const user = db.users.findByEmail((email || '').toLowerCase());
  if (!user) return res.status(404).json({ error: 'No registered user found with that email' });
  if (db.members.isMember(projectId, user.id)) {
    return res.status(409).json({ error: 'User is already a member of this project' });
  }
  db.members.add(projectId, user.id, 'member');
  const member = { id: user.id, name: user.name, email: user.email, role: 'member' };
  const io = req.app.get('io');
  io.to(`project_${projectId}`).emit('member:added', member);
  io.to(`user_${user.id}`).emit('notification', {
    type: 'added_to_project',
    message: 'You were added to a new project',
    projectId: Number(projectId),
  });
  res.json({ member });
});

// Delete a project (owner only)
router.delete('/:id', (req, res) => {
  const projectId = req.params.id;
  const project = db.projects.findById(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (project.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the project owner can delete this project' });
  }
  db.projects.delete(projectId);
  const io = req.app.get('io');
  io.to(`project_${projectId}`).emit('project:deleted', { projectId: Number(projectId) });
  res.json({ success: true });
});

module.exports = router;
