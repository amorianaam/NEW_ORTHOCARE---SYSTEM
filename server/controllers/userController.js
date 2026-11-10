const db = require('../database/db');
const bcrypt = require('bcryptjs');

// PUT /api/users/profile — Update own display name
exports.updateProfile = async (req, res) => {
  try {
    const { fullName } = req.body;
    if (!fullName || !fullName.trim())
      return res.status(400).json({ message: 'الاسم مطلوب' });

    await db.execute(
      'UPDATE users SET full_name = ? WHERE id = ?',
      [fullName.trim(), req.user.id]
    );
    res.json({ message: 'تم تحديث الاسم بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// PUT /api/users/change-password — Direct Self-Service Password Change
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });

    const [[user]] = await db.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch)
      return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });

    const hash = await bcrypt.hash(newPassword, 10);
    
    // Update user password directly in database
    await db.execute(
      'UPDATE users SET password_hash = ?, plain_password = ?, must_change_password = false WHERE id = ?',
      [hash, newPassword, req.user.id]
    );

    res.json({
      message: 'تم تغيير كلمة المرور بنجاح'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// GET /api/admin/password-change-requests — List all password requests
exports.getPasswordRequests = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT r.id, r.user_id, r.status, r.requested_at, r.resolved_at, r.resolved_by,
             u.full_name, u.username, u.role,
             approver.full_name as approver_name
      FROM password_change_requests r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN users approver ON r.resolved_by = approver.id
      ORDER BY r.requested_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// PUT /api/admin/password-change-requests/:id/approve — Approve request
exports.approvePasswordRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const [[request]] = await db.execute('SELECT user_id, new_password_hash, status FROM password_change_requests WHERE id = ?', [id]);
    
    if (!request) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (request.status !== 'pending') return res.status(400).json({ message: 'تمت معالجة هذا الطلب بالفعل' });

    // Update password
    await db.execute(
      'UPDATE users SET password_hash = ?, must_change_password = false WHERE id = ?',
      [request.new_password_hash, request.user_id]
    );

    // Update request status
    await db.execute(
      'UPDATE password_change_requests SET status = ?, resolved_at = NOW(), resolved_by = ? WHERE id = ?',
      ['approved', req.user.id, id]
    );

    // Emit real-time notification to the user
    const io = req.app.get('io');
    if (io) {
      io.emit('notification:new', {
        userId: request.user_id,
        message: '🎉 تمت الموافقة على طلب تغيير كلمة المرور الخاصة بك بنجاح من قبل إدارة النظام.'
      });
      io.emit('password-request:resolved', {
        requestId: id,
        status: 'approved',
        userId: request.user_id
      });
    }

    res.json({ message: 'تم قبول طلب تغيير كلمة المرور وتحديثها بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// PUT /api/admin/password-change-requests/:id/reject — Reject request
exports.rejectPasswordRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const [[request]] = await db.execute('SELECT user_id, status FROM password_change_requests WHERE id = ?', [id]);
    
    if (!request) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (request.status !== 'pending') return res.status(400).json({ message: 'تمت معالجة هذا الطلب بالفعل' });

    // Update request status
    await db.execute(
      'UPDATE password_change_requests SET status = ?, resolved_at = NOW(), resolved_by = ? WHERE id = ?',
      ['rejected', req.user.id, id]
    );

    // Emit real-time notification to the user
    const io = req.app.get('io');
    if (io) {
      io.emit('notification:new', {
        userId: request.user_id,
        message: '⚠️ تم رفض طلب تغيير كلمة المرور الخاصة بك من قبل إدارة النظام.'
      });
      io.emit('password-request:resolved', {
        requestId: id,
        status: 'rejected',
        userId: request.user_id
      });
    }

    res.json({ message: 'تم رفض طلب تغيير كلمة المرور بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};
