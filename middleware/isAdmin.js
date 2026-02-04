// middleware/isAdmin.js

/**
 * Middleware to restrict access to admin users only
 */
module.exports = function isAdmin(req, res, next) {
  const user = req.session?.user;

  // 🔐 Check if user is logged in
  if (!user) {
    return res.redirect('/signin'); // Redirect to login page if not logged in
  }

  // ⛔ Check if user is admin
  if (user.role !== 'admin') {
    return res.status(403).send('Access Denied: Admins only'); // Deny access if not admin
  }

  // ✅ User is admin, proceed to next middleware or route
  next();
};
