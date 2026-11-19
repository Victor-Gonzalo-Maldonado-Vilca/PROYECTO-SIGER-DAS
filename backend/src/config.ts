import 'dotenv/config';

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}. Copie backend/.env.example como backend/.env`);
  }
  return valor;
}

export const config = {
  puerto: Number(process.env.PORT ?? 3000),
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    puerto: Number(process.env.DB_PORT ?? 5432),
    nombre: process.env.DB_NAME ?? 'db_siger',
    usuario: requerida('DB_USER'),
    contrasena: requerida('DB_PASSWORD'),
  },
  jwt: {
    secreto: requerida('JWT_SECRET'),
    expiraEn: process.env.JWT_EXPIRES_IN ?? '8h',
  },
  corsOrigen: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
};
