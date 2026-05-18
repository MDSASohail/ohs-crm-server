import { Router } from 'express';
import {
  getVaultDocuments,
  uploadVaultDocument,
  renameVaultDocument,
  updateVaultDocumentTags,
  updateVaultDocumentNote,
  deleteVaultDocument,
} from '../controllers/vaultDocument.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { checkRole } from '../middleware/role.middleware.js';
import { vaultUpload } from '../middleware/upload.middleware.js';

const router = Router();

// All routes require authentication
router.use(verifyJWT);

// ── Read (all roles) ──────────────────────────────────────────────────────────
router.get('/', getVaultDocuments);

// ── Write (Root + Admin + Staff) ──────────────────────────────────────────────
router.post(
  '/upload',
  checkRole('root', 'admin', 'staff'),
  vaultUpload.single('file'),
  uploadVaultDocument
);

router.put(
  '/:id/rename',
  checkRole('root', 'admin', 'staff'),
  renameVaultDocument
);

router.put(
  '/:id/tags',
  checkRole('root', 'admin', 'staff'),
  updateVaultDocumentTags
);

router.put(
  '/:id/note',
  checkRole('root', 'admin', 'staff'),
  updateVaultDocumentNote
);

// ── Delete (Root + Admin only) ────────────────────────────────────────────────
router.delete(
  '/:id',
  checkRole('root', 'admin'),
  deleteVaultDocument
);

export default router;