const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/tasks/:taskId/comments', (req, res) => {
  const { taskId } = req.params;
  const task = db.tasks.findById(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!db.members.isMember(task.project_id, req.user.id)) {
    return res.status(403).json({ error: 'Not a member of this project' });
  }
  res.json({ comments: db.comments.listForTask(taskId) });
});

router.post('/tasks/:taskId/comments', (req, res) => {
  const { taskId } = req.params;
  const { content } = req.body;
  const task = db.tasks.findById(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!db.members.isMember(task.project_id, req.user.id)) {
    return res.status(403).json({ error: 'Not a member of this project' });
  }
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment content is required' });

  const comment = db.comments.create({ task_id: taskId, user_id: req.user.id, content: content.trim() });

  const io = req.app.get('io');
  io.to(`project_${task.project_id}`).emit('comment:created', comment);

  const notifyTargets = new Set();
  if (task.assignee_id && task.assignee_id !== req.user.id) notifyTargets.add(task.assignee_id);
  if (task.created_by !== req.user.id) notifyTargets.add(task.created_by);
  notifyTargets.forEach((uid) => {
    io.to(`user_${uid}`).emit('notification', {
      type: 'new_comment',
      message: `New comment on task: "${task.title}"`,
      projectId: task.project_id,
      taskId: task.id,
    });
  });

  res.json({ comment });
});

module.exports = router;
