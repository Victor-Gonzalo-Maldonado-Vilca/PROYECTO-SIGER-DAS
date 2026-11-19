import { useState, type FormEvent } from 'react';
import { api, leerErrorApi, sesionGuardada } from '../api/cliente';
import type { Usuario } from '../tipos';

/** Inicio de sesión (MOD-01, EDU-0017). */
export default function Login({ alIngresar }: { alIngresar: (u: Usuario) => void }) {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const r = await api.post<{ token: string; usuario: Usuario }>('/auth/login', { usuario, contrasena });
      sesionGuardada.guardar(r.data.token);
      alIngresar(r.data.usuario);
    } catch (err) {
      setError(leerErrorApi(err).mensaje);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="centrado">
      <form className="tarjeta login" onSubmit={enviar}>
        <h1>SIGER</h1>
        <p className="sutil">Sistema Integral de Gestión Rider</p>
        <label>
          Usuario
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus autoComplete="username" />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="mensaje error">{error}</p>}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
