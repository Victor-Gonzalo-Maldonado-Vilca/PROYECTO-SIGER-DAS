import { useEffect, useState } from 'react';
import { api, sesionGuardada } from './api/cliente';
import Comprobantes from './paginas/Comprobantes';
import Conformidades from './paginas/Conformidades';
import Login from './paginas/Login';
import VentasMoto from './paginas/VentasMoto';
import type { Usuario } from './tipos';

/** Pantallas implementadas y el módulo que las habilita (RBAC). */
const PANTALLAS = [
  { clave: 'ventas-moto', titulo: 'Venta de motos', modulo: 'MOD-04', componente: VentasMoto },
  { clave: 'conformidades', titulo: 'Conformidad de servicio', modulo: 'MOD-02', componente: Conformidades },
  { clave: 'comprobantes', titulo: 'Comprobantes', modulo: 'MOD-08', componente: Comprobantes },
] as const;

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pantalla, setPantalla] = useState<string | null>(null);

  // Recupera la sesión si el token sigue siendo válido.
  useEffect(() => {
    if (!sesionGuardada.leer()) {
      setCargando(false);
      return;
    }
    api
      .get<Usuario>('/auth/yo')
      .then((r) => setUsuario(r.data))
      .catch(() => sesionGuardada.borrar())
      .finally(() => setCargando(false));
  }, []);

  const cerrarSesion = () => {
    sesionGuardada.borrar();
    setUsuario(null);
    setPantalla(null);
  };

  if (cargando) return <p className="centrado">Cargando…</p>;
  if (!usuario) return <Login alIngresar={setUsuario} />;

  const permitidas = PANTALLAS.filter((p) => usuario.modulos.includes(p.modulo));
  const actual = permitidas.find((p) => p.clave === pantalla) ?? permitidas[0];
  const Pantalla = actual?.componente;

  return (
    <div className="app">
      <header className="barra">
        <strong>SIGER</strong>
        <nav>
          {permitidas.map((p) => (
            <button
              key={p.clave}
              className={`pestana ${p.clave === actual?.clave ? 'activo' : ''}`}
              onClick={() => setPantalla(p.clave)}
            >
              {p.titulo}
            </button>
          ))}
        </nav>
        <div className="usuario">
          <span>
            {usuario.nombreCompleto} · {usuario.rol}
          </span>
          <button className="secundario" onClick={cerrarSesion}>
            Salir
          </button>
        </div>
      </header>
      <main>
        {Pantalla ? <Pantalla key={actual.clave} usuario={usuario} /> :<p className="aviso">Su perfil no tiene módulos implementados todavía.</p>}
      </main>
    </div>
  );
}
