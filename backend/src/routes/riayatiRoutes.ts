import { Router } from 'express';
import {
  getListenerStatus,
  startListener,
  stopListener,
  getListenerLogs,
  clearListenerLogs,
  testSendSample,
  queryPatientDemographics,
  getRiayatiInvoices,
  resendRiayatiSubmission,
  resendAllFailed,
} from '../controllers/riayatiController';
import { authenticate } from '../middlewares/auth';

const router = Router();

// Listener management & status
router.get('/listener/status', getListenerStatus);
router.post('/listener/start', startListener);
router.post('/listener/stop', stopListener);
router.get('/listener/logs', getListenerLogs);
router.post('/listener/clear-logs', clearListenerLogs);

// Testing & Querying
router.post('/test/send-sample', testSendSample);
router.post('/query-demographics', queryPatientDemographics);

// Invoices & Dispense Submissions Status
router.get('/invoices', getRiayatiInvoices);
router.post('/resend/:id', resendRiayatiSubmission);
router.post('/resend-all-failed', resendAllFailed);

export default router;
