'use client';

import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';

const ATT_MTU = 23;
const MAX_WRITE_BYTES = ATT_MTU - 3; // ATT header leaves 20 bytes
const CHUNK_HEADER_BYTES = 1;
const MAX_CHUNK_PAYLOAD = MAX_WRITE_BYTES - CHUNK_HEADER_BYTES;
const CHUNK_DELAY_MS = 30;
const DEVICE_NAME_PREFIX = 'TMbot';
const TRANSFER_RATE_BPS = 180;
const TRANSFER_BYTES = 123;
const TRANSFER_DURATION_MS = 1000;

const UPLOAD_OPCODES = {
  START: 0x01,
  CHUNK: 0x02,
  CANCEL: 0x03,
  END: 0x04,
} as const;

const STATUS_OPCODES = {
  START: 0x01,
  CONT: 0x02,
  END: 0x03,
} as const;

type BLEDevice = BluetoothDevice & { id?: string };
type ProjectSummary = { id: string; name: string; createdAt: string };
type Layout = number[][][];
type WritableCharacteristic = BluetoothRemoteGATTCharacteristic & {
  writeValueWithoutResponse?: (data: BufferSource) => Promise<void>;
  writeValueWithResponse?: (data: BufferSource) => Promise<void>;
};
type ExtendedBluetooth = Bluetooth & {
  getDevices?: () => Promise<BluetoothDevice[]>;
};

type ServiceProfile = {
  id: 'tmgrid';
  label: string;
  service: BluetoothServiceUUID;
  statusCharacteristic: BluetoothCharacteristicUUID;
  uploadCharacteristic: BluetoothCharacteristicUUID;
};

const SERVICE_PROFILES: ServiceProfile[] = [
  {
    id: 'tmgrid',
    label: 'TMbot grid service',
    service: '12345678-1234-5678-1234-56789abc0000',
    statusCharacteristic: '12345678-1234-5678-1234-56789abc0002',
    uploadCharacteristic: '12345678-1234-5678-1234-56789abc0001',
  },
];

const OPTIONAL_SERVICES = [...new Set(SERVICE_PROFILES.map((profile) => profile.service))];

type StatusAssembler = {
  expected: number | null;
  buffer: Uint8Array;
  complete: boolean;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBluetooth(): ExtendedBluetooth | null {
  if (!('bluetooth' in navigator)) {
    return null;
  }
  return navigator.bluetooth as ExtendedBluetooth;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
}

function createStatusAssembler(): StatusAssembler {
  return { expected: null, buffer: new Uint8Array(0), complete: false };
}

function resetStatusAssembler(assembler: StatusAssembler) {
  assembler.expected = null;
  assembler.buffer = new Uint8Array(0);
  assembler.complete = false;
}

function appendUint8Arrays(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

type DecodedStatus = {
  payload: unknown | null;
  text: string;
  error: string | null;
};

function decodeStatusBuffer(buffer: Uint8Array): DecodedStatus {
  if (!buffer.length) {
    return { payload: null, text: '', error: 'Status payload is empty.' };
  }
  const text = textDecoder.decode(buffer);
  try {
    const payload = JSON.parse(text);
    return { payload, text, error: null };
  } catch (error) {
    return { payload: null, text, error: getErrorMessage(error, 'Invalid status payload.') };
  }
}

function finalizeStatusAssembler(assembler: StatusAssembler) {
  const result = decodeStatusBuffer(assembler.buffer);
  resetStatusAssembler(assembler);
  if (result.error) {
    const statusError = new Error(result.error);
    (statusError as { rawStatus?: string }).rawStatus = result.text;
    throw statusError;
  }
  return result.payload;
}

function createStartFrame(totalLength: number) {
  const frame = new Uint8Array(5);
  const view = new DataView(frame.buffer);
  frame[0] = UPLOAD_OPCODES.START;
  view.setUint32(1, totalLength, true);
  if (frame.byteLength > MAX_WRITE_BYTES) {
    throw new Error(`START frame exceeds ATT write budget (${frame.byteLength}/${MAX_WRITE_BYTES})`);
  }
  return frame;
}

function createChunkFrame(payload: Uint8Array, offset: number, length: number) {
  if (length <= 0 || length > MAX_CHUNK_PAYLOAD) {
    throw new Error(
      `Requested chunk length ${length} outside allowed range (1-${MAX_CHUNK_PAYLOAD})`,
    );
  }
  const frame = new Uint8Array(length + CHUNK_HEADER_BYTES);
  frame[0] = UPLOAD_OPCODES.CHUNK;
  frame.set(payload.subarray(offset, offset + length), CHUNK_HEADER_BYTES);
  if (frame.byteLength > MAX_WRITE_BYTES) {
    throw new Error(`Chunk frame exceeds ATT write budget (${frame.byteLength}/${MAX_WRITE_BYTES})`);
  }
  return frame;
}

async function writeFrame(characteristic: WritableCharacteristic, frame: Uint8Array) {
  if (frame.byteLength > MAX_WRITE_BYTES) {
    throw new Error(`Frame length ${frame.byteLength} exceeds ATT write budget ${MAX_WRITE_BYTES}`);
  }
  if (typeof characteristic.writeValueWithResponse === 'function') {
    await characteristic.writeValueWithResponse(frame);
    return;
  }
  if (typeof characteristic.writeValue === 'function') {
    await characteristic.writeValue(frame);
    return;
  }
  if (typeof characteristic.writeValueWithoutResponse === 'function') {
    await characteristic.writeValueWithoutResponse(frame);
    return;
  }
  throw new Error('Characteristic does not support write operations');
}

async function sendChunkedPayload(
  characteristic: WritableCharacteristic,
  payload: Uint8Array,
  onProgress?: (bytesSent: number) => void,
) {
  await writeFrame(characteristic, createStartFrame(payload.length));
  await delay(CHUNK_DELAY_MS);
  if (onProgress) {
    onProgress(0);
  }
  for (let offset = 0; offset < payload.length; offset += MAX_CHUNK_PAYLOAD) {
    const length = Math.min(MAX_CHUNK_PAYLOAD, payload.length - offset);
    const frame = createChunkFrame(payload, offset, length);
    await writeFrame(characteristic, frame);
    await delay(CHUNK_DELAY_MS);
    if (onProgress) {
      onProgress(Math.min(payload.length, offset + length));
    }
  }
  await writeFrame(characteristic, new Uint8Array([UPLOAD_OPCODES.END]));
  if (onProgress) {
    onProgress(payload.length);
  }
}

function processStatusFrame(frame: Uint8Array, assembler: StatusAssembler) {
  if (!frame.length) {
    throw new Error('Empty status notification frame');
  }
  const opcode = frame[0];

  if (
    opcode !== STATUS_OPCODES.START &&
    opcode !== STATUS_OPCODES.CONT &&
    opcode !== STATUS_OPCODES.END
  ) {
    const result = decodeStatusBuffer(frame);
    resetStatusAssembler(assembler);
    if (result.error) {
      const statusError = new Error(result.error);
      (statusError as { rawStatus?: string }).rawStatus = result.text;
      throw statusError;
    }
    return result.payload;
  }

  if (opcode === STATUS_OPCODES.START) {
    if (frame.length < 5) {
      throw new Error('START frame too short');
    }
    const expected = new DataView(frame.buffer, frame.byteOffset + 1, 4).getUint32(0, true);
    const chunk = frame.slice(5);
    if (expected === 0 && chunk.length > 0) {
      assembler.expected = chunk.length;
      assembler.buffer = chunk;
      assembler.complete = true;
      return finalizeStatusAssembler(assembler);
    }
    assembler.expected = expected;
    assembler.buffer = chunk;
    if (chunk.length > expected) {
      console.warn(
        `STATUS warning: START chunk (${chunk.length}B) longer than advertised length (${expected}B). Using actual chunk length.`,
      );
      assembler.expected = chunk.length;
      assembler.complete = true;
      return finalizeStatusAssembler(assembler);
    }
    assembler.complete = chunk.length === expected;
    if (assembler.complete) {
      return finalizeStatusAssembler(assembler);
    }
    return null;
  }

  if (opcode === STATUS_OPCODES.CONT) {
    if (assembler.expected == null) {
      throw new Error('CONT frame received before START');
    }
    const chunk = frame.slice(1);
    let combined = appendUint8Arrays(assembler.buffer, chunk);
    if (combined.length > (assembler.expected ?? combined.length)) {
      console.warn(
        `STATUS warning: payload longer than expected (${combined.length}/${assembler.expected}); adjusting to combined length.`,
      );
      assembler.expected = combined.length;
    }
    if (assembler.expected != null && combined.length > assembler.expected) {
      combined = combined.slice(0, assembler.expected);
    }
    assembler.buffer = combined;
    assembler.complete = assembler.expected != null && combined.length >= assembler.expected;
    if (assembler.complete) {
      return finalizeStatusAssembler(assembler);
    }
    return null;
  }

  if (opcode === STATUS_OPCODES.END) {
    if (assembler.expected == null) {
      console.warn('STATUS END received without START');
      resetStatusAssembler(assembler);
      return null;
    }
    if (!assembler.complete && assembler.expected != null) {
      console.warn(
        `STATUS END received before payload complete (${assembler.buffer.length}/${assembler.expected}). Attempting to decode partial payload.`,
      );
    }
    return finalizeStatusAssembler(assembler);
  }

  throw new Error(`Unknown status opcode ${opcode}`);
}

export default function BindRobotPage() {
  const router = useRouter();

  const [devices, setDevices] = useState<BLEDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState<boolean>(false);
  const [projectsError, setProjectsError] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [layout, setLayout] = useState<Layout>([]);
  const [layoutLoading, setLayoutLoading] = useState<boolean>(false);
  const [layoutError, setLayoutError] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [connectProgress, setConnectProgress] = useState<number>(0);
  const [sendProgressTotal, setSendProgressTotal] = useState<number>(0);
  const [sendProgressBytes, setSendProgressBytes] = useState<number>(0);
  const [sendProgressVisual, setSendProgressVisual] = useState<number>(0);

  const serverRef = useRef<BluetoothRemoteGATTServer | null>(null);
  const txCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const rxCharRef = useRef<WritableCharacteristic | null>(null);
  const profileRef = useRef<ServiceProfile | null>(null);
  const statusAssemblerRef = useRef<StatusAssembler>(createStatusAssembler());
  const progressAnimationRef = useRef<number | null>(null);
  const progressStartRef = useRef<number | null>(null);
  const sendProgressAnimationRef = useRef<number | null>(null);
  const sendProgressStartRef = useRef<number | null>(null);
  const sendProgressBytesRef = useRef<number>(0);

  const updateSendProgressBytes = (value: number) => {
    const clamped = Math.max(0, value);
    sendProgressBytesRef.current = clamped;
    setSendProgressBytes(clamped);
    setSendProgressVisual((prev) => (clamped > prev ? clamped : prev));
  };

  const resetSendProgress = () => {
    if (sendProgressAnimationRef.current != null) {
      cancelAnimationFrame(sendProgressAnimationRef.current);
      sendProgressAnimationRef.current = null;
    }
    sendProgressStartRef.current = null;
    sendProgressBytesRef.current = 0;
    setSendProgressTotal(0);
    setSendProgressBytes(0);
    setSendProgressVisual(0);
  };

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedId) ?? null,
    [devices, selectedId],
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    async function restoreDevices() {
      const bluetooth = getBluetooth();
      if (!bluetooth) {
        setMessage('Bluetooth API is not available in this browser.');
        return;
      }

      if (bluetooth.getDevices) {
        try {
          const savedDevices = (await bluetooth.getDevices()) as BLEDevice[];
          if (savedDevices.length > 0) {
            setDevices(savedDevices);
            setSelectedId(savedDevices[0].id || null);
            setMessage(`Restored device: ${savedDevices[0].name || savedDevices[0].id}`);
            return;
          }
        } catch (error) {
          console.error('bluetooth.getDevices failed:', error);
        }
      }

      const raw = localStorage.getItem('savedDevice');
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { id?: string; name?: string };
          setDevices([{ id: parsed.id, name: parsed.name } as BLEDevice]);
          setSelectedId(parsed.id ?? null);
          setMessage(`Saved device: ${parsed.name || parsed.id}`);
        } catch {
          localStorage.removeItem('savedDevice');
        }
      }
    }

    restoreDevices();
  }, []);

  useEffect(() => {
    if (status === 'connecting') {
      setConnectProgress(0);
      progressStartRef.current = null;

      const animate = (timestamp: number) => {
        if (progressStartRef.current == null) {
          progressStartRef.current = timestamp;
        }
        const elapsed = timestamp - progressStartRef.current;
        const progress = Math.min(
          TRANSFER_BYTES,
          (elapsed / TRANSFER_DURATION_MS) * TRANSFER_BYTES,
        );
        setConnectProgress(progress);
        if (elapsed < TRANSFER_DURATION_MS) {
          progressAnimationRef.current = requestAnimationFrame(animate);
        } else {
          progressAnimationRef.current = null;
        }
      };

      progressAnimationRef.current = requestAnimationFrame(animate);

      return () => {
        if (progressAnimationRef.current != null) {
          cancelAnimationFrame(progressAnimationRef.current);
          progressAnimationRef.current = null;
        }
      };
    }

    if (progressAnimationRef.current != null) {
      cancelAnimationFrame(progressAnimationRef.current);
      progressAnimationRef.current = null;
    }

    setConnectProgress(status === 'connected' ? TRANSFER_BYTES : 0);

    return undefined;
  }, [status]);

  useEffect(() => {
    if (!isSending || sendProgressTotal <= 0) {
      if (sendProgressAnimationRef.current != null) {
        cancelAnimationFrame(sendProgressAnimationRef.current);
        sendProgressAnimationRef.current = null;
      }
      sendProgressStartRef.current = null;
      if (!isSending) {
        setSendProgressVisual(0);
      }
      return undefined;
    }

    const durationMs = Math.max(1, (sendProgressTotal / TRANSFER_RATE_BPS) * 1000);

    const animate = (timestamp: number) => {
      if (!isSending) {
        sendProgressAnimationRef.current = null;
        return;
      }
      if (sendProgressStartRef.current == null) {
        sendProgressStartRef.current = timestamp;
      }
      const elapsed = timestamp - sendProgressStartRef.current;
      const estimated = Math.min(sendProgressTotal, (elapsed / durationMs) * sendProgressTotal);
      const target = Math.max(sendProgressBytesRef.current, estimated);
      setSendProgressVisual(target);

      if (sendProgressBytesRef.current >= sendProgressTotal && target >= sendProgressTotal) {
        sendProgressAnimationRef.current = null;
        return;
      }

      sendProgressAnimationRef.current = requestAnimationFrame(animate);
    };

    sendProgressAnimationRef.current = requestAnimationFrame(animate);

    return () => {
      if (sendProgressAnimationRef.current != null) {
        cancelAnimationFrame(sendProgressAnimationRef.current);
        sendProgressAnimationRef.current = null;
      }
    };
  }, [isSending, sendProgressTotal]);

  useEffect(() => {
    let cancelled = false;

    async function fetchProjects() {
      setProjectsLoading(true);
      setProjectsError('');
      try {
        const me = await fetch('/api/me');
        if (me.status === 401) {
          router.replace('/login');
          return;
        }

        const response = await fetch('/api/projects');
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to load projects');
        }

        const data = await response.json();
        if (cancelled) return;
        const projectList: ProjectSummary[] = data.projects ?? [];
        setProjects(projectList);
        if (projectList.length > 0) {
          setSelectedProjectId(projectList[0].id);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setProjectsError(getErrorMessage(error, 'Failed to load projects'));
        }
      } finally {
        if (!cancelled) {
          setProjectsLoading(false);
        }
      }
    }

    fetchProjects();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedProjectId) {
      setLayout([]);
      setLayoutError('');
      return;
    }

    let cancelled = false;

    async function fetchLayout() {
      setLayoutLoading(true);
      setLayoutError('');
      try {
        const response = await fetch(`/api/projects/${selectedProjectId}`);
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to load project layout');
        }

        const data = await response.json();
        if (cancelled) return;

        const svgRaw = data.project?.svg;
        if (!svgRaw) {
          setLayout([]);
          setLayoutError('The selected project does not contain a saved layout.');
          return;
        }

        try {
          const parsed = JSON.parse(svgRaw);
          if (!Array.isArray(parsed)) {
            throw new Error('Layout must be an array of tiles.');
          }
          setLayout(parsed as Layout);
        } catch (error: unknown) {
          setLayout([]);
          setLayoutError(getErrorMessage(error, 'Failed to parse layout data.'));
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setLayout([]);
          setLayoutError(getErrorMessage(error, 'Failed to load layout.'));
        }
      } finally {
        if (!cancelled) {
          setLayoutLoading(false);
        }
      }
    }

    fetchLayout();

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const saveDevice = (device: BLEDevice) => {
    localStorage.setItem('savedDevice', JSON.stringify({ id: device.id, name: device.name }));
  };

  const requestNewDevice = async () => {
    try {
      const bluetooth = getBluetooth();
      if (!bluetooth) {
        setStatus('error');
        setMessage('Bluetooth API is not available in this browser.');
        return null;
      }
      const device = (await bluetooth.requestDevice({
        filters: [{ namePrefix: DEVICE_NAME_PREFIX }],
        optionalServices: OPTIONAL_SERVICES,
      })) as BLEDevice;
      setDevices([device]);
      setSelectedId(device.id || null);
      saveDevice(device);
      setMessage(`New device selected: ${device.name || device.id}`);
      return device;
    } catch (error: unknown) {
      setStatus('error');
      setMessage(getErrorMessage(error, 'Device selection cancelled'));
      return null;
    }
  };

  const onConnectClick = async () => {
    let device = selectedDevice;

    const ensureConnectedDevice = async () => {
      if (!device || !device.gatt) {
        device = await requestNewDevice();
        if (!device || !device.gatt) return null;
      }

      if (device.gatt.connected) {
        return device;
      }

      try {
        await device.gatt.connect();
        return device;
      } catch (error) {
        console.warn('Failed to reconnect; requesting new device.', error);
        device = await requestNewDevice();
        if (!device || !device.gatt) return null;
        await device.gatt.connect();
        return device;
      }
    };

    setStatus('connecting');

    try {
      const ensuredDevice = await ensureConnectedDevice();
      if (!ensuredDevice || !ensuredDevice.gatt) {
        setStatus('error');
        setMessage('Bluetooth connection cancelled or unavailable.');
        return;
      }

      device = ensuredDevice;
      setMessage(`Connecting to ${device.name || device.id || 'device'}...`);

      let server = await device.gatt.connect();
      serverRef.current = server;

      let attached = false;
      let lastError: unknown = null;

      for (const profile of SERVICE_PROFILES) {
        try {
          if (!server.connected) {
            server = await device.gatt.connect();
          }
          const service = await server.getPrimaryService(profile.service);
          const statusCharacteristic = await service.getCharacteristic(profile.statusCharacteristic);
          const uploadCharacteristic = (await service.getCharacteristic(
            profile.uploadCharacteristic,
          )) as WritableCharacteristic;

          statusAssemblerRef.current = createStatusAssembler();

          await statusCharacteristic.startNotifications();
          statusCharacteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
            const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
            const value = characteristic.value;
            if (!value) {
              return;
            }

            const frame = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
            try {
              const payload = processStatusFrame(frame, statusAssemblerRef.current);
              if (payload != null) {
                setMessage(`Robot status: ${JSON.stringify(payload)}`);
              }
            } catch (notificationError) {
              console.error('Failed to decode status frame', notificationError);
              const errorMessage = getErrorMessage(notificationError, 'Failed to decode status frame.');
              const rawStatus = (notificationError as { rawStatus?: string }).rawStatus;
              const details = rawStatus ? `${errorMessage} Raw: ${rawStatus}` : errorMessage;
              setMessage(details);
              resetStatusAssembler(statusAssemblerRef.current);
            }
          });

          try {
            const snapshot = await statusCharacteristic.readValue();
            const snapshotView = new Uint8Array(
              snapshot.buffer,
              snapshot.byteOffset,
              snapshot.byteLength,
            );
            if (snapshotView.length) {
              const decoded = decodeStatusBuffer(snapshotView);
              if (decoded.error) {
                console.warn('Failed to parse status snapshot', decoded.error, decoded.text);
                setMessage(`${decoded.error}${decoded.text ? ` Raw: ${decoded.text}` : ''}`);
              } else if (decoded.payload != null) {
                setMessage(`Robot status: ${JSON.stringify(decoded.payload)}`);
              }
            }
          } catch (snapshotReadError) {
            console.warn('Failed to read initial status snapshot', snapshotReadError);
          }

          profileRef.current = profile;
          txCharRef.current = statusCharacteristic;
          rxCharRef.current = uploadCharacteristic;
          attached = true;
          break;
        } catch (error) {
          lastError = error;
          console.warn(`Failed to attach profile ${profile.id}`, error);
        }
      }

      if (!attached || !txCharRef.current || !rxCharRef.current) {
        profileRef.current = null;
        txCharRef.current = null;
        rxCharRef.current = null;
        setMessage(
          `Connected, but characteristics are unavailable. ${
            (lastError as Error | undefined)?.message ?? ''
          }`,
        );
      } else {
        const activeProfile = profileRef.current;
        setMessage(
          `Connected to robot (${activeProfile?.label ?? 'unknown profile'}). Ready to send layout.`,
        );
      }

      setStatus(attached ? 'connected' : 'error');
    } catch (error: unknown) {
      setStatus('error');
      setMessage(getErrorMessage(error, 'Failed to connect.'));
    }
  };

  const sendLayoutToRobot = async () => {
    const uploadCharacteristic = rxCharRef.current;
    const profile = profileRef.current;
    if (!uploadCharacteristic || status !== 'connected' || !profile) {
      setMessage('Connect to the robot before sending the layout.');
      return;
    }
    if (!layout.length) {
      setMessage('No layout available for transmission.');
      return;
    }

    setIsSending(true);

    try {
      const payload = textEncoder.encode(JSON.stringify(layout));
      if (!payload.length) {
        setMessage('Layout payload is empty.');
        return;
      }

      setSendProgressTotal(payload.length);
      updateSendProgressBytes(0);
      setSendProgressVisual(0);
      sendProgressStartRef.current = null;

      setMessage(`Transferring layout to the robot (${payload.length} bytes)...`);

      if (payload.length <= MAX_WRITE_BYTES) {
        await writeFrame(uploadCharacteristic, payload);
        updateSendProgressBytes(payload.length);
      } else {
        await sendChunkedPayload(uploadCharacteristic, payload, updateSendProgressBytes);
      }

      setMessage(`Layout sent successfully (${payload.length} bytes).`);
    } catch (error: unknown) {
      console.error('Failed to send layout', error);
      try {
        await writeFrame(uploadCharacteristic, new Uint8Array([UPLOAD_OPCODES.CANCEL]));
      } catch (cancelError) {
        console.warn('Failed to send cancel frame', cancelError);
      }
      setStatus('error');
      setMessage(getErrorMessage(error, 'Failed to send layout.'));
    } finally {
      setIsSending(false);
      resetSendProgress();
    }
  };

  const tilesCount = layout.length;
  const firstTilePoints = layout[0]?.length ?? 0;
  const connectProgressPercent =
    TRANSFER_BYTES > 0 ? Math.min(100, (connectProgress / TRANSFER_BYTES) * 100) : 0;
  const sendProgressPercent =
    sendProgressTotal > 0 ? Math.min(100, (sendProgressVisual / sendProgressTotal) * 100) : 0;
  const displayedSendBytes = Math.min(sendProgressTotal, Math.round(sendProgressBytes));

  return (
    <>
      <Head>
        <title>Robot Bluetooth binding</title>
      </Head>
      <main
        className="flex w-full h-screen bg-cover bg-center bg-no-repeat min-h-screen bg-[#0f1533] items-center justify-center relative overflow-hidden"
        style={{ backgroundImage: "url('/background1.png')" }}
      >
        <div className="absolute w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-lime-300 via-green-400 to-blue-300 opacity-30 animate-spin-slow rounded-full z-0" />
        <div className="relative z-10 bg-[#1b2060]/80 rounded-[35px] w-[40%] max-w-[900px] h-[85%] text-center shadow-2xl flex flex-col gap-[20px] p-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#A8FF60]">Bluetooth connection</h1>

          <div className="rounded-[28px] bg-[#1b2060]/80 p-4 flex flex-col gap-3 text-left">
            <h2 className="text-xl font-semibold text-[#A8FF60]">Layout to send</h2>
            {projectsLoading ? (
              <p className="text-[#A8FF60]/80">Loading projects...</p>
            ) : projectsError ? (
              <p className="text-red-400 text-sm">{projectsError}</p>
            ) : projects.length === 0 ? (
              <p className="text-[#A8FF60]/70">No projects with saved layouts yet.</p>
            ) : (
              <label className="flex flex-col gap-2 text-sm text-[#A8FF60]/80">
                Select project
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="rounded-full bg-[#90d67f] text-[#1b2060] px-4 py-2 text-base"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {layoutLoading && <p className="text-[#A8FF60]/80">Loading layout...</p>}
            {layoutError && <p className="text-red-400 text-sm">{layoutError}</p>}

            {layout.length > 0 && (
              <div className="text-xs text-[#A8FF60]/70 space-y-1">
                <p>Tiles: {tilesCount}</p>
                <p>Points in first tile: {firstTilePoints}</p>
                {selectedProject && (
                  <p>Project: {selectedProject.name}</p>
                )}
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={sendLayoutToRobot}
              disabled={status !== 'connected' || !layout.length || isSending}
              className="bg-[#D5EA44] text-[#1A1A1A] text-base font-medium px-6 py-3 rounded-full shadow-md transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSending ? 'Sending layout...' : 'Send layout to robot'}
            </motion.button>

            {isSending && sendProgressTotal > 0 && (
              <div className="mt-2 space-y-2 text-xs text-[#A8FF60]/80">
                <div className="flex items-center justify-between">
                  <span>Sending layout...</span>
                  <span>
                    {displayedSendBytes}/{sendProgressTotal} bytes
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#252b63] overflow-hidden">
                  <div
                    className="h-full bg-[#D5EA44] transition-[width] duration-75 ease-linear"
                    style={{ width: `${sendProgressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto rounded-[28px] bg-[#1b2060]/80 p-4">
            {devices.length === 0 ? (
              <p className="text-[#A8FF60] opacity-80">
                No paired devices yet. Request access and select your robot.
              </p>
            ) : (
              <ul className="space-y-3">
                {devices.map((device) => {
                  const isActive = selectedId === device.id;
                  return (
                    <li key={device.id || device.name || Math.random()}>
                      <button
                        onClick={() => setSelectedId(device.id || null)}
                        className={`w-full flex items-center justify-between px-5 py-4 rounded-[20px] transition ${
                          isActive
                            ? 'bg-[#A8FF60] text-[#1A1A1A]'
                            : 'bg-[#252b63] text-[#A8FF60] hover:bg-[#2c3270]'
                        }`}
                      >
                        <div className="text-left">
                          <div className="text-lg">{device.name || 'Unnamed device'}</div>
                          <div className={`text-xs ${isActive ? 'opacity-100' : 'opacity-80'}`}>
                            id: {device.id || 'n/a'}
                          </div>
                        </div>
                        <div className="text-sm opacity-80">
                          {isActive ? 'Selected' : 'Select'}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {status === 'connecting' && (
            <div className="w-full space-y-2 text-left">
              <div className="flex items-center justify-between text-xs text-[#A8FF60]/80">
                <span>Establishing BLE link…</span>
                <span>
                  {Math.round(connectProgress)}/{TRANSFER_BYTES} bytes
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#252b63] overflow-hidden">
                <div
                  className="h-full bg-[#D5EA44] transition-[width] duration-75 ease-linear"
                  style={{ width: `${connectProgressPercent}%` }}
                />
              </div>
            </div>
          )}

          {!!message && (
            <div
              className={`text-sm rounded-[16px] px-4 py-3 ${
                status === 'error'
                  ? 'bg-red-500/20 text-red-200'
                  : 'bg-[#1b2060]/60 text-[#A8FF60]'
              }`}
            >
              {message}
            </div>
          )}

          <div className="mt-auto flex items-center justify-between gap-4">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => router.push('/projects')}
              className="bg-[#D5EA44] text-[#1A1A1A] text-lg font-medium px-6 py-3 rounded-full shadow-md transition border-0 outline-none"
            >
              Back to projects
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onConnectClick}
              disabled={status === 'connecting'}
              className="bg-[#D5EA44] text-[#1A1A1A] text-lg font-medium px-6 py-3 rounded-full shadow-md transition border-0 outline-none disabled:opacity-60"
            >
              {status === 'connecting' ? 'Connecting...' : 'Connect to robot'}
            </motion.button>
          </div>
        </div>
      </main>
    </>
  );
}

