import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Api, Rol, Sesion } from './tipos';

interface Contexto {
  api: Api;
  sesion: Sesion | null;
  recargar: () => Promise<void>;
  debeCambiarClave: boolean;
  claveCambiada: () => void;
}

const Ctx = createContext<Contexto | null>(null);

// Los enlaces de invitación y de recuperación llegan con "type=invite" o
// "type=recovery" en la URL: hay que pedir una contraseña nueva.
const llegoParaCambiarClave = /type=(invite|recovery)/.test(window.location.hash + window.location.search);

export function ProveedorSesion({ api, children }: { api: Api; children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined);
  const [debeCambiarClave, setDebe] = useState(llegoParaCambiarClave);

  const recargar = useCallback(async () => {
    try {
      setSesion(await api.sesion());
    } catch {
      setSesion(null);
    }
  }, [api]);

  useEffect(() => {
    recargar();
    return api.alCambiarSesion(() => { recargar(); });
  }, [api, recargar]);

  if (sesion === undefined) return <div className="cargando-pagina">Cargando…</div>;
  return (
    <Ctx.Provider value={{ api, sesion, recargar, debeCambiarClave, claveCambiada: () => setDebe(false) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSesion() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSesion fuera de ProveedorSesion');
  return c;
}

export function usePuede(...roles: Rol[]) {
  const { sesion } = useSesion();
  return !!sesion?.perfil && roles.includes(sesion.perfil.rol);
}
