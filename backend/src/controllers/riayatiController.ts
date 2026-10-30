import { Request, Response } from 'express';
import { hl7MockListener } from '../services/hl7/hl7MockListener';
import { riayatiHl7Service, RiayatiPatientVisit, RiayatiDispenseRequest } from '../services/hl7/riayatiHl7Service';
import { SalesInvoice } from '../models/SalesInvoice';
import { SalesInvoiceItem } from '../models/SalesInvoiceItem';
import { Product } from '../models/Product';
import { Patient } from '../models/Patient';

export const getListenerStatus = async (_req: Request, res: Response) => {
  try {
    const status = hl7MockListener.getStatus();
    const endpointConfig = riayatiHl7Service.getEndpoint();
    return res.json({ success: true, data: { ...status, endpointConfig } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const startListener = async (req: Request, res: Response) => {
  try {
    const port = parseInt(req.body.port || '2575', 10);
    const result = await hl7MockListener.start(port);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const stopListener = async (_req: Request, res: Response) => {
  try {
    const result = await hl7MockListener.stop();
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getListenerLogs = async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '100', 10);
    const logs = hl7MockListener.getLogs(limit);
    return res.json({ success: true, data: logs });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const clearListenerLogs = async (_req: Request, res: Response) => {
  try {
    hl7MockListener.clearLogs();
    return res.json({ success: true, message: 'Logs cleared' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const testSendSample = async (req: Request, res: Response) => {
  try {
    const { messageType = 'FULL_FLOW', emiratesId = '784199012345678', doctorLicense = 'MOH-7890', invoiceNo = 'TEST-INV-001' } = req.body;

    const sampleVisit = {
      visitNumber: `VN-${invoiceNo}`,
      emiratesId,
      patientName: 'Ahmed Mohammed Ali',
      patientFamilyName: 'Ali',
      doctorLicenseNo: doctorLicense,
      doctorName: 'Dr. Sarah Smith',
      doctorLicenseProvider: 'MOHAP',
    };

    const sampleDispenses = [
      {
        visitNumber: `VN-${invoiceNo}`,
        invoiceNo,
        emiratesId,
        patientName: 'Ahmed Mohammed Ali',
        doctorLicenseNo: doctorLicense,
        doctorName: 'Dr. Sarah Smith',
        drugCode: 'PANADOL-500',
        drugDescription: 'Panadol Extra 500mg Film-Coated Tablets',
        quantity: 2,
        unit: 'TAB',
        route: 'PO,ORAL',
        dosageForm: 'TAB,TABLET',
        strength: 500,
        strengthUnit: 'MG',
        lotNumber: 'LOT2026A',
        expiryDate: new Date(Date.now() + 180 * 24 * 3600 * 1000),
        manufacturer: 'GSK',
        packageSize: 24,
        packageUnit: 'BOX',
        dispenseType: 'N',
        medicineCodeProvider: 'DDC',
      },
    ];

    if (messageType === 'ADT_A04') {
      const ack = await riayatiHl7Service.sendRegisterVisit(sampleVisit);
      return res.json({ success: true, data: { type: 'ADT_A04', ack } });
    } else if (messageType === 'RDS_O13') {
      const ack = await riayatiHl7Service.sendDispense(sampleDispenses);
      return res.json({ success: true, data: { type: 'RDS_O13', ack } });
    } else if (messageType === 'ADT_A03') {
      const ack = await riayatiHl7Service.sendEndVisit(sampleVisit);
      return res.json({ success: true, data: { type: 'ADT_A03', ack } });
    } else if (messageType === 'QBP_Q22') {
      const resp = await riayatiHl7Service.queryPatientDemographics(emiratesId);
      return res.json({ success: true, data: { type: 'QBP_Q22', ...resp } });
    } else {
      // FULL_FLOW: Register Visit -> Dispense -> End Visit
      const fullResult = await riayatiHl7Service.submitFullDispenseFlow(sampleVisit, sampleDispenses);
      return res.json({ success: true, data: { type: 'FULL_FLOW', ...fullResult } });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const queryPatientDemographics = async (req: Request, res: Response) => {
  try {
    const { emiratesId } = req.body;
    if (!emiratesId) {
      return res.status(400).json({ success: false, message: 'Emirates ID is required' });
    }
    const result = await riayatiHl7Service.queryPatientDemographics(emiratesId);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

async function resendInvoiceInternal(invoice: any) {
  const invoiceId = invoice._id;
  const invoiceNo = invoice.invoiceNo;
  const date = invoice.invoiceDate || new Date();
  const visitNumber = invoice.riayatiVisitNumber || `VN-${invoiceNo}`;

  const patEid = (invoice.emiratesId || '784-1990-1234567-1').replace(/[^0-9]/g, '');
  let patName = invoice.patientName || invoice.customerName || 'Walk-in Patient';
  let patFamily = '';
  let patMrn = '';
  let patDob: Date | undefined;
  let patGender = 'M';
  let patPhone = invoice.customerPhone || '';
  let patLang = 'ARA';
  let patStreet = invoice.customerAddress || '';
  let patCity = '';
  let patEmirate = '';
  let patCountry = 'ARE';

  // Look up Patient in MongoDB to get complete address, city, emirate, phone, etc.
  if (patEid || invoice.patientName) {
    const queryCond: any = {};
    if (invoice.companyId) queryCond.companyId = invoice.companyId;
    if (patEid) {
      queryCond.emiratesId = new RegExp(patEid.replace(/(\d{3})(\d{4})(\d{7})(\d{1})/, '$1-?$2-?$3-?$4'), 'i');
    } else if (invoice.patientName) {
      queryCond.fullName = new RegExp(`^${invoice.patientName.trim()}$`, 'i');
    }
    const foundPat = await Patient.findOne(queryCond).lean();
    if (foundPat) {
      if (foundPat.firstName) patName = foundPat.firstName;
      if (foundPat.familyName) patFamily = foundPat.familyName;
      if (foundPat.mrn) patMrn = foundPat.mrn;
      if (foundPat.gender) patGender = foundPat.gender;
      if (foundPat.phone) patPhone = foundPat.phone;
      if (foundPat.language) patLang = foundPat.language;
      if (foundPat.street) patStreet = foundPat.street;
      if (foundPat.city) patCity = foundPat.city;
      if (foundPat.emirate) patEmirate = foundPat.emirate;
      if (foundPat.country) patCountry = foundPat.country;
      if (foundPat.dob) {
        const pd = new Date(foundPat.dob);
        if (!isNaN(pd.getTime())) patDob = pd;
      }
    }
  }

  if (!patFamily && patName.includes(' ')) {
    const nameParts = patName.trim().split(/\s+/);
    patFamily = nameParts.length > 1 ? nameParts[nameParts.length - 1] : patName;
    patName = nameParts.slice(0, -1).join(' ') || patName;
  }

  const doctorLic = invoice.doctorLicenseNo || 'MOH-1234';
  const doctorName = invoice.doctorName || 'Dr. On Duty';
  const doctorAuth = invoice.doctorLicenseProvider || 'MOHAP';

  const visit: RiayatiPatientVisit = {
    visitNumber,
    emiratesId: patEid,
    patientName: patName,
    patientFamilyName: patFamily,
    patientMrn: patMrn,
    patientDob: patDob,
    patientGender: patGender,
    patientPhone: patPhone,
    patientLanguage: patLang,
    patientAddress: patStreet,
    patientCity: patCity,
    patientEmirate: patEmirate,
    patientCountry: patCountry,
    doctorLicenseNo: doctorLic,
    doctorName,
    doctorLicenseProvider: doctorAuth,
  };

  const items = await SalesInvoiceItem.find({ invoiceId }).lean();
  let dispenses: RiayatiDispenseRequest[] = [];

  if (items && items.length > 0) {
    const productIds = items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = new Map(products.map((p: any) => [p._id.toString(), p]));

    dispenses = items.map((it: any) => {
      const prod: any = productMap.get(it.productId?.toString());
      const strengthNum = prod?.strength ? parseFloat(prod.strength) : 500;
      const pkgSizeNum = prod?.packageSize ? parseFloat(prod.packageSize) : 1;
      const freqCount = parseFloat((it as any).frequency || '1') || 1;
      const totalDailyDose = !isNaN(strengthNum) ? strengthNum * freqCount : undefined;

      return {
        visitNumber,
        invoiceNo,
        emiratesId: patEid,
        patientName: patName,
        patientFamilyName: patFamily,
        patientMrn: patMrn,
        patientDob: patDob,
        patientGender: patGender,
        patientPhone: patPhone,
        patientLanguage: patLang,
        patientAddress: patStreet,
        patientCity: patCity,
        patientEmirate: patEmirate,
        patientCountry: patCountry,
        doctorLicenseNo: doctorLic,
        doctorName,
        doctorLicenseProvider: doctorAuth,
        drugCode: prod?.officialCode || prod?.code || it.productCode || 'MED-001',
        drugDescription: it.description || prod?.name || prod?.genericName || 'MEDICATION',
        dispensedAt: date,
        quantity: it.quantity,
        duration: (it as any).duration || '30',
        timing: (it as any).timing || 'Before Food',
        frequency: (it as any).frequency || '1',
        totalDailyDose,
        unit: prod?.packageUnit || 'TAB',
        route: prod?.routeOfAdmin || 'PO,ORAL',
        dosageForm: prod?.dosageForm || 'TAB,TABLET',
        strength: isNaN(strengthNum) ? 500 : strengthNum,
        strengthUnit: prod?.strengthUnit || 'MG',
        lotNumber: it.batchNumber || 'BATCH01',
        expiryDate: it.expiryDate ? new Date(it.expiryDate) : new Date(Date.now() + 180 * 24 * 3600 * 1000),
        manufacturer: prod?.manufacturer || 'PHARMA',
        packageSize: isNaN(pkgSizeNum) ? 1 : pkgSizeNum,
        packageUnit: prod?.packageUnit || 'BOX',
        gtin: prod?.imei || prod?.internationalBarcode || '',
        dispenseType: 'N',
        medicineCodeProvider: prod?.medCodeProvider || 'DDC',
      };
    });
  } else {
    dispenses = [
      {
        visitNumber,
        invoiceNo,
        emiratesId: patEid,
        patientName: patName,
        patientFamilyName: patFamily,
        doctorLicenseNo: doctorLic,
        doctorName,
        doctorLicenseProvider: doctorAuth,
        drugCode: 'MED-001',
        drugDescription: 'Medication item',
        dispensedAt: date,
        quantity: 1,
        unit: 'TAB',
        route: 'PO,ORAL',
        dosageForm: 'TAB,TABLET',
        strength: 500,
        strengthUnit: 'MG',
        lotNumber: 'BATCH01',
        expiryDate: new Date(Date.now() + 180 * 24 * 3600 * 1000),
        manufacturer: 'PHARMA',
        packageSize: 1,
        packageUnit: 'BOX',
        gtin: '',
        dispenseType: 'N',
        medicineCodeProvider: 'DDC',
      },
    ];
  }

  const result = await riayatiHl7Service.submitFullDispenseFlow(visit, dispenses);

  await SalesInvoice.updateOne(
    { _id: invoiceId },
    {
      $set: {
        riayatiStatus: result.status,
        riayatiVisitNumber: visitNumber,
        riayatiAckCode: result.ackCode || (result.status === 'Success' ? 'AA' : 'AE'),
        riayatiError: result.error || null,
        riayatiSubmittedAt: new Date(),
        isRiayati: true,
      },
    }
  );

  return { result, visitNumber };
}

export const getRiayatiInvoices = async (req: Request, res: Response) => {
  try {
    const { status, search, fromDate, toDate, companyId, page = '1', limit = '50' } = req.query;

    const baseFilter: any = {
      $or: [
        { isRiayati: true },
        { riayatiStatus: { $exists: true, $ne: null } },
        { emiratesId: { $exists: true, $ne: '' } },
      ],
    };

    if (companyId) {
      baseFilter.companyId = companyId;
    }

    const kpiFilter = { ...baseFilter };
    const filter: any = { ...baseFilter };

    if (status && status !== 'All') {
      if (status === 'Pending') {
        filter.$and = [
          {
            $or: [
              { riayatiStatus: 'Pending' },
              { riayatiStatus: { $exists: false } },
              { riayatiStatus: null },
            ],
          },
        ];
      } else {
        filter.riayatiStatus = status;
      }
    }

    if (fromDate || toDate) {
      filter.invoiceDate = {};
      if (fromDate) {
        filter.invoiceDate.$gte = new Date(fromDate as string);
      }
      if (toDate) {
        const to = new Date(toDate as string);
        to.setHours(23, 59, 59, 999);
        filter.invoiceDate.$lte = to;
      }
    }

    if (search) {
      const s = String(search).trim();
      const regex = new RegExp(s, 'i');
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { invoiceNo: regex },
          { emiratesId: regex },
          { patientName: regex },
          { customerName: regex },
          { doctorName: regex },
          { riayatiVisitNumber: regex },
        ],
      });
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [invoices, totalMatching, allInvoicesForKpis] = await Promise.all([
      SalesInvoice.find(filter)
        .sort({ invoiceDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SalesInvoice.countDocuments(filter),
      SalesInvoice.find(kpiFilter, 'riayatiStatus emiratesId isRiayati').lean(),
    ]);

    let successCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    let offlineCount = 0;

    for (const inv of allInvoicesForKpis) {
      const st = inv.riayatiStatus;
      if (st === 'Success') successCount++;
      else if (st === 'Failed') failedCount++;
      else if (st === 'Offline') offlineCount++;
      else pendingCount++;
    }

    const invoiceIds = invoices.map((inv) => inv._id);
    const items = await SalesInvoiceItem.find({ invoiceId: { $in: invoiceIds } }, 'invoiceId quantity').lean();
    const itemCountMap = new Map<string, number>();
    for (const it of items) {
      const idStr = it.invoiceId.toString();
      itemCountMap.set(idStr, (itemCountMap.get(idStr) || 0) + 1);
    }

    const invoicesWithMeta = invoices.map((inv) => ({
      ...inv,
      itemCount: itemCountMap.get(inv._id.toString()) || 0,
      riayatiStatus: inv.riayatiStatus || (inv.emiratesId ? 'Pending' : 'NotApplicable'),
    }));

    return res.json({
      success: true,
      data: {
        invoices: invoicesWithMeta,
        kpis: {
          total: allInvoicesForKpis.length,
          success: successCount,
          failed: failedCount,
          pending: pendingCount,
          offline: offlineCount,
        },
        pagination: {
          total: totalMatching,
          page: pageNum,
          pages: Math.ceil(totalMatching / limitNum) || 1,
        },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const resendRiayatiSubmission = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const invoice = await SalesInvoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const { result, visitNumber } = await resendInvoiceInternal(invoice);
    const updated = await SalesInvoice.findById(id).lean();

    return res.json({
      success: true,
      message: `Resend completed: Status is ${result.status}`,
      data: { invoice: updated, submissionResult: result, visitNumber },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const resendAllFailed = async (_req: Request, res: Response) => {
  try {
    const failedInvoices = await SalesInvoice.find({ riayatiStatus: 'Failed' });
    const results = [];
    for (const inv of failedInvoices) {
      try {
        const r = await resendInvoiceInternal(inv);
        results.push({ invoiceNo: inv.invoiceNo, success: r.result.success, status: r.result.status });
      } catch (err: any) {
        results.push({ invoiceNo: inv.invoiceNo, success: false, error: err.message });
      }
    }
    return res.json({
      success: true,
      message: `Processed ${results.length} failed invoices.`,
      data: results,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

