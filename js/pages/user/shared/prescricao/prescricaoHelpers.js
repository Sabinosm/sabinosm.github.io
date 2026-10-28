// prescricaoHelpers.js
//
// Utilitários puros da página de Prescrição: estado, rótulos dos enums do back, validação do
// diagnóstico (espelho de schema_prescricoes.py) e links entre páginas. Sem fetch.

import {
  el, estadoAtendimento, podeEscrever, uuidConsultaDaUrl,
} from "../atendimento/atendimentoHelpers.js";
import { ROTAS } from "../../../../sharedConfig/loaders/rotas.js";

export { el, estadoAtendimento, podeEscrever, uuidConsultaDaUrl };

// ------------------------------------------------------------------ estado
/** Escrito só por prescricao.js; os módulos de tela recebem o que precisam por parâmetro. */
export const estadoPrescricao = {
  resultados: [],     // todos do atendimento, do mais antigo ao mais novo
  atual: null,        // o que está em foco: rascunho; senão o último confirmado
  verificacao: null,  // { alertas, cobertura } do rascunho atual
};

export const uuidAtendimentoDaUrl = () =>
  new URLSearchParams(window.location.search).get("atendimento");

/**
 * Link para esta página. Requer ROTAS.prescricao em sharedConfig/loaders/rotas.js; sem ele cai no
 * nome do arquivo (mesma pasta de atendimento.html), para não quebrar enquanto a rota não entra.
 */
export function urlPrescricao(uuidConsulta, uuidAtendimento) {
  const params = new URLSearchParams({ consulta: uuidConsulta, atendimento: uuidAtendimento });
  return `${ROTAS.prescricao ?? "prescricao.html"}?${params.toString()}`;
}

// ----------------------------------------------------------------- enums
// Valores do back (schema_prescricoes.py / model ResultadoPrescricao).
export const CERTEZA_LABELS = {
  suspeito: "Suspeito", provavel: "Provável", confirmado: "Confirmado", descartado: "Descartado",
};
export const TIPO_PRESCRICAO_LABELS = {
  farmacologica: "Farmacológica", "nao-farmacologica": "Não farmacológica",
  encaminhamento: "Encaminhamento", internacao: "Internação", alta: "Alta",
};
export const URGENCIA_LABELS = { rotina: "Rotina", urgente: "Urgente", emergencia: "Emergência" };
export const STATUS_LABELS = { rascunho: "Rascunho", confirmado: "Confirmada", descartado: "Descartada" };
export const ORIGEM_LABELS = { medico: "Médico", bion_ia: "IA", protocolo: "Protocolo" };
export const CONTEXTO_ALERTA_LABELS = {
  entre_itens_prescritos: "entre itens desta prescrição",
  com_medicamento_em_uso: "com medicamento em uso",
};

/** Valor desconhecido aparece como veio (nunca em branco). */
export const rotulo = (mapa, valor) => (valor == null || valor === "" ? "—" : (mapa[valor] ?? String(valor)));

// ------------------------------------------------------------- seleção
/** Em foco: o rascunho mais novo; sem rascunho, a última confirmada; senão null. */
export function escolherAtual(resultados) {
  const do_fim = [...(resultados ?? [])].reverse();
  return do_fim.find((r) => r.status === "rascunho") ?? do_fim.find((r) => r.status === "confirmado") ?? null;
}

/** Os demais, do mais novo ao mais antigo (para a lista de histórico). */
export const historicoDe = (resultados, atual) =>
  [...(resultados ?? [])].reverse().filter((r) => r.uuid !== atual?.uuid);

/** Pode editar: rascunho + gate do atendimento (dono e em andamento). O back continua sendo a cerca. */
export const podeEditar = (resultado) =>
  Boolean(resultado) && resultado.status === "rascunho" && podeEscrever();

export const temRascunho = (resultados) => (resultados ?? []).some((r) => r.status === "rascunho");

/** A IA só pode (re)gerar se não houver rascunho do médico (o back devolve 409 nesse caso). */
export const iaPodeGerar = (atual) =>
  !(atual?.status === "rascunho" && atual.origem_sugestao !== "bion_ia");

// ------------------------------------------------------------ validação
export const CID_REGEX = /^[A-Z][0-9]{2}(\.[0-9]{1,2})?$/;
export const LIMITES = { descricao: 255, itemCurto: 100, itemLongo: 2000, cid: 6 };

export const normalizarCid = (v) => String(v ?? "").trim().toUpperCase();

/** "" -> null (o back também trata vazio como limpar). */
export const textoOuNull = (v) => {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
};

/** Devolve { campo: mensagem }; objeto vazio = válido. */
export function validarDiagnostico({ cid, descricao, certeza }) {
  const erros = {};
  if (!CID_REGEX.test(normalizarCid(cid))) erros.cid = "Use o formato CID-10, por exemplo J18 ou J18.9.";
  const d = String(descricao ?? "").trim();
  if (!d) erros.descricao = "Informe a descrição do diagnóstico.";
  else if (d.length > LIMITES.descricao) erros.descricao = `Máximo de ${LIMITES.descricao} caracteres.`;
  if (!(certeza in CERTEZA_LABELS)) erros.certeza = "Escolha a certeza do diagnóstico.";
  return erros;
}

/** Só os campos que mudaram, no formato do PATCH. Vazio = nada a salvar. */
export function diferencaDiagnostico(resultado, { cid, descricao, certeza, tipo }) {
  const novo = {
    codigo_cid10_principal: normalizarCid(cid),
    descricao_cid10_principal: String(descricao ?? "").trim(),
    certeza_diagnostica: certeza,
    tipo_prescricao: tipo || null,
  };
  const patch = {};
  for (const [campo, valor] of Object.entries(novo)) {
    if ((resultado[campo] ?? null) !== valor) patch[campo] = valor;
  }
  return patch;
}

// ------------------------------------------------------------- mensagens
/** Mensagem do back quando é ApiError (de qualquer uma das camadas); senão o texto padrão. */
export const mensagemDeErro = (erro, padrao) => (erro?.name === "ApiError" ? erro.message : padrao);

export const nomeMedicamento = (item) => item?.medicamento?.principio_ativo ?? "Medicamento";
export const nomeExame = (item) => item?.exame?.nome_exame ?? "Exame";