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
  const hasDevices = useMemo(() => devices.length > 0, [devices]);

  const serverRef = useRef<BluetoothRemoteGATTServer | null>(null);
  const charRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  // Проверка авторизации и восстановление устройств
  useEffect(() => {
    let mounted = true;
    (async () => {
      // auth like projects page
      const me = await fetch('/api/me');
      if (me.status === 401) {
        router.replace('/login');
        return;
      }

      async function restoreDevices() {
        if (!("bluetooth" in navigator)) return;

        if ((navigator as any).bluetooth.getDevices) {
          try {
            const saved = await (navigator as any).bluetooth.getDevices();
            if (saved.length > 0 && mounted) {
              setDevices(saved);
              setSelectedId(saved[0].id || null);
              setMessage(`Восстановлено устройство: ${saved[0].name || saved[0].id}`);
              return;
            }
          } catch (e) {
            console.error('getDevices failed:', e);
          }
        }

        const raw = localStorage.getItem('savedDevice');
        if (raw && mounted) {
          try {
            const d = JSON.parse(raw);
            setDevices([d]);
            setSelectedId(d.id || null);
            setMessage(`Восстановлено (localStorage): ${d.name || d.id}`);
          } catch {}
        }
      }
      await restoreDevices();
    })();
    return () => { mounted = false; };
  }, [router]);

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
      <Head>
        <title>Устройства — Tiles Markuper Bot</title>
      </Head>

      <main
        className="flex w-full h-screen bg-cover bg-center bg-no-repeat min-h-screen bg-[#0f1533] items-center justify-center relative overflow-hidden"
        style={{ backgroundImage: "url('/background1.png')" }}
      >
        <div className="absolute w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-lime-300 via-green-400 to-blue-300 opacity-30 animate-spin-slow rounded-[28] z-0" />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 bg-[#1b2060]/80 rounded-[35px] w-full max-w-[550px] max-h-[600px] text-center shadow-2xl flex flex-col gap-6 p-6"
        >
          {/* Заголовок */}
          <div className="flex flex-col gap-[15px] w-full h-[100px] bg-[#1b2060] rounded-[28] items-center justify-center">
            <h1 className="text-3xl md:text-4xl font-bold text-[#A8FF60] justify-center">
              Устройства
            </h1>
          </div>
          <div className="h-[15]"></div>

          {/* Список устройств */}
          <div className="flex-1 overflow-y-auto rounded-[28px] bg-[#1b2060]/60 p-4 h-max-[600px]">
            {!hasDevices ? (
              <p className="text-[#A8FF60] py-[12]">
                Пока нет сохранённых устройств — подключитесь к первому.
              </p>
            ) : (
              <ul className="space-y-3">
                {devices.map((d) => (
                  <li key={d.id || d.name || Math.random()}>
                    <div className="flex items-center justify-between bg-[#252b63] text-[#A8FF60] px-6 h-[48px] rounded-[28]">
                      {/* Кнопка выбора устройства */}
                      <button
                        onClick={() => setSelectedId(d.id || null)}
                        className="bg-[#252b63] text-[#A8FF60] flex-1 text-left hover:underline text-lg border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus:ring-transparent"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="px-[16] opacity-80 text-[15px]">{d.name || 'Безымянное устройство'}</span>
                          <span className="opacity-80 text-[15px] px-[8]">{(d.id || '—').toString()}</span>
                        </div>
                      </button>

                      {/* Кнопка подключения */}
                      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 1 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(d.id || null);
                            onConnectClick();
                          }}
                          disabled={status === 'connecting'}
                          className="bg-[#1b2060]/100 py-[15px] px-[16] ml-4 text-[#A8FF60] hover:text-white text-xl rounded-[28px] border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus:ring-transparent disabled:opacity-60"
                          title="Подключиться"
                        >
                          🔗
                        </button>
                      </motion.div>
                    </div>
                    <div className="h-[12]"></div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!!message && (
            <div className={`text-sm rounded-[16px] px-4 py-3 ${status === 'error' ? 'bg-red-500/20 text-red-200' : 'bg-[#1b2060]/60 text-[#A8FF60]'}`}>
              {message}
            </div>
          )}

          {/* Нижние кнопки */}
          <div className="flex justify-center gap-[90px] ">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <button
                onClick={() => router.push('/profile')}
                className="bg-[#D5EA44] text-[#1A1A1A] text-[16px] font-medium px-[30px] py-[10px] rounded-full shadow-md transition border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus:ring-transparent"
              >
                Назад в профиль
              </button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <button
                onClick={onConnectClick}
                disabled={status === 'connecting'}
                className="bg-[#D5EA44] text-[#1A1A1A] text-[16px] font-medium px-[30px] py-[10px] rounded-full shadow-md transition border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus:ring-transparent disabled:opacity-60"
              >
                {status === 'connecting' ? 'Подключение…' : 'Подключиться'}
              </button>
            </motion.div>
          </div>
        </motion.div>
      </main>
    </>
  );
}
