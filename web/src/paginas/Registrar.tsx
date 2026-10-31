import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import SelectorPuesto from '../componentes/SelectorPuesto';
import { useSesion } from '../lib/sesion';
import {
  AVISO_TEXTO, ESTADOS_UBICACION, SEXOS,
  type Lider, type Localidad, type Puesto, type ResultadoRegistro, type Sexo, type Sugerencia,
} from '../lib/tipos';
import { edadDesde, mensajeError, soloDigitos } from '../lib/utilidades';

type Errores = Partial<Record<string, string>>;

export default function Registrar() {
  const { api, sesion } = useSesion();
  const rol = sesion!.perfil!.rol;
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);

  const [liderId, setLiderId] = useState('');
  const [cedula, setCedula] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [sexo, setSexo] = useState<Sexo | ''>('');
  const [modoEdad, setModoEdad] = useState<'fecha' | 'edad'>('fecha');
  const [fecha, setFecha] = useState('');
  const [edad, setEdad] = useState('');
  const [telefono, setTelefono] = useState('');
  const [sabeDonde, setSabeDonde] = useState(true);
  const [localidadId, setLocalidadId] = useState<number | null>(null);
  const [puesto, setPuesto] = useState<Puesto | null>(null);
  const [otro, setOtro] = useState(false);
  const [puestoReportado, setPuestoReportado] = useState('');
  const [direccionReportada, setDireccionReportada] = useState('');
  const [sugerencia, setSugerencia] = useState<Sugerencia | null>(null);
  const [mesa, setMesa] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);

  const [errores, setErrores] = useState<Errores>({});
  const [intentado, setIntentado] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState('');
  const [resultado, setResultado] = useState<(ResultadoRegistro & { nombre: string }) | null>(null);
  const [guardando, setGuardando] = useState(false);
  const refCedula = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.lideres().then((ls) => {
      setLideres(ls);
      if (ls.length === 1) setLiderId(ls[0].id);
    }).catch((e) => setErrorGeneral(mensajeError(e)));
    api.localidades().then(setLocalidades).catch((e) => setErrorGeneral(mensajeError(e)));
  }, [api]);

  // Sugerencia en vivo mientras escribe en "Otro"
  useEffect(() => {
    setSugerencia(null);
    if (!otro || (puestoReportado.trim().length < 3 && direccionReportada.trim().length < 6)) return;
    const t = setTimeout(() => {
      api.sugerirPuesto(localidadId, puestoReportado, direccionReportada).then(setSugerencia).catch(() => {});
    }, 450);
    return () => clearTimeout(t);
  }, [api, otro, localidadId, puestoReportado, direccionReportada]);

  // Después del primer intento, los errores se actualizan mientras corrige
  useEffect(() => {
    if (intentado) setErrores(validar());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentado, liderId, cedula, nombres, sexo, modoEdad, fecha, edad, telefono, sabeDonde, localidadId, puesto, otro, puestoReportado, direccionReportada, mesa, consentimiento]);

  function validar(): Errores {
    const e: Errores = {};
    if (!liderId) e.lider = 'Elige el líder.';
    const ced = soloDigitos(cedula);
    if (!/^\d{3,10}$/.test(ced) || /[^\d\s.]/.test(cedula)) e.cedula = 'La cédula debe tener entre 3 y 10 dígitos, sin letras ni símbolos.';
    if (!nombres.trim()) e.nombres = 'Escribe el nombre.';
    if (!sexo) e.sexo = 'Elige una opción.';
    const edadCalc = modoEdad === 'fecha' ? edadDesde(fecha || null, null, null) : edad ? Number(edad) : null;
    if (edadCalc == null) e.edad = modoEdad === 'fecha' ? 'Escribe la fecha de nacimiento.' : 'Escribe la edad.';
    else if (edadCalc < 18) e.edad = 'Debe ser mayor de edad.';
    else if (edadCalc > 120) e.edad = 'Revisa la fecha o la edad.';
    const tel = soloDigitos(telefono).replace(/^57(?=\d{10}$)/, '');
    if (telefono.trim() && !/^\d{7,10}$/.test(tel)) e.telefono = 'Teléfono de 7 a 10 dígitos.';
    if (sabeDonde) {
      if (!localidadId) e.localidad = 'Elige la localidad.';
      else if (!puesto && !otro) e.puesto = 'Elige el puesto o marca que no aparece en la lista.';
      else if (otro && !puestoReportado.trim() && !direccionReportada.trim()) e.otro = 'Escribe el nombre que le aparece o la dirección del puesto.';
      if (mesa && (!/^\d+$/.test(mesa) || Number(mesa) < 1)) e.mesa = 'Número de mesa inválido.';
      else if (mesa && puesto?.mesas_total && Number(mesa) > puesto.mesas_total) e.mesa = `Ese puesto tiene ${puesto.mesas_total} mesas.`;
    }
    if (!consentimiento) e.consentimiento = 'Sin la autorización no se puede registrar.';
    return e;
  }

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    setErrorGeneral(''); setResultado(null);
    const e = validar();
    setErrores(e);
    setIntentado(true);
    if (Object.keys(e).length) {
      document.querySelector<HTMLElement>('[aria-invalid=true], .error-campo')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    setGuardando(true);
    try {
      const r = await api.registrarPersona({
        liderId,
        cedula: soloDigitos(cedula),
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        sexo: sexo as Sexo,
        fechaNacimiento: modoEdad === 'fecha' ? fecha : null,
        edad: modoEdad === 'edad' ? Number(edad) : null,
        telefono: telefono.trim() ? soloDigitos(telefono).replace(/^57(?=\d{10}$)/, '') : null,
        localidadId: sabeDonde ? localidadId : null,
        puestoId: sabeDonde ? puesto?.id ?? null : null,
        puestoReportado: sabeDonde && otro ? puestoReportado.trim() || null : null,
        direccionReportada: sabeDonde && otro ? direccionReportada.trim() || null : null,
        mesa: sabeDonde && mesa ? Number(mesa) : null,
      });
      setResultado({ ...r, nombre: `${nombres.trim()} ${apellidos.trim()}`.trim() });
      // Se conservan líder y localidad para registrar al siguiente más rápido
      setCedula(''); setNombres(''); setApellidos(''); setSexo(''); setFecha(''); setEdad(''); setTelefono('');
      setPuesto(null); setOtro(false); setPuestoReportado(''); setDireccionReportada(''); setMesa(''); setConsentimiento(false);
      setErrores({}); setIntentado(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      refCedula.current?.focus({ preventScroll: true });
    } catch (err) {
      setErrorGeneral(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  const err = (k: string) => errores[k] && <span className="error-campo" role="alert">{errores[k]}</span>;

  return (
    <>
      <div className="encabezado"><div><h1>Registrar persona</h1><p>Los campos marcados como opcionales se pueden dejar vacíos.</p></div></div>

      {resultado && (
        <div className={`aviso ${resultado.ubicacion_estado === 'completa' ? 'ok' : 'atencion'}`} style={{ marginBottom: '1rem' }} role="status">
          <p><strong>{resultado.nombre}</strong> quedó registrada.</p>
          <p>
            {resultado.ubicacion_estado === 'completa' && <>Lugar de votación confirmado: {resultado.puesto}.</>}
            {resultado.ubicacion_estado === 'sin_mesa' && <>Puesto: {resultado.puesto}. Falta la mesa.</>}
            {resultado.ubicacion_estado === 'por_revisar' && <>El puesto quedó para revisión del administrador.</>}
            {resultado.ubicacion_estado === 'sin_dato' && <>{ESTADOS_UBICACION.sin_dato}: se puede completar después.</>}
          </p>
        </div>
      )}
      {errorGeneral && <div className="aviso error" style={{ marginBottom: '1rem' }} role="alert">{errorGeneral}</div>}

      {lideres.length === 0 && rol !== 'lider' ? (
        <div className="tarjeta">
          <p>Primero hay que crear al menos un líder.</p>
          <Link to="/lideres" className="boton primario">Ir a Líderes</Link>
        </div>
      ) : (
        <form className="formulario tarjeta" onSubmit={guardar} noValidate>
          {lideres.length > 1 && (
            <label className="campo"><span>Líder que registra</span>
              <select value={liderId} onChange={(e) => setLiderId(e.target.value)} aria-invalid={!!errores.lider}>
                <option value="">Elige…</option>
                {lideres.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
              {err('lider')}
            </label>
          )}

          <fieldset>
            <legend>Datos de la persona</legend>
            <div className="formulario">
              <label className="campo"><span>Cédula</span>
                <input ref={refCedula} type="text" inputMode="numeric" autoComplete="off" value={cedula}
                  onChange={(e) => setCedula(e.target.value)} aria-invalid={!!errores.cedula} />
                {err('cedula')}
              </label>
              <div className="fila-campos">
                <label className="campo"><span>Nombres</span>
                  <input type="text" autoComplete="off" value={nombres} onChange={(e) => setNombres(e.target.value)} aria-invalid={!!errores.nombres} />
                  {err('nombres')}
                </label>
                <label className="campo"><span>Apellidos</span>
                  <input type="text" autoComplete="off" value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
                </label>
              </div>
              <div className="campo">
                <span id="etq-sexo">Sexo</span>
                <div className="segmentos" role="group" aria-labelledby="etq-sexo">
                  {(Object.keys(SEXOS) as Sexo[]).map((s) => (
                    <button type="button" key={s} className="opcion" aria-pressed={sexo === s} onClick={() => setSexo(s)}>{SEXOS[s]}</button>
                  ))}
                </div>
                {err('sexo')}
              </div>
              <div className="campo">
                <span id="etq-edad">Edad</span>
                <div className="segmentos" role="group" aria-labelledby="etq-edad">
                  <button type="button" className="opcion" aria-pressed={modoEdad === 'fecha'} onClick={() => setModoEdad('fecha')}>Fecha de nacimiento</button>
                  <button type="button" className="opcion" aria-pressed={modoEdad === 'edad'} onClick={() => setModoEdad('edad')}>Solo la edad</button>
                </div>
                {modoEdad === 'fecha' ? (
                  <input type="date" aria-label="Fecha de nacimiento" value={fecha} max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setFecha(e.target.value)} aria-invalid={!!errores.edad} />
                ) : (
                  <input type="number" aria-label="Edad en años" inputMode="numeric" min={18} max={120} value={edad}
                    onChange={(e) => setEdad(e.target.value)} aria-invalid={!!errores.edad} />
                )}
                {err('edad')}
              </div>
              <label className="campo"><span>Teléfono <span className="opcional">(opcional)</span></span>
                <input type="tel" inputMode="tel" autoComplete="off" value={telefono} onChange={(e) => setTelefono(e.target.value)} aria-invalid={!!errores.telefono} />
                {err('telefono')}
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Lugar de votación</legend>
            <div className="formulario">
              <label className="casilla">
                <input type="checkbox" checked={!sabeDonde} onChange={(e) => setSabeDonde(!e.target.checked)} />
                <span>Todavía no sabe dónde vota</span>
              </label>
              {sabeDonde && (
                <>
                  <label className="campo"><span>Localidad</span>
                    <select value={localidadId ?? ''} aria-invalid={!!errores.localidad}
                      onChange={(e) => { setLocalidadId(e.target.value ? Number(e.target.value) : null); setPuesto(null); setOtro(false); }}>
                      <option value="">Elige…</option>
                      {localidades.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                    </select>
                    {err('localidad')}
                  </label>

                  {localidadId && !otro && (
                    <>
                      <SelectorPuesto localidadId={localidadId} elegido={puesto} onElegir={setPuesto} onOtro={() => { setOtro(true); setPuesto(null); }} />
                      {err('puesto')}
                    </>
                  )}

                  {localidadId && otro && (
                    <div className="formulario">
                      <div className="aviso info">
                        <p>Escribe el puesto <strong>como le aparece</strong> en la consulta de la Registraduría. Si conoce la dirección del puesto, mejor: con ella el sistema lo ubica solo.</p>
                      </div>
                      <label className="campo"><span>Nombre del puesto como le aparece</span>
                        <input type="text" value={puestoReportado} onChange={(e) => setPuestoReportado(e.target.value)} aria-invalid={!!errores.otro} />
                      </label>
                      <label className="campo"><span>Dirección del puesto <span className="opcional">(opcional)</span></span>
                        <input type="text" placeholder="Ej.: Calle 46 sur # 27-12" value={direccionReportada} onChange={(e) => setDireccionReportada(e.target.value)} />
                      </label>
                      {err('otro')}
                      {sugerencia && (
                        <div className="aviso atencion">
                          <p>¿Es <strong>{sugerencia.nombre}</strong>? <small>({sugerencia.direccion})</small></p>
                          <div className="acciones">
                            <button type="button" className="boton chico primario" onClick={() => {
                              setPuesto({ id: sugerencia.puesto_id, localidad_id: localidadId, nombre: sugerencia.nombre, direccion: sugerencia.direccion, mesas_total: sugerencia.mesas_total });
                              setOtro(false); setPuestoReportado(''); setDireccionReportada('');
                            }}>Sí, es ese</button>
                            <button type="button" className="boton chico" onClick={() => setSugerencia(null)}>No</button>
                          </div>
                        </div>
                      )}
                      <button type="button" className="enlace" onClick={() => setOtro(false)}>Volver a la lista oficial</button>
                    </div>
                  )}

                  {localidadId && (puesto || otro) && (
                    <label className="campo"><span>Mesa <span className="opcional">(si la sabe)</span></span>
                      <input type="number" inputMode="numeric" min={1} max={puesto?.mesas_total ?? undefined} value={mesa}
                        onChange={(e) => setMesa(e.target.value)} aria-invalid={!!errores.mesa} style={{ maxWidth: 160 }} />
                      <small>Importante para el conteo con los E14.</small>
                      {err('mesa')}
                    </label>
                  )}
                </>
              )}
            </div>
          </fieldset>

          <label className="casilla">
            <input type="checkbox" checked={consentimiento} onChange={(e) => setConsentimiento(e.target.checked)} aria-invalid={!!errores.consentimiento} />
            <span>{AVISO_TEXTO}</span>
          </label>
          {err('consentimiento')}

          <button className="boton primario bloque" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar'}</button>
        </form>
      )}
    </>
  );
}
