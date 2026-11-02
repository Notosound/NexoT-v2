// Enlace + QR para que la gente se registre sola a nombre de un líder
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, MessageCircle, Power, RefreshCw } from 'lucide-react';
import { useSesion } from '../lib/sesion';
import type { EnlaceLider } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';
import QR from './QR';

export const urlEnlace = (token: string) => `${window.location.origin}/r/${token}`;

export default function EnlaceRegistro({ liderId, nombre }: { liderId: string; nombre: string }) {
  const { api, vista } = useSesion();
  const [enlace, setEnlace] = useState<EnlaceLider | null>(null);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const cargar = () => api.enlaceLider(liderId).then(setEnlace).catch((e) => setError(mensajeError(e)));
  useEffect(() => { cargar(); }, [api, liderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const configurar = async (activo: boolean, regenerar: boolean) => {
    if (regenerar && !confirm('El enlace actual dejará de funcionar y tendrás que compartir el nuevo. ¿Continuar?')) return;
    setError(''); setAviso('');
    try {
      await api.configurarEnlace(liderId, activo, regenerar);
      await cargar();
      setAviso(regenerar ? 'Listo: este es tu enlace nuevo.' : activo ? 'Enlace activado.' : 'Enlace apagado: nadie puede registrarse con él.');
    } catch (e) { setError(mensajeError(e)); }
  };

  if (error && !enlace) return <div className="aviso error">{error}</div>;
  if (!enlace) return <p className="vacio">Cargando…</p>;
  if (!enlace.token) return <div className="aviso info">Este líder todavía no tiene enlace. {vista ? 'Se crea la primera vez que el líder lo abra.' : ''}</div>;

  const url = urlEnlace(enlace.token);
  const mensaje = `Hola, te invito a registrarte con ${nombre} en este enlace: ${url}`;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(url); setAviso('Enlace copiado.'); } catch { setAviso('No se pudo copiar: selecciona el enlace y cópialo.'); }
  };
  const descargarQR = async () => {
    const datos = await QRCode.toDataURL(url, { width: 800, margin: 2, errorCorrectionLevel: 'M' });
    const a = document.createElement('a');
    a.href = datos; a.download = `qr-registro-${nombre.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.png`; a.click();
  };

  return (
    <div className="tarjeta">
      {!enlace.activo && <div className="aviso atencion" style={{ marginBottom: '1rem' }}>El enlace está <strong>apagado</strong>: nadie puede registrarse con él.</div>}
      <div className="enlace-qr">
        <QR texto={url} />
        <div>
          <h2>Comparte tu enlace</h2>
          <p className="subtitulo" style={{ marginBottom: '0.75rem' }}>
            Quien lo abra llena sus datos, acepta el tratamiento de datos y queda registrado a nombre de <strong>{nombre}</strong>. No ve a nadie más.
          </p>
          <div className="caja-enlace"><span style={{ flex: 1 }}>{url}</span></div>
          <div className="acciones" style={{ marginTop: '0.75rem' }}>
            <button className="boton primario" onClick={copiar}><Copy className="icono" aria-hidden />Copiar enlace</button>
            <a className="boton" href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noreferrer">
              <MessageCircle className="icono" aria-hidden />Enviar por WhatsApp
            </a>
            <button className="boton" onClick={descargarQR}><Download className="icono" aria-hidden />Descargar QR</button>
          </div>
          <p className="ayuda" style={{ marginTop: '0.75rem' }}>{enlace.registros_enlace} personas se han registrado con este enlace.</p>
        </div>
      </div>
      {aviso && <div className="aviso ok" style={{ marginTop: '1rem' }}>{aviso}</div>}
      {error && <div className="aviso error" style={{ marginTop: '1rem' }}>{error}</div>}
      <details style={{ marginTop: '1rem' }}>
        <summary className="ayuda" style={{ cursor: 'pointer' }}>Opciones del enlace</summary>
        <div className="acciones" style={{ marginTop: '0.75rem' }}>
          <button className="boton chico" onClick={() => configurar(!enlace.activo, false)}><Power className="icono" aria-hidden />{enlace.activo ? 'Apagar enlace' : 'Activar enlace'}</button>
          <button className="boton chico" onClick={() => configurar(true, true)}><RefreshCw className="icono" aria-hidden />Cambiar enlace (el viejo deja de servir)</button>
        </div>
      </details>
    </div>
  );
}
