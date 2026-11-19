import { useEffect, useState } from 'react';
import { api, sesionGuardada } from './api/cliente';
import Login from './paginas/Login';
import VentasMoto from './paginas/VentasMoto';
import type { Usuario } from './tipos';

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

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
  };

  if (cargando) return <p className="centrado">Cargando…</p>;
  if (!usuario) return <Login alIngresar={setUsuario} />;

  return (
    <div className="app">
      <header className="barra">
        <strong>SIGER</strong>
        <nav>
          {/* Por ahora solo MOD-04; los demás módulos se agregarán aquí. */}
          {usuario.modulos.includes('MOD-04') && <span className="activo">Venta de motos</span>}
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
        {usuario.modulos.includes('MOD-04') ? (
          <VentasMoto />
        ) : (
          <p className="aviso">Su perfil no tiene módulos implementados todavía.</p>
        )}
      </main>
    </div>
  );
}
