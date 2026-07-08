const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Create a task inside a project
router.post('/projects/:projectId/tasks', (req, res) => {
  const { projectId } = req.params;
  const { title, description, status, assignee_id, due_date } = req.body;
  if (!db.members.isMember(projectId, req.user.id)) {
    return res.status(403).json({ error: 'Not a member of this project' });
  }
  if (!title || !title.trim()) return res.status(400).json({ error: 'Task title is required' });

  const task = db.tasks.create({
    project_id: projectId,
    title: title.trim(),
    description,
    status,
    assignee_id,
    due_date,
    created_by: req.user.id,
  });

  const io = req.app.get('io');
  io.to(`project_${projectId}`).emit('task:created', task);
  if (task.assignee_id && task.assignee_id !== req.user.id) {
    io.to(`user_${task.assignee_id}`).emit('notification', {
      type: 'task_assigned',
      message: `You were assigned a task: "${task.title}"`,
      projectId: Number(projectId),
      taskId: task.id,
    });
  }
  res.json({ task });
});

// Update a task (title, description, status, assignee, due_date, position)
router.put('/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const existing = db.tasks.findById(taskId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  if (!db.members.isMember(existing.project_id, req.user.id)) {
    return res.status(403).json({ error: 'Not a member of this project' });
  }

  const allowedFields = ['title', 'description', 'status', 'assignee_id', 'due_date', 'position'];
  const updates = {};
  allowedFields.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  const updated = db.tasks.update(taskId, updates);

  const io = req.app.get('io');
  io.to(`project_${updated.project_id}`).emit('task:updated', updated);
  if (
    req.body.assignee_id &&
    Number(req.body.assignee_id) !== req.user.id &&
    Number(req.body.assignee_id) !== existing.assignee_id
  ) {
    io.to(`user_${req.body.assignee_id}`).emit('notification', {
      type: 'task_assigned',
      message: `You were assigned a task: "${updated.title}"`,
      projectId: updated.project_id,
      taskId: updated.id,
    });
  }
  res.json({ task: updated });
});

// Delete a task
router.delete('/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const task = db.tasks.findById(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!db.members.isMember(task.project_id, req.user.id)) {
    return res.status(403).json({ error: 'Not a member of this project' });
  }
  db.tasks.delete(taskId);
  const io = req.app.get('io');
  io.to(`project_${task.project_id}`).emit('task:deleted', { id: Number(taskId), project_id: task.project_id });
  res.json({ success: true });
});

module.exports = router;
