import net from 'net';

export const MLLP_VT = 0x0b; // <VT> Start of Block
export const MLLP_FS = 0x1c; // <FS> End of Block
export const MLLP_CR = 0x0d; // <CR> Carriage Return

/**
 * Wraps an HL7 message string into an MLLP frame:
 * <VT> + normalized_message_ending_with_CR + <FS><CR>
 */
export function buildMllpFrame(hl7Message: string): Buffer {
  const normalized = hl7Message.replace(/\r\n/g, '\r').replace(/\n/g, '\r').replace(/\r+$/, '') + '\r';
  const body = Buffer.from(normalized, 'utf8');
  const frame = Buffer.alloc(1 + body.length + 2);
  frame[0] = MLLP_VT;
  body.copy(frame, 1);
  frame[frame.length - 2] = MLLP_FS;
  frame[frame.length - 1] = MLLP_CR;
  return frame;
}

/**
 * Extracts zero or more complete HL7 messages from an incoming MLLP stream buffer,
 * returning any incomplete remainder for subsequent chunks.
 */
export function extractMllpMessages(buffer: Buffer): { messages: string[]; remainder: Buffer } {
  const messages: string[] = [];
  let cursor = 0;

  while (cursor < buffer.length) {
    const vtIndex = buffer.indexOf(MLLP_VT, cursor);
    if (vtIndex === -1) {
      // No start of frame found
      return { messages, remainder: Buffer.alloc(0) };
    }

    const fsIndex = buffer.indexOf(MLLP_FS, vtIndex + 1);
    if (fsIndex === -1 || fsIndex + 1 >= buffer.length) {
      // Incomplete frame, preserve from vtIndex onwards
      return { messages, remainder: buffer.subarray(vtIndex) };
    }

    if (buffer[fsIndex + 1] === MLLP_CR) {
      // Valid frame found
      const msgBytes = buffer.subarray(vtIndex + 1, fsIndex);
      messages.push(msgBytes.toString('utf8'));
      cursor = fsIndex + 2;
    } else {
      // FS not followed by CR; advance cursor past FS and keep looking
      cursor = fsIndex + 1;
    }
  }

  return { messages, remainder: Buffer.alloc(0) };
}

export interface Hl7AckResult {
  success: boolean;
  ackCode?: string; // AA, AE, AR, CA, CE, CR
  ackedMessageControlId?: string;
  rawAck?: string;
  error?: string;
}

/**
 * Parses an HL7 ACK response: finds MSA-1 (Ack Code) and MSA-2 (Control ID).
 */
export function parseHl7Ack(rawAck: string): Hl7AckResult {
  if (!rawAck) {
    return { success: false, error: 'Empty HL7 response received' };
  }

  const segments = rawAck.replace(/\r\n/g, '\r').replace(/\n/g, '\r').split('\r');
  const msa = segments.find((s) => s.startsWith('MSA|'));
  if (!msa) {
    return { success: false, rawAck, error: 'No MSA segment in response' };
  }

  const fields = msa.split('|');
  const ackCode = fields[1]?.trim() || '';
  const ackedMessageControlId = fields[2]?.trim() || '';

  // AA = Application Accept, CA = Commit Accept
  const isAccepted = ackCode === 'AA' || ackCode === 'CA';
  const errSeg = segments.find((s) => s.startsWith('ERR|'));

  return {
    success: isAccepted,
    ackCode,
    ackedMessageControlId,
    rawAck,
    error: isAccepted ? undefined : `HL7 Rejected with code ${ackCode}${errSeg ? ': ' + errSeg : ''}`,
  };
}

/**
 * Sends a single HL7 message over TCP using MLLP framing and waits for the response frame.
 */
export function sendMllpMessage(
  host: string,
  port: number,
  hl7Message: string,
  timeoutMs = 8000
): Promise<Hl7AckResult> {
  return new Promise((resolve) => {
    let resolved = false;
    const socket = new net.Socket();
    let rxBuffer = Buffer.alloc(0);

    const safeResolve = (result: Hl7AckResult) => {
      if (resolved) return;
      resolved = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      try {
        const frame = buildMllpFrame(hl7Message);
        socket.write(frame);
      } catch (err: any) {
        safeResolve({ success: false, error: `Socket write error: ${err.message}` });
      }
    });

    socket.on('data', (chunk) => {
      rxBuffer = Buffer.concat([rxBuffer, chunk]);
      const { messages } = extractMllpMessages(rxBuffer);
      if (messages.length > 0) {
        const parsed = parseHl7Ack(messages[0]);
        safeResolve(parsed);
      }
    });

    socket.on('timeout', () => {
      safeResolve({ success: false, error: `Connection to HL7 endpoint ${host}:${port} timed out (${timeoutMs}ms)` });
    });

    socket.on('error', (err) => {
      safeResolve({ success: false, error: `HL7 connection error (${host}:${port}): ${err.message}` });
    });

    socket.on('close', () => {
      if (!resolved) {
        safeResolve({ success: false, error: 'Connection closed before HL7 response was received' });
      }
    });

    try {
      socket.connect(port, host);
    } catch (err: any) {
      safeResolve({ success: false, error: `Failed to initiate socket connection: ${err.message}` });
    }
  });
}
