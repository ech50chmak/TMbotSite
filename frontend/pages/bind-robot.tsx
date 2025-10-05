'use client';

import Head from 'next/head';
import {useEffect, useMemo, useRef, useState} from 'react';
import {useRouter} from 'next/router';
import {motion} from 'framer-motion';

const SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789abcdef1';

type BLEDevice = BluetoothDevice & { id?: string };

export default function BindRobotPage() {
  const router = useRouter();

  const [devices, setDevices] = useState<BLEDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle'|'connecting'|'connected'|'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const serverRef = useRef<BluetoothRemoteGATTServer | null>(null);
  const charRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  // При загрузке страницы пытаемся восстановить устройства
  useEffect(() => {
    async function restoreDevices() {
      if (!("bluetooth" in navigator)) return;

      // ✅ Если браузер поддерживает getDevices()
      if ((navigator as any).bluetooth.getDevices) {
        try {
          const saved = await (navigator as any).bluetooth.getDevices();
          if (saved.length > 0) {
            setDevices(saved);
            setSelectedId(saved[0].id || null);
            setMessage(`Восстановлено устройство: ${saved[0].name || saved[0].id}`);
            return;
          }
        } catch (e) {
          console.error("getDevices failed:", e);
        }
      }

      // ⚠️ Фолбэк через localStorage
      const raw = localStorage.getItem("savedDevice");
      if (raw) {
        try {
          const d = JSON.parse(raw);
          setDevices([d]);
          setSelectedId(d.id || null);
          setMessage(`Восстановлено (localStorage): ${d.name || d.id}`);
        } catch {}
      }
    }
    restoreDevices();
  }, []);

  // Сохранение устройства в localStorage
  const saveDevice = (device: BLEDevice) => {
    localStorage.setItem("savedDevice", JSON.stringify({ id: device.id, name: device.name }));
  };

  // Выбор устройства вручную
  const requestNewDevice = async () => {
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID],
      }) as BLEDevice;
      setDevices([device]);
      setSelectedId(device.id || null);
      saveDevice(device);
      setMessage(`Выбрано новое устройство: ${device.name || device.id}`);
    } catch (e: any) {
      setStatus('error');
      setMessage(String(e));
    }
  };

  // Подключение
  const onConnectClick = async () => {
    if (!selectedId) {
      await requestNewDevice();
      return;
    }

    const device = devices.find(d => d.id === selectedId);
    if (!device) return;

    setStatus('connecting');
    setMessage(`Подключение к ${device.name || 'устройству'}…`);

    try {
      const server = await device.gatt!.connect();
      serverRef.current = server;

      try {
        const service = await server.getPrimaryService(SERVICE_UUID);
        const char = await service.getCharacteristic(CHARACTERISTIC_UUID);
        charRef.current = char;
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', (e: Event) => {
          const v = (e.target as BluetoothRemoteGATTCharacteristic).value!;
          const text = new TextDecoder().decode(v);
          setMessage(`notify: ${text}`);
        });
      } catch {
        charRef.current = null;
      }

      setStatus('connected');
      setMessage('Подключено!');
    } catch (e: any) {
      setStatus('error');
      setMessage(String(e));
    }
  };

  return (
    <>
      <Head><title>Подключение устройства</title></Head>
      <main
        className="flex w-full h-screen bg-cover bg-center bg-no-repeat min-h-screen bg-[#0f1533] items-center justify-center relative overflow-hidden"
        style={{ backgroundImage: "url('/background1.png')" }}
      >
        <div className="absolute w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-lime-300 via-green-400 to-blue-300 opacity-30 animate-spin-slow rounded-full z-0" />
        <div className="relative z-10 bg-[#1b2060]/80 rounded-[35px] w-[40%] max-w-[900px] h-[85%] text-center shadow-2xl flex flex-col gap-[20px] p-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#A8FF60]">Подключение по Bluetooth</h1>

          <div className="flex-1 overflow-y-auto rounded-[28px] bg-[#1b2060]/80 p-4">
            {devices.length === 0 ? (
              <p className="text-[#A8FF60] opacity-80">
                Нет сохранённых устройств. Нажми «Подключиться», чтобы выбрать новое.
              </p>
            ) : (
              <ul className="space-y-3">
                {devices.map((d) => {
                  const selected = selectedId === d.id;
                  return (
                    <li key={d.id || d.name || Math.random()}>
                      <button
                        onClick={() => setSelectedId(d.id || null)}
                        className={`w-full flex items-center justify-between px-5 py-4 rounded-[20px] transition
                          ${selected ? 'bg-[#A8FF60] text-[#1A1A1A]' : 'bg-[#252b63] text-[#A8FF60] hover:bg-[#2c3270]'}`}
                      >
                        <div className="text-left">
                          <div className="text-lg">{d.name || 'Безымянное устройство'}</div>
                          <div className={`text-xs ${selected ? 'opacity-100' : 'opacity-80'}`}>
                            id: {d.id || '—'}
                          </div>
                        </div>
                        <div className="text-sm opacity-80">
                          {selected ? 'Выбрано' : 'Выбрать'}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {!!message && (
            <div className={`text-sm rounded-[16px] px-4 py-3 ${status === 'error' ? 'bg-red-500/20 text-red-200' : 'bg-[#1b2060]/60 text-[#A8FF60]'}`}>
              {message}
            </div>
          )}

          <div className="mt-auto flex items-center justify-between gap-4">
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => router.push('/projects')}
              className="bg-[#D5EA44] text-[#1A1A1A] text-lg font-medium px-6 py-3 rounded-full shadow-md transition border-0 outline-none"
            >
              Вернуться к проектам
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={onConnectClick}
              disabled={status === 'connecting'}
              className="bg-[#D5EA44] text-[#1A1A1A] text-lg font-medium px-6 py-3 rounded-full shadow-md transition border-0 outline-none disabled:opacity-60"
            >
              {status === 'connecting' ? 'Подключение…' : 'Подключиться'}
            </motion.button>
          </div>
        </div>
      </main>
    </>
  );
}
