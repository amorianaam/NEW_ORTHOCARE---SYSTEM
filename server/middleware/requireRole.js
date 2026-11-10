// Reusable role-authorization middleware
module.exports = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ message: 'غير مصرح — هذه العملية خارج صلاحياتك' });
  }
  next();
};
