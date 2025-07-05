const db = require("../config/database")
const { VOTE_STATES } = require("../utils/constants")
const mesaService = require("./mesaService")

class VotanteService {
  async obtenerVotantePorCedula(cedula) {
    try {
      const [rows] = await db.execute(
        `SELECT v.*, c.Id_circuito, c.Es_accesible, 
                z.Ciudad, z.Paraje, z.Barrio, 
                d.Nombre as Departamento
         FROM Votante v
         JOIN Circuito c ON v.Id_circuito = c.Id_circuito
         JOIN Zona z ON c.Id_zona = z.Id_zona
         JOIN Departamento d ON z.Id_departamento = d.Id_departamento
         WHERE v.Cedula = ?`,
        [cedula],
      )
      return rows[0]
    } catch (error) {
      throw new Error("Error al obtener votante: " + error.message)
    }
  }

  async verificarYaVoto(cedula, idEleccion) {
    try {
      const [rows] = await db.execute(
        `SELECT COUNT(*) as count 
         FROM Votante_voto vv
         JOIN Voto v ON vv.Id_voto = v.Id_voto
         JOIN Papeleta p ON v.Id_papeleta = p.Id_papeleta
         WHERE vv.Cedula = ? AND p.Id_eleccion = ?`,
        [cedula, idEleccion],
      )
      return rows[0].count > 0
    } catch (error) {
      throw new Error("Error al verificar voto: " + error.message)
    }
  }

  async registrarVoto(cedula, idPapeleta, idCircuito, observado = false) {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()

      // Verificar que la mesa está abierta
      const estadoMesa = await mesaService.obtenerEstadoMesa(idCircuito)
      if (!estadoMesa || !estadoMesa.Esta_abierta) {
        throw new Error("La mesa de votación está cerrada. No se pueden registrar más votos.")
      }

      // Determinar el estado del voto basado en la papeleta
      let estado = VOTE_STATES.VALID

      // Verificar si es voto en blanco (papeleta sin lista asociada)
      const [papeletaInfo] = await connection.execute("SELECT Numero_lista FROM Papeleta WHERE Id_papeleta = ?", [
        idPapeleta,
      ])

      if (papeletaInfo.length > 0 && papeletaInfo[0].Numero_lista === null) {
        estado = VOTE_STATES.BLANK
      }

      // Insertar el voto con el estado correcto
      const [votoResult] = await connection.execute(
        `INSERT INTO Voto (Fecha_hora, Observado, Estado, Id_circuito, Id_papeleta) 
       VALUES (NOW(), ?, ?, ?, ?)`,
        [observado, estado, idCircuito, idPapeleta],
      )

      const idVoto = votoResult.insertId

      // Registrar la relación votante-voto
      await connection.execute(
        `INSERT INTO Votante_voto (Cedula, Id_voto, Fecha_hora) 
       VALUES (?, ?, NOW())`,
        [cedula, idVoto],
      )

      // Registrar la relación voto-papeleta
      await connection.execute(
        `INSERT INTO Voto_papeleta (Id_voto, Id_papeleta) 
       VALUES (?, ?)`,
        [idVoto, idPapeleta],
      )

      await connection.commit()
      return idVoto
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  async obtenerRolUsuario(cedula) {
    try {
      // Verificar si es miembro de mesa
      const [mesaRows] = await db.execute(
        `SELECT mm.*, v.Nombre_completo 
         FROM Miembro_de_mesa mm
         JOIN Votante v ON mm.Cedula = v.Cedula
         WHERE mm.Cedula = ?`,
        [cedula],
      )

      if (mesaRows.length > 0) {
        return {
          tipo: "miembro_mesa",
          rol: mesaRows[0].Rol,
          circuito: mesaRows[0].Id_circuito_que_compone,
          nombre: mesaRows[0].Nombre_completo,
          organismo: mesaRows[0].Organismo,
        }
      }

      // Si no es miembro de mesa, es votante común
      const votante = await this.obtenerVotantePorCedula(cedula)
      if (votante) {
        return {
          tipo: "votante",
          rol: "ciudadano",
          circuito: votante.Id_circuito,
          nombre: votante.Nombre_completo,
        }
      }

      return null
    } catch (error) {
      throw new Error("Error al obtener rol de usuario: " + error.message)
    }
  }
}

module.exports = new VotanteService()
