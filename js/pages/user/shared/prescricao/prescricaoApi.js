// prescricaoApi.js
//
// Camada de acesso à API de prescrição. Só fetch: nenhuma regra de tela aqui.
// Mesmo padrão de atendimentoApi.js (json_success/json_error, credentials: "include") e MESMO
// ApiError, para o `instanceof` valer em todo o front.
//
// Prefixo (main.py): os três blueprints de prescrição ficam em /v1/api/prescricoes.
//
//   GET    /atendimento/<uuid_atendimento>            lista (rascunho/confirmado/descartado), só o médico dono
//   POST   /atendimento/<uuid_atendimento>            cria o rascunho manual (409 se já houver um)
//   PATCH  /<uuid_resultado>                          corrige o diagnóstico (só os campos enviados)
//   GET    /<uuid_resultado>/alertas                  interações do conjunto atual + cobertura
//   POST   /<uuid_resultado>/confirmar                {reconhecer_alertas}
//   POST   /<uuid_resultado>/descartar                {motivo?} descarte lógico
//   POST   /<uuid_resultado>/medicamentos             {uuid_catalogo, dose?, frequencia?, duracao?, orientacoes?}
//   PATCH  /<uuid_resultado>/medicamentos/<uuid_item>
//   DELETE /<uuid_resultado>/medicamentos/<uuid_item>
//   POST   /<uuid_resultado>/exames                   {uuid_exame, urgencia?, justificativa?}
//   PATCH  /<uuid_resultado>/exames/<uuid_item>
//   DELETE /<uuid_resultado>/exames/<uuid_item>
//
// Regras que o back decide (o front só mostra a mensagem): atendimento em andamento, dono, um
// rascunho por atendimento, rascunho ainda editável, farmacológica exige medicamento, alertas
// exigem reconhecimento.

import { URL_BASE_API } from "../../../../sharedConfig/urlConfig.js";
import { ApiError } from "../atendimento/atendimentoApi.js";

export { ApiError };

const BASE = `${URL_BASE_API}/prescricoes`;
const enc = encodeURIComponent;

async function requisitar(path, { method = "GET", body } = {}) {
  const init = { method, credentials: "include", cache: "no-store" };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let resposta;
  try {
    resposta = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor. Verifique sua internet.", 0);
  }

  let corpo;
  try {
    corpo = await resposta.json();
  } catch {
    throw new ApiError("Resposta inesperada do servidor.", resposta.status);
  }

  if (!resposta.ok || corpo.status === "error") {
    throw new ApiError(corpo.message || "Ocorreu um erro inesperado.", resposta.status, corpo.erros ?? null);
  }
  return corpo;
}

// ------------------------------------------------------------- resultado
export const listarDoAtendimento = (uuidAtendimento) =>
  requisitar(`/atendimento/${enc(uuidAtendimento)}`);

export const criarRascunho = (uuidAtendimento, payload) =>
  requisitar(`/atendimento/${enc(uuidAtendimento)}`, { method: "POST", body: payload });

export const atualizarDiagnostico = (uuidResultado, payload) =>
  requisitar(`/${enc(uuidResultado)}`, { method: "PATCH", body: payload });

export const buscarAlertas = (uuidResultado) =>
  requisitar(`/${enc(uuidResultado)}/alertas`);

export const confirmarPrescricao = (uuidResultado, reconhecerAlertas = false) =>
  requisitar(`/${enc(uuidResultado)}/confirmar`, {
    method: "POST", body: { reconhecer_alertas: Boolean(reconhecerAlertas) },
  });

export const descartarPrescricao = (uuidResultado, motivo) =>
  requisitar(`/${enc(uuidResultado)}/descartar`, {
    method: "POST", body: motivo ? { motivo } : {},
  });

// ----------------------------------------------------------- medicamentos
export const adicionarMedicamento = (uuidResultado, payload) =>
  requisitar(`/${enc(uuidResultado)}/medicamentos`, { method: "POST", body: payload });

export const atualizarMedicamento = (uuidResultado, uuidItem, payload) =>
  requisitar(`/${enc(uuidResultado)}/medicamentos/${enc(uuidItem)}`, { method: "PATCH", body: payload });

export const removerMedicamento = (uuidResultado, uuidItem) =>
  requisitar(`/${enc(uuidResultado)}/medicamentos/${enc(uuidItem)}`, { method: "DELETE" });

// ----------------------------------------------------------------- exames
export const adicionarExame = (uuidResultado, payload) =>
  requisitar(`/${enc(uuidResultado)}/exames`, { method: "POST", body: payload });

export const atualizarExame = (uuidResultado, uuidItem, payload) =>
  requisitar(`/${enc(uuidResultado)}/exames/${enc(uuidItem)}`, { method: "PATCH", body: payload });

export const removerExame = (uuidResultado, uuidItem) =>
  requisitar(`/${enc(uuidResultado)}/exames/${enc(uuidItem)}`, { method: "DELETE" });