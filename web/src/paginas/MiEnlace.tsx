import { useEffect, useState } from 'react';
import { useSesion } from '../lib/sesion';
import type { Lider } from '../lib/tipos';
import { mensajeError } from '../lib/utilidades';
import EnlaceRegistro from '../componentes/EnlaceRegistro';

export default function MiEnlace() {
  const { api } = useSesion();
  const [ficha, setFicha] = useState<Lider | null | undefined>(undefined);
  const [error, setError] = useState('');
  useEffect(() => { api.lideres().then((l) => setFicha(l[0] ?? null)).catch((e) => setError(mensajeError(e))); }, [api]);
  return (
    <>
      <div className="encabezado"><div><h1>Mi enlace y QR</h1><p className="subtitulo">La forma más fácil de sumar gente: compártelo y cada persona se registra sola.</p></div></div>
      {error && <div className="aviso error">{error}</div>}
      {ficha === null && <div className="aviso atencion">Tu usuario no está unido a una ficha de líder. Pídele al administrador que lo revise.</div>}
      {ficha && <EnlaceRegistro liderId={ficha.id} nombre={ficha.nombre} />}
    </>
  );
}
