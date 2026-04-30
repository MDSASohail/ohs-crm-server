import { Router } from 'express';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { checkRole } from '../middleware/role.middleware.js';
import { handleUpload } from '../middleware/upload.middleware.js';
import {
  getCandidateRequiredDocs,
  uploadFileToSlot,
  renameFile,
  deleteFile,
} from '../controllers/candidateRequiredDoc.controller.js';

const router = Router();

// All routes require login
router.use(verifyJWT);

// GET all slots for a candidate — all roles can view
router.get('/:candidateId', getCandidateRequiredDocs);

// Upload — staff, admin, root
router.post(
  '/:candidateId/:docId/upload',
  checkRole('root', 'admin', 'staff'),
  handleUpload,
  uploadFileToSlot
);

// Rename — staff, admin, root
router.put(
  '/:candidateId/:docId/files/:fileId',
  checkRole('root', 'admin', 'staff'),
  renameFile
);

// Delete file — staff, admin, root
router.delete(
  '/:candidateId/:docId/files/:fileId',
  checkRole('root', 'admin', 'staff'),
  deleteFile
);

export default router;