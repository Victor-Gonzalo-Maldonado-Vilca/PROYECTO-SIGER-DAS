import axios, { AxiosError } from 'axios';

/** Cliente REST de SIGER (Vista Física: Axios sobre HTTPS/REST/JSON). */
export const api = axios.create({ baseURL: '/api' });

const CLAVE_TOKEN = 'siger.token';

export const sesionGuardada = {
  leer: (): string | null => {
    try {
      return sessionStorage.getItem(CLAVE_TOKEN);
    } catch {
      return null;
    }
  },
  guardar: (token: string) => {
    try {
      sessionStorage.setItem(CLAVE_TOKEN, token);
    } catch {
      /* almacenamiento no disponible */
    }
  },
  borrar: () => {
    try {
      sessionStorage.removeItem(CLAVE_TOKEN);
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

api.interceptors.request.use((cfg) => {
  const token = sesionGuardada.leer();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

/** Respuesta de error del backend: { codigo?: "MSG-xx", mensaje, campo? } */
export interface ErrorApi {
  codigo?: string;
  mensaje: string;
  campo?: string;
  estado?: number;
}

export function leerErrorApi(error: unknown): ErrorApi {
  if (error instanceof AxiosError) {
    const datos = error.response?.data as Partial<ErrorApi> | undefined;
    if (datos?.mensaje) return { ...datos, mensaje: datos.mensaje, estado: error.response?.status };
    if (!error.response) return { mensaje: 'No hay conexión con el servidor de SIGER.' };
  }
  return { mensaje: 'Ocurrió un error inesperado.' };
}
