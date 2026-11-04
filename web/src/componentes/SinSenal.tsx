// Franja que avisa cuando no hay señal y cuántos registros esperan en este celular
import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { alCambiarCola, descartar, enviarPendientes, pendientes, type Pendiente } from '../lib/cola';

export default function SinSenal() {
  const { api, vista, sesionReal } = useSesion();
  const yo = sesionReal!.usuarioId;
  const [enLinea, setEnLinea] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [cola, setCola] = useState<Pendiente[]>(() => pendientes(yo));
  const [aviso, setAviso] = useState('');
  const [ver, setVer] = useState(false);

  useEffect(() => {
    const enviar = async () => {
      if (vista || !navigator.onLine || !pendientes(yo).some((p) => !p.error)) return;
      const r = await enviarPendientes(api, yo);
      if (r.enviados) setAviso(r.enviados === 1 ? 'Se envió 1 registro guardado sin señal.' : `Se enviaron ${r.enviados} registros guardados sin señal.`);
    };
    const arriba = () => { setEnLinea(true); enviar(); };
    const abajo = () => setEnLinea(false);
    window.addEventListener('online', arriba);
    window.addEventListener('offline', abajo);
    const quitar = alCambiarCola(() => setCola(pendientes(yo)));
    enviar();
    const t = setInterval(enviar, 60_000);
    return () => { window.removeEventListener('online', arriba); window.removeEventListener('offline', abajo); quitar(); clearInterval(t); };
  }, [api, vista, yo]);

  useEffect(() => { if (aviso) { const t = setTimeout(() => setAviso(''), 6000); return () => clearTimeout(t); } }, [aviso]);

  const conError = cola.filter((p) => p.error);
  if (enLinea && !cola.length && !aviso) return null;
  return (
    <div className={`sin-senal${enLinea ? '' : ' fuera'}`} role="status">
      {!enLinea && <><CloudOff className="icono" aria-hidden /><span>Sin señal: lo que registres se guarda en este celular y se envía solo cuando vuelva la conexión.</span></>}
      {enLinea && cola.length > 0 && (
        <>
          <RefreshCw className="icono" aria-hidden />
          <span>{cola.length} {cola.length === 1 ? 'registro guardado' : 'registros guardados'} en este celular{conError.length ? `, ${conError.length} con problemas` : ' por enviar'}.</span>
          {cola.some((p) => !p.error) && <button onClick={() => enviarPendientes(api, yo)}>Enviar ahora</button>}
          {conError.length > 0 && <button onClick={() => setVer(!ver)}>{ver ? 'Ocultar' : 'Ver'}</button>}
        </>
      )}
      {!enLinea && cola.length > 0 && <strong>{cola.length} guardados</strong>}
      {aviso && <span>{aviso}</span>}
      {ver && conError.length > 0 && (
        <ul>
          {conError.map((p) => (
            <li key={p.id}>{p.nombre} (C.C. {p.datos.cedula}): {p.error} <button onClick={() => descartar(p.id)}>Descartar</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
