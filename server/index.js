require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors  = require('cors');
const path  = require('path');
const fs    = require('fs');

const app    = express();
const server = http.createServer(app);

// ── Socket.IO ─────────────────────────────────────────────────────
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Auto DB Migration ──────────────────────────────
// Migration scripts have been moved to server/scripts/migrate.js

// ── Routes ────────────────────────────────────────────────────────
const authRoutes = require('./routes/authRoutes');
const apiRoutes  = require('./routes/apiRoutes');

app.use('/api/auth', authRoutes);
app.use('/api',      apiRoutes);

// Health check
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', message: 'ORTHOCARE Backend is running' })
);

// ── Socket.IO Presence Engine ───────────────────────────────────────
const db = require('./database/db');
const doctorPresence = new Map(); // socketId -> { visitId, userId }

async function resetVisitFromWithDoctor(visitId, io) {
  if (!visitId) return;
  try {
    // Check for pending/unpaid counts
    const [[counts]] = await db.execute(`
      SELECT
        (SELECT COUNT(*) FROM visit_lab_requests WHERE visit_id=? AND status='paid') AS pending_labs,
        (SELECT COUNT(*) FROM visit_radiology_requests WHERE visit_id=? AND status='paid') AS pending_rads,
        (SELECT COUNT(*) FROM visit_clinical_service_requests WHERE visit_id=? AND status='paid') AS pending_clinicals,
        (SELECT COUNT(*) FROM visit_lab_requests WHERE visit_id=? AND status='pending_payment') AS unpaid_labs,
        (SELECT COUNT(*) FROM visit_radiology_requests WHERE visit_id=? AND status='pending_payment') AS unpaid_rads,
        (SELECT COUNT(*) FROM visit_clinical_service_requests WHERE visit_id=? AND status='pending_payment') AS unpaid_clinicals
    `, [visitId, visitId, visitId, visitId, visitId, visitId]);

    let newStatus;
    const unpaidTotal = parseInt(counts.unpaid_labs || 0) + parseInt(counts.unpaid_rads || 0) + parseInt(counts.unpaid_clinicals || 0);
    const paidProcedures = parseInt(counts.pending_labs || 0) + parseInt(counts.pending_rads || 0) + parseInt(counts.pending_clinicals || 0);

    if (unpaidTotal > 0) {
      newStatus = 'awaiting_service_payment';
    } else if (paidProcedures > 0) {
      if (parseInt(counts.pending_labs || 0) > 0) {
        newStatus = 'awaiting_lab';
      } else if (parseInt(counts.pending_rads || 0) > 0) {
        newStatus = 'awaiting_radiology';
      } else {
        newStatus = 'waiting';
      }
    } else {
      newStatus = 'waiting';
    }

    const [result] = await db.execute(
      `UPDATE visits SET status=? WHERE id=? AND status='with_doctor'`,
      [newStatus, visitId]
    );

    if (result.affectedRows > 0) {
      console.log(`[Socket Presence] Visit ${visitId} reverted from with_doctor -> ${newStatus}`);
      if (io) {
        io.to('cashier').emit('cashier:update');
        io.to('doctor').emit('patient:updated', { visitId, status: newStatus });
        io.to('secretary').emit('secretary:status_changed', { visitId, status: newStatus });
      }
    }
  } catch (err) {
    console.error('[Socket Presence] resetVisitFromWithDoctor error:', err);
  }
}

// ── Socket.IO Rooms & Presence ─────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('join-role', (role) => {
    socket.join(role);
    console.log(`[Socket] ${socket.id} joined room: ${role}`);
  });

  socket.on('doctor:open-visit', async ({ visitId, userId }) => {
    if (!visitId) return;
    const targetVisitId = Number(visitId);
    if (doctorPresence.has(socket.id)) {
      const prev = doctorPresence.get(socket.id);
      if (prev.visitId !== targetVisitId) {
        doctorPresence.delete(socket.id);
        const isStillOpenByOthers = [...doctorPresence.values()].some(p => p.visitId === prev.visitId);
        if (!isStillOpenByOthers) {
          await resetVisitFromWithDoctor(prev.visitId, io);
        }
      }
    }
    doctorPresence.set(socket.id, { visitId: targetVisitId, userId });
    console.log(`[Socket Presence] Doctor ${socket.id} (user: ${userId}) opened visit ${targetVisitId}`);
  });

  socket.on('doctor:close-visit', async ({ visitId }) => {
    const targetVisitId = visitId ? Number(visitId) : doctorPresence.get(socket.id)?.visitId;
    if (!targetVisitId) return;

    doctorPresence.delete(socket.id);
    const isStillOpenByOthers = [...doctorPresence.values()].some(p => p.visitId === targetVisitId);
    if (!isStillOpenByOthers) {
      await resetVisitFromWithDoctor(targetVisitId, io);
    }
  });

  socket.on('disconnect', async () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    if (doctorPresence.has(socket.id)) {
      const { visitId } = doctorPresence.get(socket.id);
      doctorPresence.delete(socket.id);
      const isStillOpenByOthers = [...doctorPresence.values()].some(p => p.visitId === visitId);
      if (!isStillOpenByOthers) {
        await resetVisitFromWithDoctor(visitId, io);
      }
    }
  });
});

// ── Enterprise Automated Database Backup System ─────────────────────
const { initBackupScheduler } = require('./utils/backupManager');
initBackupScheduler(app, io);

// ── Start Server ──────────────────────────────────────────────────
const PORT = process.env.SERVER_PORT || 5000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
