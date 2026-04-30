import { Router } from 'express';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { checkRole } from '../middleware/role.middleware.js';
import {
  getTemplate,
  addSlot,
  editSlot,
  deleteSlot,
  reorderSlots,
} from '../controllers/requiredDocTemplate.controller.js';

const router = Router();

// All routes require login
router.use(verifyJWT);

// GET template for a course — all roles can view
router.get('/:courseId', getTemplate);

// Mutate routes — admin and root only (same as checklist template)
router.post('/:courseId/slots', checkRole('root', 'admin'), addSlot);
router.put('/:courseId/slots/reorder', checkRole('root', 'admin'), reorderSlots);
router.put('/:courseId/slots/:slotId', checkRole('root', 'admin'), editSlot);
router.delete('/:courseId/slots/:slotId', checkRole('root', 'admin'), deleteSlot);

export default router;