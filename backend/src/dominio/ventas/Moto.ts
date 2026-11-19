import { ErrorDominio } from '../compartido/errores';

/**
 * Entidad Moto (Vista Lógica, MOD-02, Fig. 4).
 * Invariante: { numeroMotor y numeroChasis únicos } — la unicidad se verifica
 * contra la base de datos en el caso de uso y se refuerza con índices únicos.
 */
export interface DatosMoto {
  marca: string;
  modelo: string;
  anio: number;
  color: string;
  numeroMotor: string;
  numeroChasis: string;
  placa?: string | null;
}

/** Campos del formulario INT-012 (ILA-0012) en el orden en que se validan. */
const CAMPOS_OBLIGATORIOS: Array<{ campo: keyof DatosMoto; etiqueta: string }> = [
  { campo: 'marca', etiqueta: 'Marca (INP-30)' },
  { campo: 'modelo', etiqueta: 'Modelo (INP-31)' },
  { campo: 'anio', etiqueta: 'Año (INP-32)' },
  { campo: 'color', etiqueta: 'Color (INP-33)' },
  { campo: 'numeroMotor', etiqueta: 'N.° de motor (INP-34)' },
  { campo: 'numeroChasis', etiqueta: 'N.° de chasis (INP-35)' },
];

const ANIO_MINIMO = 1900;

export class Moto {
  private constructor(readonly datos: Readonly<DatosMoto>) {}

  /**
   * Crea una moto validando los campos obligatorios (paso 5 de ILA-0012).
   * Lanza MSG-45 indicando el primer campo vacío.
   */
  static crear(entrada: Partial<Record<keyof DatosMoto, unknown>>): Moto {
    for (const { campo, etiqueta } of CAMPOS_OBLIGATORIOS) {
      const valor = entrada[campo];
      if (valor === undefined || valor === null || String(valor).trim() === '') {
        throw new ErrorDominio('MSG-45', `Campo obligatorio vacío: ${etiqueta}`, campo);
      }
    }

    const anio = Number(entrada.anio);
    const anioMaximo = new Date().getFullYear() + 1;
    if (!Number.isInteger(anio) || anio < ANIO_MINIMO || anio > anioMaximo) {
      throw new ErrorDominio(
        'VAL-ANIO',
        `El año debe ser un número entero entre ${ANIO_MINIMO} y ${anioMaximo}.`,
        'anio',
      );
    }

    const texto = (v: unknown) => String(v).trim();
    const placa = entrada.placa ? texto(entrada.placa).toUpperCase() : null;

    return new Moto({
      marca: texto(entrada.marca),
      modelo: texto(entrada.modelo),
      anio,
      color: texto(entrada.color),
      // Se normalizan en mayúsculas para que la verificación de unicidad no dependa del formato.
      numeroMotor: texto(entrada.numeroMotor).toUpperCase(),
      numeroChasis: texto(entrada.numeroChasis).toUpperCase(),
      placa,
    });
  }
}
