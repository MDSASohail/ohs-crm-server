// middleware/role.middleware.js
// Role-based access control (RBAC) middleware.
// Always runs AFTER verifyJWT — req.user must
// already be set before this middleware is called.
//
// Usage:
// router.delete(
//   "/:id",
//   verifyJWT,
//   checkRole("root", "admin"),
//   deleteCandidate
// );
//
// Roles hierarchy (high to low):
// root → admin → staff → viewer

import { ApiError } from "../utils/ApiError.js";

const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    // verifyJWT must run before this middleware
    if (!req.user) {
      throw new ApiError(401, "Unauthorized — user not authenticated");
    }

    // Check if the user's role is in the allowed list
    if (!allowedRoles.includes(req.user.role)) {
      throw new ApiError(
        403,
        `Forbidden — required role: ${allowedRoles.join(" or ")}`
      );
    }

    next();
  };
};

export { checkRole };