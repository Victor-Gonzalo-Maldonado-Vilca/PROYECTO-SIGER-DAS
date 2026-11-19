import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from '../config';
import { ESQUEMAS } from './esquemas';

/** Conexión a db_siger (PostgreSQL 15). */
export function crearFuenteDatos(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: config.db.host,
    port: config.db.puerto,
    database: config.db.nombre,
    username: config.db.usuario,
    password: config.db.contrasena,
    entities: ESQUEMAS,
    synchronize: false, // el esquema lo controla db/init/*.sql, nunca el ORM
    logging: false,
  });
}
