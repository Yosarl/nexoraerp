import net from 'net';
import crypto from 'crypto';
import { MLLP_CR, MLLP_FS, MLLP_VT, buildMllpFrame, extractMllpMessages } from './hl7Mllp';

export interface Hl7ListenerLogEntry {
  id: string;
  timestamp: string;
  type: 'INFO' | 'INCOMING' | 'OUTGOING' | 'ERROR';
  messageType?: string;
  controlId?: string;
  summary: string;
  rawMessage?: string;
  rawResponse?: string;
}

export interface Hl7ListenerStatus {
  isRunning: boolean;
  port: number;
  totalReceived: number;
  activeConnections: number;
  startedAt?: string;
}

class Hl7MockListenerService {
  private server: net.Server | null = null;
  private port: number = 2575;
  private isRunning: boolean = false;
  private logs: Hl7ListenerLogEntry[] = [];
  private maxLogs: number = 300;
  private totalReceived: number = 0;
  private activeConnections: number = 0;
  private startedAt?: string;

  constructor() {
    this.addLog('INFO', 'HL7 Mock Listener initialized (stand-in for Riayati receiver).');
  }

  public getStatus(): Hl7ListenerStatus {
    return {
      isRunning: this.isRunning,
      port: this.port,
      totalReceived: this.totalReceived,
      activeConnections: this.activeConnections,
      startedAt: this.startedAt,
    };
  }

  public getLogs(limit = 100): Hl7ListenerLogEntry[] {
    return this.logs.slice(-limit).reverse();
  }

  public clearLogs(): void {
    this.logs = [];
    this.addLog('INFO', 'Logs cleared.');
  }

  public start(port = 2575): Promise<{ success: boolean; message: string; port: number }> {
    return new Promise((resolve, reject) => {
      if (this.isRunning && this.server) {
        if (this.port === port) {
          return resolve({ success: true, message: `Already running on port ${port}`, port });
        }
        // Port changed, stop existing first
        this.stop();
      }

      this.port = port;
      this.server = net.createServer((socket) => this.handleClient(socket));

      this.server.on('error', (err: any) => {
        this.isRunning = false;
        this.addLog('ERROR', `Listener error on port ${this.port}: ${err.message}`);
        reject(err);
      });

      this.server.listen(this.port, () => {
        this.isRunning = true;
        this.startedAt = new Date().toISOString();
        this.addLog('INFO', `HL7 Mock Listener running on TCP port ${this.port} (Ready to receive MLLP messages).`);
        resolve({ success: true, message: `HL7 Mock Listener started on port ${this.port}`, port: this.port });
      });
    });
  }

  public stop(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      if (!this.isRunning || !this.server) {
        this.isRunning = false;
        return resolve({ success: true, message: 'Listener is not running' });
      }

      this.server.close(() => {
        this.isRunning = false;
        this.server = null;
        this.activeConnections = 0;
        this.addLog('INFO', `HL7 Mock Listener stopped on port ${this.port}.`);
        resolve({ success: true, message: `Listener stopped successfully` });
      });
    });
  }

  private handleClient(socket: net.Socket) {
    this.activeConnections++;
    const clientRemote = `${socket.remoteAddress}:${socket.remotePort}`;
    let rxBuffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      rxBuffer = Buffer.concat([rxBuffer, chunk]);
      const { messages, remainder } = extractMllpMessages(rxBuffer);
      rxBuffer = Buffer.from(remainder);

      for (const msg of messages) {
        this.totalReceived++;
        this.processIncomingMessage(socket, msg, clientRemote);
      }
    });

    socket.on('error', (err) => {
      this.addLog('ERROR', `Connection error with ${clientRemote}: ${err.message}`);
    });

    socket.on('close', () => {
      this.activeConnections = Math.max(0, this.activeConnections - 1);
    });
  }

  private processIncomingMessage(socket: net.Socket, rawMessage: string, clientRemote: string) {
    const segments = rawMessage.replace(/\r\n/g, '\r').replace(/\n/g, '\r').split('\r');
    const msh = segments.find((s) => s.startsWith('MSH|')) || '';
    const mshFields = msh.split('|');

    // MSH-3: Sending App, MSH-4: Sending Facility
    const sendingApp = mshFields[2] || 'UNKNOWN_APP';
    const sendingFacility = mshFields[3] || 'UNKNOWN_FACILITY';
    // MSH-9: Message Type (e.g. ADT^A04^ADT_A01, RDS^O13^RDS_O13, QBP^Q22^QBP_Q21)
    const messageType = mshFields[8] || 'UNKNOWN';
    // MSH-10: Message Control ID
    const originalControlId = mshFields[9] || 'MSG_UNKNOWN';

    const nowStr = formatUaeTimestamp(new Date());

    let ackMessage: string;
    let responseSummary: string;

    if (messageType.startsWith('QBP^Q22')) {
      // Find Candidates Query -> return RSP^K22 mock demographics
      ackMessage = this.buildRspK22(segments, originalControlId, sendingApp, sendingFacility, nowStr);
      responseSummary = `Sent RSP^K22 (Mock Demographics response) for control ID ${originalControlId}`;
    } else {
      // Standard ACK (AA) for ADT^A04, RDS^O13, ADT^A03, etc.
      ackMessage =
        `MSH|^~\\&|RIAYATI-MOCK|RIAYATI-MOCK|${sendingApp}|${sendingFacility}|${nowStr}||ACK|${crypto.randomUUID().replace(/-/g, '')}|P|2.5.1\r` +
        `MSA|AA|${originalControlId}\r`;
      responseSummary = `Sent ACK (AA) for ${messageType} (Control ID: ${originalControlId})`;
    }

    this.addLog(
      'INCOMING',
      `Received ${messageType} from ${clientRemote} (Control ID: ${originalControlId})`,
      messageType,
      originalControlId,
      rawMessage,
      ackMessage
    );

    // Send back MLLP frame
    try {
      const responseFrame = buildMllpFrame(ackMessage);
      socket.write(responseFrame);
      this.addLog('OUTGOING', responseSummary, messageType, originalControlId, undefined, ackMessage);
    } catch (err: any) {
      this.addLog('ERROR', `Failed writing ACK to ${clientRemote}: ${err.message}`);
    }
  }

  private buildRspK22(
    segments: string[],
    originalControlId: string,
    sendingApp: string,
    sendingFacility: string,
    nowStr: string
  ): string {
    const qpd = segments.find((s) => s.startsWith('QPD|')) || '';
    const qpdFields = qpd.split('|');
    const queryTag = qpdFields[2] || crypto.randomUUID().replace(/-/g, '');

    let eid = '784198501234567';
    if (qpdFields[3]) {
      const marker = '@PID.3.1^';
      const idx = qpdFields[3].indexOf(marker);
      if (idx >= 0) {
        const rest = qpdFields[3].substring(idx + marker.length);
        const end = rest.indexOf('~');
        eid = end >= 0 ? rest.substring(0, end) : rest;
      }
    }

    return (
      `MSH|^~\\&|RIAYATI-MOCK|RIAYATI-MOCK|${sendingApp}|${sendingFacility}|${nowStr}||RSP^K22^RSP_K21|${crypto.randomUUID().replace(/-/g, '')}|P|2.5.1\r` +
      `MSA|AA|${originalControlId}\r` +
      `QAK|${queryTag}|OK|Q22^Find Candidates^HL70471|1\r` +
      `QPD|Q22^Find Candidates^HL70471|${queryTag}|@PID.3.1^${eid}\r` +
      `PID|1||${eid}^^^ICA^EID||Mohammed^Ahmed||19880520|M|||Dubai^^Dubai^^^AE||0501234567\r`
    );
  }

  private addLog(
    type: 'INFO' | 'INCOMING' | 'OUTGOING' | 'ERROR',
    summary: string,
    messageType?: string,
    controlId?: string,
    rawMessage?: string,
    rawResponse?: string
  ) {
    const entry: Hl7ListenerLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      type,
      messageType,
      controlId,
      summary,
      rawMessage,
      rawResponse,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }
}

function formatUaeTimestamp(d: Date): string {
  // Format as YYYYMMDDHHmmss
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

export const hl7MockListener = new Hl7MockListenerService();
