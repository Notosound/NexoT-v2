// Mantiene una pantalla al día: vuelve a cargar al instante cuando la base
// avisa un cambio (Supabase Realtime), al volver a la pestaña y, por si el
// aviso se pierde, cada minuto.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSesion } from './sesion';

export function useEnVivo(cargar: () => Promise<unknown> | void, temas: ('registros' | 'e14')[] = ['registros', 'e14']) {
  const { api } = useSesion();
  const [ultima, setUltima] = useState<Date | null>(null);
  const [conectado, setConectado] = useState(false);
  const ref = useRef(cargar);
  ref.current = cargar;
  const temasClave = temas.join(',');

  const recargar = useCallback(async () => {
    try { await ref.current(); setUltima(new Date()); } catch { /* la pantalla muestra su error */ }
  }, []);

  useEffect(() => {
    recargar();
    let espera: ReturnType<typeof setTimeout> | null = null;
    const pedir = () => { if (espera) clearTimeout(espera); espera = setTimeout(() => { if (!document.hidden) recargar(); }, 800); };
    const quitar = api.alCambiarDatos((t) => { if (temasClave.includes(t)) pedir(); }, setConectado);
    const cada = setInterval(() => { if (!document.hidden) recargar(); }, 60_000);
    const alVolver = () => { if (!document.hidden) recargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { quitar(); clearInterval(cada); if (espera) clearTimeout(espera); document.removeEventListener('visibilitychange', alVolver); };
  }, [api, recargar, temasClave]);

  return { ultima, conectado, recargar };
}
