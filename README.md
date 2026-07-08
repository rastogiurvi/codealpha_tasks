# TaskFlow — Collaborative Project Management Tool

A full-stack Trello/Asana-style app: users register, create projects, invite
teammates, organize tasks on a drag-and-drop board, and comment on tasks —
all with live, real-time updates over WebSockets.

## Stack
- **Backend:** Node.js + Express, JWT auth, bcrypt password hashing, Socket.io
- **Database:** a tiny dependency-free JSON-file datastore (`db.js` + `data.json`) —
  no native modules to install, works the same on Windows/Mac/Linux out of the box.
  (See "Swapping in a real database" below if you want Postgres/MySQL for production.)
- **Frontend:** plain HTML/CSS/JavaScript (no build step, no framework) — served
  directly by the same Express server, so there's only one thing to run.

## Features
- Register / login with hashed passwords + JWT sessions
- Create projects, invite teammates by email
- Trello-style board with 3 columns (To Do / In Progress / Done), drag-and-drop
- Create, edit, assign, set due dates, and delete tasks
- Comment threads on each task
- **Real-time:** task moves, new tasks, new comments and new members appear
  instantly for everyone viewing the board (Socket.io)
- **Notifications:** toast pop-ups when you're added to a project, assigned a
  task, or someone comments on your task

---

## Baby steps: how to run it

### 1. Install Node.js
Download and install from https://nodejs.org (the LTS version). To check it
worked, open a terminal and run:
```
node -v
npm -v
```
You should see version numbers, not an error.

### 2. Unzip the project
Unzip the folder you downloaded anywhere on your computer, e.g. `Desktop/pm-tool`.

### 3. Open a terminal in that folder
- **Mac:** right-click the folder → "New Terminal at Folder" (or `cd ~/Desktop/pm-tool`)
- **Windows:** open the folder in File Explorer, type `cmd` in the address bar and hit Enter
- **VS Code:** open the folder, then Terminal → New Terminal

### 4. Install dependencies
```
npm install
```
This downloads everything listed in `package.json` into a `node_modules` folder.
It only uses pure-JavaScript packages, so this step should never fail on you.

### 5. (Optional) Set a JWT secret
Copy `.env.example` to `.env` and change `JWT_SECRET` to any long random string.
If you skip this, a default dev secret is used — fine for local testing, not for
a real deployment.
```
cp .env.example .env       (Mac/Linux)
copy .env.example .env     (Windows)
```

### 6. Start the server
```
npm start
```
You should see:
```
TaskFlow server running on http://localhost:4000
```

### 7. Open the app
Go to **http://localhost:4000** in your browser.

### 8. Try it out
1. Click **Register**, create an account (e.g. you@test.com).
2. Click **+ New Project**, give it a name.
3. Click **+ Add Task**, give it a title, save.
4. Drag the task card between columns — it updates instantly.
5. Click a task card → write a comment → it appears immediately.

### 9. Test the real-time / multi-user features
Open a **second browser window in Incognito/Private mode** (so it doesn't
share your login) and go to http://localhost:4000 again. Register a second
account there. Back in your first window, open **👥 Members** on your project
and invite the second account's email. Switch to the second window — you'll
see a notification pop up immediately, and the project will now appear on
that account's dashboard. Add/move tasks in one window and watch them update
live in the other — that's the WebSocket layer at work.

---

## Project structure
```
pm-tool/
├── server.js            # Express app + Socket.io setup, entry point
├── db.js                # Datastore (users, projects, tasks, comments)
├── data.json             # Auto-created on first run — your actual data
├── middleware/
│   └── auth.js           # JWT verification middleware
├── routes/
│   ├── auth.js            # /api/auth/register, /login, /me
│   ├── projects.js        # /api/projects (CRUD + invite members)
│   ├── tasks.js            # /api/projects/:id/tasks, /api/tasks/:id
│   └── comments.js         # /api/tasks/:id/comments
└── public/                 # Frontend (served as static files)
    ├── index.html
    ├── style.css
    └── app.js
```

## How the pieces fit together (for your project writeup / viva)

**Auth:** On register/login, the server hashes the password with bcrypt,
checks it on login, and issues a signed JWT containing the user's id/name/email.
The frontend stores that token in `localStorage` and sends it as
`Authorization: Bearer <token>` on every API call. The same token is used to
authenticate the WebSocket connection (`io.use(...)` in `server.js`), so
sockets know who they belong to without a separate login.

**Projects & membership:** A project has an owner and a list of members
(`project_members`). Only members can view/edit a project's tasks. Inviting
someone by email adds them as a member and pushes them a real-time
notification plus a `member:added` event broadcast to everyone currently
viewing that project.

**Tasks:** Each task belongs to a project, has a status (`todo` /
`in_progress` / `done`), an optional assignee, and a due date. Dragging a
card to another column sends a `PUT /api/tasks/:id` with the new status; the
server then broadcasts `task:updated` to everyone in that project's
Socket.io room, so every connected browser re-renders the board without
refreshing.

**Comments:** Stored per task. Posting one broadcasts `comment:created` to
the project room and sends a personal `notification` event to the task's
assignee and creator (if they're not the one commenting).

**Real-time layer:** Socket.io rooms are used two ways:
- `project_<id>` — everyone currently viewing that project's board, for
  live task/comment/member updates.
- `user_<id>` — a personal room for each logged-in user, used for
  notifications (assigned a task, added to a project, new comment) even
  if they're not currently looking at that project.

## Swapping in a real database (optional, for extra credit)
The JSON-file datastore is intentionally simple so the project runs anywhere
with zero setup pain. If your internship wants you to demonstrate a "real"
database, the cleanest upgrade path is:
1. Install Postgres (or use a free hosted one like Supabase/Neon) and the
   `pg` npm package.
2. Recreate the five tables (`users`, `projects`, `project_members`, `tasks`,
   `comments`) using the same shape already in `db.js`'s comments.
3. Replace the functions exported from `db.js` with SQL-backed versions —
   the route files (`routes/*.js`) don't need to change at all, since they
   only call `db.users.findByEmail(...)`, `db.tasks.create(...)`, etc.

## Possible extensions
- Drag-and-drop reordering *within* a column (currently only column-to-column)
- File attachments on tasks
- Activity log / audit trail per project
- Email notifications (in addition to in-app toasts)
- Role-based permissions (e.g. only owners can delete tasks)
- Deploy: push to Render/Railway/Fly.io, set `JWT_SECRET` as an environment
  variable, and you have a live demo link for your internship presentation.
