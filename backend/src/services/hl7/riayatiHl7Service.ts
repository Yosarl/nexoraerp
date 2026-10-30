import crypto from 'crypto';
import { sendMllpMessage, Hl7AckResult } from './hl7Mllp';

export interface RiayatiPatientVisit {
  visitNumber: string;
  emiratesId?: string;
  patientName?: string;
  patientFamilyName?: string;
  patientMrn?: string;
  patientDob?: Date;
  patientGender?: string;
  patientAddress?: string;
  patientCity?: string;
  patientEmirate?: string;
  patientCountry?: string;
  patientPhone?: string;
  patientLanguage?: string;
  doctorLicenseNo?: string;
  doctorName?: string;
  doctorLicenseProvider?: string;
  billType?: string;
  insuranceCompanyId?: string;
  insuranceProvider?: string;
}

export interface RiayatiDispenseRequest {
  visitNumber: string;
  invoiceNo: string;
  billType?: string;
  insuranceCompanyId?: string;
  insuranceProvider?: string;
  emiratesId?: string;
  patientName?: string;
  patientFamilyName?: string;
  patientMrn?: string;
  patientDob?: Date;
  patientGender?: string;
  patientAddress?: string;
  patientCity?: string;
  patientEmirate?: string;
  patientCountry?: string;
  patientPhone?: string;
  patientLanguage?: string;

  doctorLicenseNo: string;
  doctorName: string;
  doctorLicenseProvider?: string;

  drugCode: string;
  drugDescription: string;
  dispensedAt?: Date;
  quantity: number;
  unit?: string;
  route?: string;
  dosageForm?: string;

  strength?: number;
  strengthUnit?: string;
  lotNumber?: string;
  expiryDate?: Date;
  manufacturer?: string;
  packageSize?: number;
  packageUnit?: string;
  gtin?: string;
  dispenseType?: string;
  medicineCodeProvider?: string;

  prescriptionNo?: string;
  frequency?: string;
  duration?: string;
  timing?: string;
  totalDailyDose?: number;
}

export interface RiayatiSubmissionResult {
  success: boolean;
  visitNumber: string;
  ackCode?: string;
  status: 'Success' | 'Partial' | 'Failed' | 'Offline';
  details: {
    registerVisit?: Hl7AckResult;
    dispense?: Hl7AckResult;
    endVisit?: Hl7AckResult;
  };
  error?: string;
}

export class RiayatiHl7Service {
  private host: string;
  private port: number;
  private sendingApp: string;
  private sendingFacility: string;
  private facilityCode: string;
  private facilityName: string;
  private processingId: string;
  private static sequenceCounter = 0;

  constructor() {
    this.host = process.env.RIAYATI_HL7_HOST || '127.0.0.1';
    this.port = parseInt(process.env.RIAYATI_HL7_PORT || '2575', 10);
    this.sendingApp = process.env.RIAYATI_SENDING_APP || 'SUPERMARKET_POS';
    this.sendingFacility = process.env.RIAYATI_SENDING_FACILITY || '757';
    this.facilityCode = process.env.RIAYATI_FACILITY_CODE || '757';
    this.facilityName = process.env.RIAYATI_FACILITY_NAME || 'AL ETTIHAD PHARMACY';
    this.processingId = process.env.RIAYATI_PROCESSING_ID || 'T'; // 'T' = Test, 'P' = Production
  }

  public getEndpoint() {
    return {
      host: this.host,
      port: this.port,
      sendingApp: this.sendingApp,
      facilityCode: this.facilityCode,
      facilityName: this.facilityName,
      processingId: this.processingId,
    };
  }

  public async sendRegisterVisit(visit: RiayatiPatientVisit): Promise<Hl7AckResult> {
    const hl7 = this.buildAdtA04(visit);
    return sendMllpMessage(this.host, this.port, hl7);
  }

  public async sendDispense(dispenses: RiayatiDispenseRequest[]): Promise<Hl7AckResult> {
    if (!dispenses || dispenses.length === 0) {
      return { success: false, error: 'No dispense items provided' };
    }
    const hl7 = this.buildRdsO13(dispenses);
    return sendMllpMessage(this.host, this.port, hl7);
  }

  public async sendEndVisit(visit: RiayatiPatientVisit): Promise<Hl7AckResult> {
    const hl7 = this.buildAdtA03(visit);
    return sendMllpMessage(this.host, this.port, hl7);
  }

  public async queryPatientDemographics(emiratesId: string): Promise<{ success: boolean; result?: any; error?: string }> {
    const hl7 = this.buildQbpQ22(emiratesId);
    const ack = await sendMllpMessage(this.host, this.port, hl7);
    if (!ack.success && !ack.rawAck) {
      return { success: false, error: ack.error };
    }
    const parsed = this.parseRspK22(ack.rawAck || '');
    return { success: true, result: parsed };
  }

  /**
   * Executes the full 3-step Riayati HL7 Outpatient Dispense flow:
   * 1. ADT^A04 (Register visit)
   * 2. RDS^O13 (Dispense medications)
   * 3. ADT^A03 (Discharge / End visit)
   */
  public async submitFullDispenseFlow(
    visit: RiayatiPatientVisit,
    dispenses: RiayatiDispenseRequest[]
  ): Promise<RiayatiSubmissionResult> {
    const details: RiayatiSubmissionResult['details'] = {};

    // 1. ADT^A04 - Register Visit
    const regResult = await this.sendRegisterVisit(visit);
    details.registerVisit = regResult;

    if (!regResult.success) {
      const isConnRefused = regResult.error?.includes('ECONNREFUSED') || regResult.error?.includes('timed out');
      return {
        success: false,
        visitNumber: visit.visitNumber,
        status: isConnRefused ? 'Offline' : 'Failed',
        details,
        error: `ADT^A04 Visit Registration failed: ${regResult.error || regResult.ackCode || 'Unknown error'}`,
      };
    }

    // 2. RDS^O13 - Dispense All Items
    const dispResult = await this.sendDispense(dispenses);
    details.dispense = dispResult;

    if (!dispResult.success) {
      return {
        success: false,
        visitNumber: visit.visitNumber,
        status: 'Partial',
        details,
        error: `RDS^O13 Dispense failed: ${dispResult.error || dispResult.ackCode || 'Unknown error'}`,
      };
    }

    // 3. ADT^A03 - End Visit
    const endResult = await this.sendEndVisit(visit);
    details.endVisit = endResult;

    return {
      success: true,
      visitNumber: visit.visitNumber,
      ackCode: dispResult.ackCode || 'AA',
      status: 'Success',
      details,
    };
  }

  // ────────────────── Segment & Message Builders ──────────────────

  public buildAdtA04(v: RiayatiPatientVisit): string {
    const controlId = this.newMessageControlId();
    const nowStr = formatUaeDateTime(new Date());
    const evnTime = formatUaeDateTimeShort(new Date());

    let out = this.mshSegment('ADT', 'A04', 'ADT_A01', controlId, nowStr);
    out += `EVN|A04|${evnTime}\r`;
    out += this.pidSegment(v);
    out += this.pd1Segment(v.doctorLicenseNo, v.doctorName, v.doctorLicenseProvider);
    out += this.pv1Segment(v.visitNumber, v.doctorLicenseNo, v.doctorName, v.doctorLicenseProvider, false, nowStr);
    out += this.in1Segment(v.billType, v.insuranceCompanyId, v.insuranceProvider, v.patientName, v.patientFamilyName);
    return out;
  }

  public buildAdtA03(v: RiayatiPatientVisit): string {
    const controlId = this.newMessageControlId();
    const nowStr = formatUaeDateTime(new Date());
    const evnTime = formatUaeDateTimeShort(new Date());

    let out = this.mshSegment('ADT', 'A03', 'ADT_A03', controlId, nowStr);
    out += `EVN|A03|${evnTime}\r`;
    out += this.pidSegment(v);
    out += this.pd1Segment(v.doctorLicenseNo, v.doctorName, v.doctorLicenseProvider);
    out += this.pv1Segment(v.visitNumber, v.doctorLicenseNo, v.doctorName, v.doctorLicenseProvider, true, nowStr);
    out += this.in1Segment(v.billType, v.insuranceCompanyId, v.insuranceProvider, v.patientName, v.patientFamilyName);
    return out;
  }

  public buildRdsO13(dispenses: RiayatiDispenseRequest[]): string {
    const controlId = this.newMessageControlId();
    const nowStr = formatUaeDateTime(new Date());
    const first = dispenses[0];

    let out = this.mshSegment('RDS', 'O13', 'RDS_O13', controlId, nowStr);
    out += this.pidSegment(first);
    out += this.pv1Segment(first.visitNumber, first.doctorLicenseNo, first.doctorName, first.doctorLicenseProvider, true, nowStr);
    out += this.in1Segment(first.billType, first.insuranceCompanyId, first.insuranceProvider, first.patientName, first.patientFamilyName);

    for (let i = 0; i < dispenses.length; i++) {
      const d = dispenses[i];
      const lineNo = (i + 1).toString();
      const orderNo = `${d.invoiceNo}-${lineNo}`;
      const provider = this.buildProviderField(d.doctorLicenseNo, d.doctorName, d.doctorLicenseProvider);
      const dispensedAtStr = formatUaeDateTimeShort(d.dispensedAt || new Date());

      // ORC-7 Timing/Quantity matching Riayati standard:
      // qty^^duration^start^end^RT^^timing
      let durationDays = '1';
      if (d.duration) {
        const durMatch = String(d.duration).trim().match(/\d+/);
        if (durMatch && parseInt(durMatch[0], 10) > 0) {
          durationDays = durMatch[0];
        }
      }
      const parsedDays = parseInt(durationDays, 10) || 1;
      const startDate = formatUaeDate(d.dispensedAt || new Date());
      const endDateObj = new Date((d.dispensedAt || new Date()).getTime() + (parsedDays - 1) * 86400000);
      const endDate = formatUaeDate(endDateObj);
      const timing = (d.timing || 'Before Food').trim();
      const orc7 = `${d.quantity}^^${durationDays} Days^${startDate}^${endDate}^N^^${timing}`;

      // ORC segment
      out +=
        `ORC|NW|${orderNo}|${orderNo}||CM||${orc7}||${dispensedAtStr}|||${provider}||||||||||||||||N|MED|\r`;

      // TQ1 segment
      const repeatPattern = this.formatRepeatPattern(d.frequency);
      out += `TQ1|${lineNo}|${d.quantity}|${repeatPattern}\r`;

      // RXO segment
      const codingSystem = (d.medicineCodeProvider || 'DDC').trim();

      // Clean unitCode & unitText (e.g. "KG, KILOGRAM" -> code="KG", text="KILOGRAM")
      let unitCode = (d.strengthUnit || 'MG').trim();
      let unitText = unitCode;
      if (unitCode.includes(',')) {
        const uParts = unitCode.split(',');
        unitCode = uParts[0].trim();
        unitText = uParts[1]?.trim() || unitCode;
      } else if (unitCode.includes('^')) {
        const uParts = unitCode.split('^');
        unitCode = uParts[0].trim();
        unitText = uParts[1]?.trim() || unitCode;
      }
      const strengthUnitPair = unitCode ? `${unitCode}^${unitText}` : '';

      // Clean dosageForm (e.g. "VIAL, VIAL" -> code="VIAL", text="VIAL")
      let dfCode = (d.dosageForm || 'TAB').trim();
      let dfText = dfCode;
      if (dfCode.includes(',')) {
        const dfParts = dfCode.split(',');
        dfCode = dfParts[0].trim();
        dfText = dfParts[1]?.trim() || dfCode;
      } else if (dfCode.includes('^')) {
        const dfParts = dfCode.split('^');
        dfCode = dfParts[0].trim();
        dfText = dfParts[1]?.trim() || dfCode;
      }
      const dosageFormPair = dfCode ? `${dfCode}^${dfText}` : '';

      // Clean route (e.g. "PO, ORAL" -> code="PO", text="Oral")
      let routePair = 'PO^Oral';
      if (d.route) {
        const r = d.route.trim();
        if (r.includes('^')) {
          routePair = r;
        } else if (r.includes(',')) {
          const rParts = r.split(',');
          const rCode = rParts[0].trim();
          const rDesc = rParts[1]?.trim() || rCode;
          routePair = `${rCode}^${rDesc}`;
        } else {
          routePair = `${r}^${r}`;
        }
      }

      // Clean dispense unit & package unit
      let dispUnit = (d.unit || 'TAB').trim();
      let dispUnitText = dispUnit;
      if (dispUnit.includes(',')) {
        const p = dispUnit.split(',');
        dispUnit = p[0].trim();
        dispUnitText = p[1]?.trim() || dispUnit;
      } else if (dispUnit.includes('^')) {
        const p = dispUnit.split('^');
        dispUnit = p[0].trim();
        dispUnitText = p[1]?.trim() || dispUnit;
      }

      let pkgUnit = (d.packageUnit || 'BOX').trim();
      let pkgUnitText = pkgUnit;
      if (pkgUnit.includes(',')) {
        const p = pkgUnit.split(',');
        pkgUnit = p[0].trim();
        pkgUnitText = p[1]?.trim() || pkgUnit;
      } else if (pkgUnit.includes('^')) {
        const p = pkgUnit.split('^');
        pkgUnit = p[0].trim();
        pkgUnitText = p[1]?.trim() || pkgUnit;
      }

      const drugCode = (d.drugCode || 'UNKNOWN').trim();
      const drugDesc = (d.drugDescription || 'MEDICATION').trim();
      const drugGiveCode = `${drugCode}^${drugDesc}^${codingSystem}`;

      out += `RXO|${drugGiveCode}|${d.strength || ''}||${strengthUnitPair}|${dosageFormPair}||${routePair}|\r`;

      // RXD segment - RXD-12 Total Daily Dose (takes data from rx qty per day)
      let totalDailyDose = '';
      if (d.frequency) {
        const match = String(d.frequency).match(/\d+(\.\d+)?/);
        totalDailyDose = match ? match[0] : String(d.frequency).trim();
      } else if (d.totalDailyDose) {
        totalDailyDose = String(d.totalDailyDose);
      }
      const expDateStr = d.expiryDate ? formatUaeDate(d.expiryDate) : '';

      out +=
        `RXD|${lineNo}|${drugGiveCode}|${dispensedAtStr}|${d.quantity}|${dispUnit}^${dispUnitText}|^${dfCode}^|${d.prescriptionNo || ''}|||` +
        `${provider}||${totalDailyDose}||||${d.strength || ''}|${unitCode}|${d.lotNumber || 'BATCH01'}|${expDateStr}|${d.manufacturer || ''}||` +
        `${d.packageSize || 1}|${pkgUnit}^${pkgUnitText}||${d.gtin || ''}|||||||${d.dispenseType || 'N'}|\r`;

      // RXR segment
      if (d.route) {
        out += `RXR|${routePair}\r`;
      }
    }

    return out;
  }

  public buildQbpQ22(emiratesId: string): string {
    const controlId = this.newMessageControlId();
    const queryTag = this.newMessageControlId();
    const eid = (emiratesId || '').replace(/[- ]/g, '');
    const nowStr = formatUaeDateTime(new Date());

    let out = this.mshSegment('QBP', 'Q22', 'QBP_Q21', controlId, nowStr);
    out += `QPD|Q22^Find Candidates^HL70471|${queryTag}|@PID.3.1^${eid}~@PID.3.4^ICA~@PID.3.5^EID\r`;
    out += `RCP|I|5\r`;
    return out;
  }

  private parseRspK22(rawResponse: string): any {
    if (!rawResponse) return { found: false, queryStatus: 'EMPTY_RESPONSE' };

    const segments = rawResponse.replace(/\r\n/g, '\r').replace(/\n/g, '\r').split('\r');
    const result: any = { found: false };

    for (const seg of segments) {
      if (seg.startsWith('QAK|')) {
        const f = seg.split('|');
        result.queryStatus = f[2]; // OK, NF, AE
      } else if (seg.startsWith('PID|') && !result.found) {
        const f = seg.split('|');
        if (f[5]) {
          const parts = f[5].split('^');
          result.patientName = `${parts[1] || ''} ${parts[0] || ''}`.trim();
        }
        if (f[7]) result.dob = f[7];
        if (f[8]) result.gender = f[8];
        if (f[11]) result.address = f[11];
        if (f[13]) result.phone = f[13].split('^')[0];
        result.found = true;
      }
    }
    return result;
  }

  // ────────────────── Helper builders ──────────────────

  private mshSegment(type: string, trigger: string, struct: string, controlId: string, nowStr: string): string {
    const sendingFac = this.facilityCode || this.sendingFacility;
    return `MSH|^~\\&|${this.sendingApp}|${sendingFac}|RIAYATI|RIAYATI|${nowStr}||${type}^${trigger}^${struct}|${controlId}|${this.processingId}|2.5.1\r`;
  }

  private pd1Segment(doctorLic?: string, doctorName?: string, doctorAuth?: string): string {
    const provider = this.buildPd1ProviderField(doctorLic, doctorName, doctorAuth);
    return `PD1|U|U||${provider}|||||||0^Global OptIn|N\r`;
  }

  private buildPd1ProviderField(licenseNo?: string, name?: string, licenseProvider?: string): string {
    const resolvedLicense = (licenseNo || '').trim() || '12345';
    const resolvedName = (name || '').trim() || 'Pharmacist';
    const authority = (licenseProvider || '').trim() || 'MOHAP';

    const cleanName = resolvedName.replace(/^(Dr\.|Dr|Doctor|Mr\.|Mr|Ms\.|Ms|Mrs\.|Mrs)\s+/i, '').trim();
    const parts = cleanName.split(/\s+/).filter(Boolean);
    const family = parts.length > 1 ? parts[parts.length - 1] : cleanName;
    const given = parts.length > 1 ? parts.slice(0, parts.length - 1).join(' ') : '';

    return `${resolvedLicense}^${family}^${given}^^^^^^${authority}`;
  }

  private in1Segment(
    billType?: string,
    insuranceCompanyId?: string,
    insuranceProvider?: string,
    patientName?: string,
    patientFamilyName?: string
  ): string {
    let planId = 'SelfPay';
    let companyId = 'SelfPay';
    let companyName = 'Cash';

    if (billType && billType.toLowerCase() === 'insurance') {
      companyId = (insuranceCompanyId || '').trim() || 'Insurance';
      planId = companyId;
      companyName = (insuranceProvider || '').trim() || companyId;
    } else if (billType && billType.toLowerCase() === 'mohap') {
      planId = 'MOHAP';
      companyId = 'MOHAP';
      companyName = 'Ministry of Health and Prevention';
    }

    const todayDate = formatUaeDate(new Date());
    let insuredName = '';
    if (patientFamilyName && patientName) {
      insuredName = `${patientFamilyName.trim()}^${patientName.trim()}`;
    } else if (patientName) {
      const parts = patientName.trim().split(/\s+/).filter(Boolean);
      const fam = parts.length > 1 ? parts[parts.length - 1] : patientName.trim();
      const giv = parts.length > 1 ? parts.slice(0, parts.length - 1).join(' ') : '';
      insuredName = giv ? `${fam}^${giv}` : fam;
    } else if (patientFamilyName) {
      insuredName = patientFamilyName.trim();
    }

    // Exactly matching Riayati Sample: 33 pipes between insuredName and '0' (placing '0' at IN1-49)
    return (
      `IN1|1|${planId}|${companyId}|${companyName}||||||||${todayDate}|${todayDate}|||${insuredName}` +
      `|||||||||||||||||||||||||||||||||0\r`
    );
  }

  private pv1Segment(
    visitNumber: string,
    doctorLic?: string,
    doctorName?: string,
    doctorAuth?: string,
    includeDischarge = false,
    nowStr = ''
  ): string {
    const provider = doctorLic ? this.buildProviderField(doctorLic, doctorName, doctorAuth, true) : '';
    const dischargeTime = includeDischarge ? nowStr : '';
    const locationComposite = `PHARMACY^^^${this.facilityCode}^^^^^${this.facilityName}`;

    return (
      `PV1|1|O|${locationComposite}||||${provider}|||||||||||` +
      `${visitNumber}^^^${this.facilityCode}|||||||||||||||||||||||||` +
      `${nowStr}|${dischargeTime}\r`
    );
  }

  private pidSegment(data: {
    emiratesId?: string;
    patientName?: string;
    patientFamilyName?: string;
    patientMrn?: string;
    patientDob?: Date;
    patientGender?: string;
    patientAddress?: string;
    patientCity?: string;
    patientEmirate?: string;
    patientCountry?: string;
    patientPhone?: string;
    patientLanguage?: string;
  }): string {
    const eid = (data.emiratesId || '').replace(/[- ]/g, '') || '784199000000000';
    const mrn = data.patientMrn || eid;
    const patientId3 = `${mrn}^^^${this.facilityCode}^MRN~${eid}^^^ICA^EID`;

    let family = (data.patientFamilyName || '').trim();
    let given = (data.patientName || 'Patient').trim();

    if (!family && given.includes(' ')) {
      const parts = given.split(' ');
      family = parts.pop() || '';
      given = parts.join(' ');
    }

    let sex = 'U';
    if (data.patientGender) {
      const g = data.patientGender.toUpperCase();
      if (g.startsWith('M')) sex = 'M';
      else if (g.startsWith('F')) sex = 'F';
    }

    const dobStr = data.patientDob
      ? formatUaeDate(data.patientDob)
      : this.extractDobFromEmiratesId(eid) || '19900101';

    const langCode = this.formatLanguageCode(data.patientLanguage);
    const phone = this.formatPhoneComposite(data.patientPhone);
    const pid11 = this.formatAddressComposite(
      data.patientAddress,
      data.patientCity,
      data.patientEmirate,
      data.patientCountry
    );

    return (
      `PID|1||${patientId3}||${family}^${given}||${dobStr}|${sex}|||` +
      `${pid11}||${phone}||${langCode}||||||||||||||||\r`
    );
  }

  private formatAddressComposite(
    street?: string,
    city?: string,
    emirate?: string,
    country?: string,
    rawAddress?: string
  ): string {
    if (rawAddress && rawAddress.includes('^')) {
      const parts = rawAddress.split('^');
      const st = parts[0]?.trim() || '';
      const other = parts[1]?.trim() || '';
      const ct = parts[2]?.trim() || '';
      const em = parts[3]?.trim() || '';
      const zip = parts[4]?.trim() || '';
      const co = parts[5]?.trim() || 'ARE';
      const type = parts[6]?.trim() || 'H';
      return `${st}^${other}^${ct}^${em}^${zip}^${co}^${type}`;
    }

    const st = (street || rawAddress || '').trim();
    const ct = (city || '').trim();
    const em = (emirate || ct || '').trim();
    let co = (country || 'ARE').trim();
    if (co.toUpperCase().includes('EMIRATES') || co.toUpperCase().includes('UAE') || !co) {
      co = 'ARE';
    }

    if (st || ct || em) {
      return `${st}^^${ct}^${em}^^${co}^H`;
    }

    return '^^^^^ARE^H';
  }

  private formatPhoneComposite(phone?: string): string {
    if (!phone) return '';
    const clean = phone.trim();
    if (clean.includes('^')) return clean;
    return `${clean}^PRN^CP`;
  }

  private formatLanguageCode(lang?: string): string {
    if (!lang) return 'ARA';
    const l = lang.trim();
    if (l.includes(',')) {
      const parts = l.split(',');
      return (parts[1]?.trim() || parts[0]?.trim() || 'ARA').toUpperCase();
    }
    if (l.toUpperCase().startsWith('ENG')) return 'ENGL';
    if (l.toUpperCase().startsWith('ARA')) return 'ARA';
    return l.substring(0, 4).toUpperCase();
  }

  private buildProviderField(licenseNo: string, name?: string, authority = 'MOHAP', isPv1 = false): string {
    const cleanLic = licenseNo || 'MOH-GEN01';
    let family = '';
    let given = (name || 'Doctor').trim();
    if (given.includes(' ')) {
      const parts = given.split(' ');
      family = parts.pop() || '';
      given = parts.join(' ');
    }
    const auth = authority || 'MOHAP';
    return isPv1
      ? `${cleanLic}^${family}^${given}^^^^^^${auth}^^^`
      : `${cleanLic}^${family}^${given}^^^^^^${auth}`;
  }

  private formatRepeatPattern(frequency?: string): string {
    if (!frequency) return 'q.d.^every day';
    const clean = frequency.trim();
    if (clean.includes('^')) return clean;
    const match = clean.match(/[\d.]+/);
    const n = match ? parseFloat(match[0]) : 1;
    switch (n) {
      case 1:
        return 'q.d.^every day';
      case 2:
        return 'b.i.d^twice a day';
      case 3:
        return 't.i.d^3 times';
      case 4:
        return 'q.i.d^4 times a day';
      default:
        return `${n}.i.d^${n} times per day`;
    }
  }

  private extractDobFromEmiratesId(eid: string): string | null {
    const clean = eid.replace(/\D/g, '');
    if (clean.length === 15 && clean.startsWith('784')) {
      const year = clean.substring(3, 7);
      return `${year}0101`;
    }
    return null;
  }

  private newMessageControlId(): string {
    const seq = (++RiayatiHl7Service.sequenceCounter % 1000000).toString().padStart(6, '0');
    return `${formatUaeDateTime(new Date())}${seq}`;
  }
}

function parseDateSafe(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  const s = String(val).trim();
  if (!s || s.toLowerCase() === 'nannan' || s.toLowerCase() === 'invalid date') return null;
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const d = new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatUaeDateTime(d: any): string {
  const dt = parseDateSafe(d) || new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}${pad(dt.getHours())}${pad(dt.getMinutes())}${pad(dt.getSeconds())}`;
}

function formatUaeDateTimeShort(d: any): string {
  const dt = parseDateSafe(d) || new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}${pad(dt.getHours())}${pad(dt.getMinutes())}`;
}

function formatUaeDate(d: any): string {
  const dt = parseDateSafe(d);
  if (!dt) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}`;
}

export const riayatiHl7Service = new RiayatiHl7Service();
