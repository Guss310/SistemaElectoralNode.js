const db = require("../config/database")
const mesaService = require("./mesaService")

class EleccionService {
  async obtenerEleccionActiva() {
    try {
      const [rows] = await db.execute("SELECT * FROM Eleccion WHERE Esta_activa = TRUE LIMIT 1")
      return rows[0]
    } catch (error) {
      throw new Error("Error al obtener elección activa: " + error.message)
    }
  }

  async obtenerPapeletas(idEleccion) {
    try {
      const [rows] = await db.execute(
        `SELECT p.*, l.Numero as NumeroLista, pt.Direccion_sede,
                pol.Nombre_completo as NombreCandidato
         FROM Papeleta p
         LEFT JOIN Lista l ON p.Numero_lista = l.Numero
         LEFT JOIN Partido pt ON l.Id_partido = pt.Id_partido
         LEFT JOIN Politico pol_rel ON l.Cedula_politico_apoyado = pol_rel.Cedula
         LEFT JOIN Votante pol ON pol_rel.Cedula = pol.Cedula
         WHERE p.Id_eleccion = ?
         ORDER BY p.Id_papeleta`,
        [idEleccion],
      )
      return rows
    } catch (error) {
      throw new Error("Error al obtener papeletas: " + error.message)
    }
  }

  async obtenerResultadosCircuito(idCircuito, cedulaSolicitante) {
    try {
      // Verificar que la mesa está cerrada antes de mostrar resultados
      const estadoMesa = await mesaService.obtenerEstadoMesa(idCircuito)
      if (!estadoMesa) {
        throw new Error("Circuito no encontrado")
      }

      if (estadoMesa.Esta_abierta) {
        // Solo el presidente de mesa puede ver resultados parciales
        const esPresidente = await mesaService.verificarPresidenteMesa(cedulaSolicitante, idCircuito)
        if (!esPresidente) {
          throw new Error("Los resultados solo están disponibles cuando la mesa está cerrada")
        }
      }

      const [rows] = await db.execute(
        `SELECT p.Color, l.Numero as NumeroLista, pt.Direccion_sede as Partido,
                COUNT(v.Id_voto) as CantidadVotos,
                v.Estado,
                pol.Nombre_completo as Candidato
         FROM Voto v
         JOIN Papeleta p ON v.Id_papeleta = p.Id_papeleta
         LEFT JOIN Lista l ON p.Numero_lista = l.Numero
         LEFT JOIN Partido pt ON l.Id_partido = pt.Id_partido
         LEFT JOIN Politico pol_rel ON l.Cedula_politico_apoyado = pol_rel.Cedula
         LEFT JOIN Votante pol ON pol_rel.Cedula = pol.Cedula
         WHERE v.Id_circuito = ?
         GROUP BY p.Id_papeleta, v.Estado
         ORDER BY CantidadVotos DESC`,
        [idCircuito],
      )

      return {
        resultados: rows,
        estadoMesa: estadoMesa,
      }
    } catch (error) {
      throw error
    }
  }

  async obtenerResultadosDepartamento(idDepartamento) {
    try {
      const [rows] = await db.execute(
        `SELECT d.Nombre as Departamento, p.Color, l.Numero as NumeroLista, 
                pt.Direccion_sede as Partido, pol.Nombre_completo as Candidato,
                COUNT(v.Id_voto) as CantidadVotos, v.Estado
         FROM Voto v
         JOIN Circuito c ON v.Id_circuito = c.Id_circuito
         JOIN Zona z ON c.Id_zona = z.Id_zona
         JOIN Departamento d ON z.Id_departamento = d.Id_departamento
         JOIN Papeleta p ON v.Id_papeleta = p.Id_papeleta
         LEFT JOIN Lista l ON p.Numero_lista = l.Numero
         LEFT JOIN Partido pt ON l.Id_partido = pt.Id_partido
         LEFT JOIN Politico pol_rel ON l.Cedula_politico_apoyado = pol_rel.Cedula
         LEFT JOIN Votante pol ON pol_rel.Cedula = pol.Cedula
         JOIN Estado_mesa em ON c.Id_circuito = em.Id_circuito
         WHERE d.Id_departamento = ? AND em.Esta_abierta = FALSE
         GROUP BY d.Id_departamento, p.Id_papeleta, v.Estado
         ORDER BY CantidadVotos DESC`,
        [idDepartamento],
      )
      return rows
    } catch (error) {
      throw new Error("Error al obtener resultados por departamento: " + error.message)
    }
  }

  async obtenerResultadosNacionales() {
    try {
      const [rows] = await db.execute(
        `SELECT p.Color, l.Numero as NumeroLista, 
                pt.Direccion_sede as Partido, pol.Nombre_completo as Candidato,
                COUNT(v.Id_voto) as CantidadVotos, v.Estado
         FROM Voto v
         JOIN Circuito c ON v.Id_circuito = c.Id_circuito
         JOIN Papeleta p ON v.Id_papeleta = p.Id_papeleta
         LEFT JOIN Lista l ON p.Numero_lista = l.Numero
         LEFT JOIN Partido pt ON l.Id_partido = pt.Id_partido
         LEFT JOIN Politico pol_rel ON l.Cedula_politico_apoyado = pol_rel.Cedula
         LEFT JOIN Votante pol ON pol_rel.Cedula = pol.Cedula
         JOIN Estado_mesa em ON c.Id_circuito = em.Id_circuito
         WHERE em.Esta_abierta = FALSE
         GROUP BY p.Id_papeleta, v.Estado
         ORDER BY CantidadVotos DESC`,
      )
      return rows
    } catch (error) {
      throw new Error("Error al obtener resultados nacionales: " + error.message)
    }
  }
}

module.exports = new EleccionService()
