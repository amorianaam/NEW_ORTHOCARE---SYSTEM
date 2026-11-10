/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ORTHOCARE ENTERPRISE ERP — AUTOMATED DATABASE BACKUP MANAGER
 * ═══════════════════════════════════════════════════════════════════════════
 * Provides streaming GZIP database backups, 30-day retention pruning,
 * credential isolation (spawn with MYSQL_PWD), node-cron scheduling (Asia/Aden),
 * audit logging, and realtime administrator socket notifications.
 */

const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

// ── CONFIGURATION & PATH RESOLUTION ─────────────────────────────────────────
const BACKUP_DIR = process.env.BACKUP_DIR 
  ? path.resolve(process.env.BACKUP_DIR) 
  : path.join(__dirname, '../backups');

const RETENTION_DAYS = 30;
const CRON_SCHEDULE = '0 16 * * *'; // 04:00 PM (16:00) daily
const TIMEZONE = 'Asia/Aden';

let isBackupRunning = false;

/**
 * Ensures the target backup directory exists.
 */
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * Discovers the mysqldump binary across environment and common Windows paths.
 */
function resolveMysqldumpPath() {
  // 1. Explicit environment override
  if (process.env.MYSQLDUMP_PATH && fs.existsSync(process.env.MYSQLDUMP_PATH)) {
    return process.env.MYSQLDUMP_PATH;
  }

  // 2. Standard Windows installation paths (XAMPP, MySQL Server, Laragon, Wamp)
  const candidatePaths = [
    'C:\\xampp\\mysql\\bin\\mysqldump.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\mysqldump.exe',
    'C:\\laragon\\bin\\mysql\\current\\bin\\mysqldump.exe',
    'C:\\wamp64\\bin\\mysql\\current\\bin\\mysqldump.exe'
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // 3. Fallback to system PATH binary
  return 'mysqldump';
}

/**
 * Formats byte size into human-readable string.
 */
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Records a structured line in the append-only backup audit log.
 */
function writeAuditLog(entry) {
  try {
    ensureBackupDir();
    const logFile = path.join(BACKUP_DIR, 'backup_audit.log');
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${entry.status}] ${entry.message} | File: ${entry.file || 'N/A'} | Size: ${entry.size || 'N/A'} | Duration: ${entry.durationMs ? entry.durationMs + 'ms' : 'N/A'}\n`;
    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch (logErr) {
    console.error('[Backup Audit Log] Failed to write audit log:', logErr.message);
  }
}

/**
 * Prunes backups older than the retention threshold (30 days).
 */
function pruneOldBackups(retentionDays = RETENTION_DAYS) {
  ensureBackupDir();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let prunedCount = 0;
  let freedBytes = 0;
  const prunedFiles = [];

  try {
    const files = fs.readdirSync(BACKUP_DIR);
    for (const file of files) {
      // Target our backup files (.sql.gz or legacy .sql)
      if (!/^orthocare.*(\.sql\.gz|\.sql)$/i.test(file)) continue;

      const filePath = path.join(BACKUP_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > maxAgeMs) {
          freedBytes += stats.size;
          fs.unlinkSync(filePath);
          prunedCount++;
          prunedFiles.push(file);
          console.log(`[Backup Retention] Pruned expired backup: ${file} (age: ${(ageMs / (24*3600*1000)).toFixed(1)} days)`);
        }
      } catch (fErr) {
        console.error(`[Backup Retention] Error checking file ${file}:`, fErr.message);
      }
    }

    if (prunedCount > 0) {
      writeAuditLog({
        status: 'RETENTION_CLEANUP',
        message: `Pruned ${prunedCount} old backup(s) totaling ${formatBytes(freedBytes)}`,
        file: prunedFiles.join(', '),
        size: formatBytes(freedBytes)
      });
    }
  } catch (err) {
    console.error('[Backup Retention] Pruning scan failed:', err.message);
  }

  return { prunedCount, freedBytes, freedFormatted: formatBytes(freedBytes), prunedFiles };
}

/**
 * Executes a full database dump directly piped through GZIP compression.
 * Credentials are provided via MYSQL_PWD in an isolated environment (no cleartext CLI passwords).
 */
async function runDatabaseBackup({ manual = false, io = null } = {}) {
  if (isBackupRunning) {
    throw new Error('عملية نسخ احتياطي أخرى قيد التنفيذ حالياً، يرجى الانتظار.');
  }

  isBackupRunning = true;
  ensureBackupDir();
  const startTime = Date.now();

  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '3306',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.DB_PASS || ''),
    database: process.env.DB_NAME || 'orthocare_db'
  };

  const mysqldumpPath = resolveMysqldumpPath();

  // Generate date tokens for file naming
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  let filename = `orthocare_backup_${dateStr}.sql.gz`;
  let targetPath = path.join(BACKUP_DIR, filename);

  // If manual or file already exists for today, append timestamp to prevent overwriting
  if (manual || fs.existsSync(targetPath)) {
    filename = `orthocare_backup_${dateStr}_${timeStr}.sql.gz`;
    targetPath = path.join(BACKUP_DIR, filename);
  }

  console.log(`[Backup Manager] Starting ${manual ? 'manual' : 'scheduled'} backup for database "${dbConfig.database}"...`);
  console.log(`[Backup Manager] Target archive: ${targetPath}`);

  // Safe isolated arguments: table locks avoided, memory stream enabled
  const args = [
    `--host=${dbConfig.host}`,
    `--port=${dbConfig.port}`,
    `--user=${dbConfig.user}`,
    '--single-transaction', // Consistent non-locking snapshot
    '--quick',              // Stream row by row
    '--routines',           // Include stored procedures/functions
    '--triggers',           // Include triggers
    dbConfig.database
  ];

  // Spawn isolated child process with credentials exclusively in MYSQL_PWD env
  const child = spawn(mysqldumpPath, args, {
    env: { ...process.env, MYSQL_PWD: dbConfig.password },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  let stderrData = '';
  child.stderr.on('data', (chunk) => {
    stderrData += chunk.toString();
  });

  const gzip = zlib.createGzip({ level: 9 });
  const fileWriteStream = fs.createWriteStream(targetPath);

  try {
    // Pipe mysqldump stdout -> GZIP -> File Stream atomically
    await Promise.all([
      pipeline(child.stdout, gzip, fileWriteStream),
      new Promise((resolve, reject) => {
        child.on('error', (err) => reject(new Error(`تعذر تشغيل mysqldump (${mysqldumpPath}): ${err.message}`)));
        child.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`فشل أمر mysqldump برمز الخروج (${code}): ${stderrData || 'خطأ غير محدد'}`));
          }
        });
      })
    ]);

    const durationMs = Date.now() - startTime;
    const fileStats = fs.statSync(targetPath);
    const sizeFormatted = formatBytes(fileStats.size);

    console.log(`[Backup Manager] ✅ Backup successfully created: ${filename} (${sizeFormatted}) in ${durationMs}ms`);

    // Perform automated self-cleaning retention
    const retentionResult = pruneOldBackups(RETENTION_DAYS);

    writeAuditLog({
      status: 'SUCCESS',
      message: `${manual ? 'Manual' : 'Scheduled'} backup completed successfully`,
      file: filename,
      size: sizeFormatted,
      durationMs
    });

    if (io) {
      const payload = {
        success: true,
        filename,
        size: sizeFormatted,
        durationMs,
        timestamp: new Date().toISOString()
      };
      io.to('auditor').to('cashier').emit('backup:success', payload);
    }

    return {
      success: true,
      filename,
      filePath: targetPath,
      sizeBytes: fileStats.size,
      sizeFormatted,
      durationMs,
      pruned: retentionResult
    };
  } catch (backupError) {
    // Atomic rollback: Delete partial or corrupted archive
    if (fs.existsSync(targetPath)) {
      try { fs.unlinkSync(targetPath); } catch (_) {}
    }

    const durationMs = Date.now() - startTime;
    console.error(`[Backup Manager] ❌ Backup failed:`, backupError.message);

    writeAuditLog({
      status: 'FAILED',
      message: backupError.message,
      file: filename,
      durationMs
    });

    if (io) {
      io.to('auditor').to('cashier').emit('backup:failed', {
        success: false,
        error: backupError.message,
        timestamp: new Date().toISOString()
      });
    }

    throw backupError;
  } finally {
    isBackupRunning = false;
  }
}

/**
 * Returns available backup archives in server/backups.
 */
function getAvailableBackups() {
  ensureBackupDir();
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const backups = [];

    for (const f of files) {
      if (!/^orthocare.*(\.sql\.gz|\.sql)$/i.test(f)) continue;
      const filePath = path.join(BACKUP_DIR, f);
      try {
        const stats = fs.statSync(filePath);
        backups.push({
          filename: f,
          sizeBytes: stats.size,
          sizeFormatted: formatBytes(stats.size),
          createdAt: stats.birthtime || stats.mtime,
          isCompressed: f.endsWith('.gz')
        });
      } catch (_) {}
    }

    // Sort descending by creation date
    return backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    console.error('[Backup Manager] Error listing backups:', err.message);
    return [];
  }
}

/**
 * Initializes the node-cron scheduler and registers administrative API endpoints.
 */
function initBackupScheduler(app, io) {
  ensureBackupDir();

  // 1. Setup daily cron job at 04:00 PM (16:00) Yemen Time
  cron.schedule(CRON_SCHEDULE, async () => {
    console.log(`[Backup Scheduler] Triggering automated daily backup (16:00 ${TIMEZONE})...`);
    try {
      await runDatabaseBackup({ manual: false, io });
    } catch (err) {
      console.error('[Backup Scheduler] Automated daily backup encountered error:', err.message);
    }
  }, {
    timezone: TIMEZONE
  });

  console.log(`[Backup Scheduler] Initialized daily cron (04:00 PM / 16:00 Yemen Time: ${CRON_SCHEDULE} in ${TIMEZONE})`);

  // 2. Register Admin Routes
  if (app) {
    // Trigger on-demand backup
    app.post('/api/admin/backup/now', async (req, res) => {
      try {
        const result = await runDatabaseBackup({ manual: true, io });
        res.json({
          message: 'تم إنجاز النسخ الاحتياطي وضغطه بنجاح',
          data: result
        });
      } catch (err) {
        res.status(500).json({
          message: 'تعذر تنفيذ النسخ الاحتياطي',
          error: err.message
        });
      }
    });

    // Check backup system status & available archives
    app.get('/api/admin/backup/status', (req, res) => {
      const archives = getAvailableBackups();
      const totalSizeBytes = archives.reduce((acc, a) => acc + (a.sizeBytes || 0), 0);

      res.json({
        scheduler: {
          active: true,
          schedule: CRON_SCHEDULE,
          timezone: TIMEZONE,
          timeDescription: '04:00 PM (16:00) Asia/Aden'
        },
        storage: {
          directory: BACKUP_DIR,
          retentionDays: RETENTION_DAYS,
          totalArchives: archives.length,
          totalStorageFormatted: formatBytes(totalSizeBytes)
        },
        latestBackup: archives[0] || null,
        archives
      });
    });

    // Secure download of a specific backup archive
    app.get('/api/admin/backup/download/:filename', (req, res) => {
      const { filename } = req.params;
      // Sanitize filename to prevent directory traversal
      const safeFilename = path.basename(filename);
      const targetFilePath = path.join(BACKUP_DIR, safeFilename);

      if (!fs.existsSync(targetFilePath) || !/^orthocare.*(\.sql\.gz|\.sql)$/i.test(safeFilename)) {
        return res.status(404).json({ message: 'ملف النسخة الاحتياطية غير موجود أو تم حذفه وفقاً لسياسة الاحتفاظ' });
      }

      res.download(targetFilePath, safeFilename);
    });
  }
}

module.exports = {
  initBackupScheduler,
  runDatabaseBackup,
  pruneOldBackups,
  getAvailableBackups,
  resolveMysqldumpPath,
  BACKUP_DIR,
  RETENTION_DAYS,
  CRON_SCHEDULE,
  TIMEZONE
};
