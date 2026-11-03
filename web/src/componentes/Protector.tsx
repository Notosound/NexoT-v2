// Si una página falla al dibujarse, se muestra un aviso en esa página
// en lugar de dejar toda la plataforma en blanco.
import { Component, type ReactNode } from 'react';
import { esErrorDeVersion, recargarPorVersion } from '../lib/version';

export default class Protector extends Component<{ children: ReactNode; clave?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    if (esErrorDeVersion(error) && recargarPorVersion()) return;
    console.error('Error en la página:', error);
  }
  componentDidUpdate(prev: { clave?: string }) {
    if (prev.clave !== this.props.clave && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (esErrorDeVersion(this.state.error)) {
      return (
        <div className="tarjeta" role="alert" style={{ maxWidth: 560 }}>
          <h2>Hay una versión nueva de la plataforma</h2>
          <p className="subtitulo">Actualiza la página para seguir. No se pierde nada de lo guardado.</p>
          <button className="boton primario" onClick={() => window.location.reload()}>Actualizar ahora</button>
        </div>
      );
    }
    return (
      <div className="tarjeta" role="alert" style={{ maxWidth: 560 }}>
        <h2>Esta sección tuvo un problema</h2>
        <p className="subtitulo">El resto de la plataforma sigue funcionando. Puedes volver a intentar o ir a otra sección.</p>
        <p className="ayuda" style={{ fontFamily: 'ui-monospace, monospace' }}>{this.state.error.message}</p>
        <div className="acciones" style={{ marginTop: '0.75rem' }}>
          <button className="boton primario" onClick={() => this.setState({ error: null })}>Volver a intentar</button>
          <a className="boton" href="/">Ir al inicio</a>
        </div>
      </div>
    );
  }
}
