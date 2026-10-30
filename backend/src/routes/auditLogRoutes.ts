import { Router } from 'express';
import * as auditLogController from '../controllers/auditLogController';
import { authenticate } from '../middlewares/auth';
import { requireRole } from '../middlewares/rbac';

const router = Router();

router.use(authenticate);
router.use(requireRole('Admin', 'Manager'));

router.get('/', auditLogController.list);

export default router;
