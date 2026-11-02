import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Api, Rol, Sesion, VistaComo } from './tipos';

interface Contexto {
  api: Api;
  /** Sesión que ven las páginas: en "Ver como" trae el rol/nombre de la vista */
  sesion: Sesion | null;
  /** Sesión de quien realmente inició sesión */
  sesionReal: Sesion | null;
  vista: VistaComo | null;
  verComo: (v: VistaComo | null) => Promise<void>;
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
  const [vista, setVista] = useState<VistaComo | null>(null);
  const verComo = useCallback(async (v: VistaComo | null) => {
    await api.usarVistaComo(v?.objetivo ?? null);
    setVista(v);
  }, [api]);

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
  const efectiva: Sesion | null = vista && sesion?.perfil
    ? { ...sesion, perfil: { ...sesion.perfil, nombre: vista.nombre, rol: vista.rol } }
    : sesion;
  return (
    <Ctx.Provider value={{ api, sesion: efectiva, sesionReal: sesion, vista, verComo, recargar, debeCambiarClave, claveCambiada: () => setDebe(false) }}>
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
