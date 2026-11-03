// Aviso discreto cuando hay una versión nueva publicada
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { hayVersionNueva } from '../lib/version';

export default function NuevaVersion() {
  const [hay, setHay] = useState(false);
  useEffect(() => {
    let vivo = true;
    const revisar = () => hayVersionNueva().then((h) => { if (vivo && h) setHay(true); });
    revisar();
    const t = setInterval(revisar, 5 * 60_000);
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, []);
  if (!hay) return null;
  return (
    <div className="nueva-version" role="status">
      <RefreshCw className="icono" aria-hidden />
      <span>Hay una versión nueva de la plataforma.</span>
      <button onClick={() => window.location.reload()}>Actualizar</button>
    </div>
  );
}
