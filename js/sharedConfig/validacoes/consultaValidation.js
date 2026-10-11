import {
  CAMPO_GERAL, strip, vazio, setErro, resultado, checarTamanho,
} from "./generalValidation.js";

// Cópia manual dos Literal de schema_consulta.py. Se o Enum do model mudar,
// atualizar o schema do back E aqui.
export const ORIGENS_VALIDAS = ["espontanea", "SAMU", "transferencia", "regulacao"];
export const DESFECHOS_VALIDOS = ["alta", "internacao", "transferencia", "obito", "evasao"];
export const SEXOS_VALIDOS = ["M", "F", "I"];

const MAX_TEXTO = 2000;

// ---------------------------------------------------------------- helpers

const msgLiteral = (validos) => `Deve ser um de: ${[...validos].sort().join(", ")}.`;

const ehObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Mesma checagem de uuid.UUID(): tira urn:/uuid:/chaves/hífens e exige 32 hex. */
function uuidValido(v) {
  const hex = v.replace(/^urn:/i, "").replace(/^uuid:/i, "").replace(/^\{|\}$/g, "").replace(/-/g, "");
  return /^[0-9a-f]{32}$/i.test(hex);
}

/** Cópia "strippada" do payload (equivale ao strip dos validators). */
const normalizar = (payload) =>
  Object.fromEntries(Object.entries(payload ?? {}).map(([k, v]) => [k, strip(v)]));

/**
 * Texto livre opcional (_strip_ou_none + max_length). Tamanho no valor bruto;
 * depois do strip, string vazia vira null.
 */
function textoOpcional(erros, d, bruto, campo) {
  if (!(campo in d)) return;
  const v = d[campo];
  if (v === null || v === undefined) { d[campo] = null; return; }
  if (typeof v !== "string") { setErro(erros, campo, "Deve ser texto."); return; }
  checarTamanho(erros, campo, bruto[campo], { max: MAX_TEXTO });
  d[campo] = v === "" ? null : v;
}

/** Remove chaves null/undefined: o back trata ausente e None da mesma forma. */
function semNulos(d) {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== undefined));
}

// ------------------------------------------------------------------ abrir

/** POST /consultas  e  POST /consultas/paciente/:uuid  (ConsultaAbrirSchema) */
export function validarAberturaConsulta(payload) {
  const erros = {};
  const bruto = payload ?? {};
  const d = normalizar(bruto);

  // uuid_paciente: opcional, UUID válido
  if ("uuid_paciente" in d) {
    const v = d.uuid_paciente;
    if (v === null || v === undefined || v === "") d.uuid_paciente = null;
    else if (typeof v !== "string") setErro(erros, "uuid_paciente", "Deve ser texto.");
    else if (!uuidValido(v)) setErro(erros, "uuid_paciente", "Não é um UUID válido.");
  }

  // paciente: objeto (o conteúdo é validado pela validação de Paciente)
  if ("paciente" in d && d.paciente !== null && d.paciente !== undefined && !ehObjeto(d.paciente)) {
    setErro(erros, "paciente", "Deve ser um objeto.");
  }

  // paciente_nao_identificado: StrictBool ("true" string não vale)
  if ("paciente_nao_identificado" in d && typeof d.paciente_nao_identificado !== "boolean") {
    setErro(erros, "paciente_nao_identificado", "Deve ser verdadeiro ou falso.");
  }

  textoOpcional(erros, d, bruto, "motivo_emergencia");

  // sexo_biologico (default "I" fica no back)
  if ("sexo_biologico" in d && !SEXOS_VALIDOS.includes(d.sexo_biologico)) {
    setErro(erros, "sexo_biologico", msgLiteral(SEXOS_VALIDOS));
  }

  // origem_encaminhamento (default "espontanea" fica no back)
  if ("origem_encaminhamento" in d && !ORIGENS_VALIDAS.includes(d.origem_encaminhamento)) {
    setErro(erros, "origem_encaminhamento", msgLiteral(ORIGENS_VALIDAS));
  }

  // regras cruzadas (model_validator): só rodam se os campos individuais passaram
  if (Object.keys(erros).length === 0) {
    const semId = d.paciente_nao_identificado === true;
    const formas = [
      !vazio(d.uuid_paciente),
      ehObjeto(d.paciente) && Object.keys(d.paciente).length > 0,
      semId,
    ];

    if (formas.filter(Boolean).length !== 1) {
      setErro(erros, CAMPO_GERAL,
        "informe exatamente um de: uuid_paciente, paciente, paciente_nao_identificado");
    } else if (semId) {
      if (vazio(d.motivo_emergencia)) {
        setErro(erros, CAMPO_GERAL,
          "motivo_emergencia é obrigatório quando paciente_nao_identificado=true");
      }
    } else if (!vazio(d.motivo_emergencia)) {
      setErro(erros, CAMPO_GERAL,
        "motivo_emergencia só é aceito com paciente_nao_identificado=true");
    } else if ("sexo_biologico" in d) {
      setErro(erros, CAMPO_GERAL,
        "sexo_biologico só é aceito com paciente_nao_identificado=true");
    }
  }

  return resultado(semNulos(d), erros);
}

// --------------------------------------------------------------- encerrar

/** POST /consultas/:uuid/encerrar  (ConsultaEncerrarSchema) */
export function validarEncerramentoConsulta(payload) {
  const erros = {};
  const bruto = payload ?? {};
  const d = normalizar(bruto);

  // desfecho_final: obrigatório
  if (vazio(d.desfecho_final)) setErro(erros, "desfecho_final", "Informe o desfecho final.");
  else if (!DESFECHOS_VALIDOS.includes(d.desfecho_final)) {
    setErro(erros, "desfecho_final", msgLiteral(DESFECHOS_VALIDOS));
  }

  textoOpcional(erros, d, bruto, "justificativa");

  return resultado(semNulos(d), erros);
}

// ----------------------------------------------------------------- evadir

/** POST /consultas/:uuid/evadir  (ConsultaEvadirSchema; desfecho é fixo) */
export function validarEvasaoConsulta(payload) {
  const erros = {};
  const bruto = payload ?? {};
  const d = normalizar(bruto);

  textoOpcional(erros, d, bruto, "justificativa");

  return resultado(semNulos(d), erros);
}