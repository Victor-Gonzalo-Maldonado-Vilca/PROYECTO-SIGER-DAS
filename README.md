# SIGER — Sistema Integral de Gestión Rider

Sistema para **Moto Repuestos Rider Soluciones E.I.R.L.**, del curso Diseño y Arquitectura de Software 2026-B (UNSA), desarrollado por el equipo Dev. Siger.

## Arquitectura

La arquitectura es **N-Capas Cliente-Servidor con principios de Clean Architecture** (Arquitectura Genérica e informe del Hito 3). El stack sigue la **Vista Física v01.02**:

| Capa | Tecnología | Carpeta |
|---|---|---|
| Presentación | React 18 + Vite + Axios (SPA para la Laptop Mostrador) | `frontend/` |
| Comunicación | Express (API REST/JSON), JWT y RBAC por módulo | `backend/src/comunicacion/` |
| Aplicación | Casos de uso (clases «control» de la Vista Lógica) | `backend/src/aplicacion/` |
| Dominio | Entidades, reglas e interfaces de repositorio | `backend/src/dominio/` |
| Acceso a Datos | TypeORM: repositorios y Unidad de Trabajo (commit/rollback) | `backend/src/acceso_datos/` |
| Persistencia | PostgreSQL 15 (`db_siger`) | `db/init/*.sql` |
| Integraciones | SUNAT y job de pendientes (pendiente) | `backend/src/integraciones/` |

**Regla de dependencias:** `dominio/` no importa nada de las otras carpetas. `aplicacion/` solo importa de `dominio/`. Las implementaciones concretas (TypeORM, bcrypt, JWT) se conectan únicamente en `backend/src/main.ts`.

### Transacciones (PRO-02)

- El caso de uso delimita la transacción con `uow.ejecutar(async (repos) => { ... })`.
- `UnidadDeTrabajoTypeORM` la implementa con BEGIN, COMMIT y ROLLBACK.
- Si cualquier paso lanza un error, se revierte todo (RNF-0004).

## Requisitos

- Node.js 20 o superior
- Docker Desktop, para correr PostgreSQL 15

## Cómo ejecutar

```bash
# 1. Base de datos (la primera vez crea las tablas y los usuarios de prueba)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env        # en Windows PowerShell: copy .env.example .env
npm install
npm run dev                 # API en http://localhost:3000/api

# 3. Frontend (en otra terminal)
cd frontend
npm install
npm run dev                 # abrir http://localhost:5173
```

Los usuarios de prueba están en [`db/init/002_datos_iniciales.sql`](db/init/002_datos_iniciales.sql).

Para borrar la base de datos y recrearla desde cero: `docker compose down -v` y luego `docker compose up -d`.

Los scripts de `db/init` se ejecutan **solo** cuando la base de datos se crea por primera vez. Si un compañero agrega un script nuevo, tienes dos opciones:

- Recrear la base con `docker compose down -v` y `docker compose up -d` (se pierden los datos locales).
- Aplicar solo el script nuevo, por ejemplo:
  `docker exec -i siger-db psql -U siger -d db_siger < db/init/003_ordenes_conformidad.sql`

El script `004_datos_demo_taller.sql` carga órdenes y proformas de demostración para probar ILA-0075.

## Pruebas

```bash
cd backend
npm test                  # pruebas unitarias de los casos de uso (no requieren BD)
npm run test:integracion  # rollback y concurrencia contra PostgreSQL (requiere docker compose up -d)
npm run typecheck
```

## Avance por caso de uso

| Ilación | Descripción | Estado |
|---|---|---|
| EDU-0017 | Inicio de sesión con JWT y RBAC por módulo | ✅ |
| ILA-0012 | Registrar venta de moto: transacción atómica Tab_moto + Tab_venta_moto + auditoría | ✅ |
| ILA-0075 | Conformidad de servicio con firma PAD-01: INSERT tab_CS + UPDATE tab_OS + historial en una transacción | ✅ |
| ILA-0018 | Emitir comprobante (outbox + job + conciliación, PRO-03 y PRO-04) | ⏳ |

## Cómo agregar un caso de uso nuevo

1. **Dominio:** crea la entidad y sus reglas en `dominio/<modulo>/`, y la interfaz del repositorio.
2. **Aplicación:** crea el caso de uso en `aplicacion/<modulo>/`. Si escribe datos, usa `uow.ejecutar`.
3. **Acceso a datos:** agrega el `EntitySchema` en `esquemas.ts`, el repositorio TypeORM, y regístralo en `UnidadDeTrabajoTypeORM`.
4. **Persistencia:** crea un script nuevo `db/init/00X_*.sql`. No modifiques los scripts anteriores.
5. **Comunicación:** agrega la ruta en `rutas.ts` con `requiereModulo('MOD-0X')`.
6. **Composición:** conecta todo en `main.ts`.
7. **Pruebas:** agrega `*.test.ts` junto al caso de uso.

## Flujo de trabajo con Git

- Crea una rama por tarea: `feature/mod04-proformas`, `feature/ila-0075-conformidad`, etc.
- Usa commits pequeños que citen el código del catálogo, por ejemplo: `feat(MOD-04): ILA-0012 registrar venta de moto`.
- Integra a `main` mediante un Pull Request. `main` siempre debe compilar y pasar `npm test`.
