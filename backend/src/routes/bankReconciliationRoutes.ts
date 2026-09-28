import { Router } from 'express';
import * as bankReconciliationController from '../controllers/bankReconciliationController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/', bankReconciliationController.getReconciliation);
router.post('/save', bankReconciliationController.saveReconciliation);

export default router;
