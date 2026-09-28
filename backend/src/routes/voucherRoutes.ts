import { Router } from 'express';
import * as voucherController from '../controllers/voucherController';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

const router = Router();

router.use(authenticate);

router.get('/', voucherController.list);
router.get('/next-no', voucherController.getNextVoucherNo);
router.get('/:id', voucherController.getById);
router.post('/', validate(voucherController.createValidators), voucherController.create);
router.delete('/:id', voucherController.deleteVoucher);

export default router;

