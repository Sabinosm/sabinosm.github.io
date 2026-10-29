// shared/downloadPdf.js
//
// Download dos PDFs gerados pelo back (atendimento, consulta e prescrição). Sem regra de tela:
//   - baixarPdf()      -> fetch com cookie de sessão (URL_BASE_API é relativo = mesma origem), valida e
//                         devolve { blob, nome }
//   - salvarBlob()     -> dispara o download no navegador
//   - executarDownload -> liga tudo a um botão (desabilita, mostra "Gerando PDF…", avisa o erro)
//
// Rotas (back: download_controller.py, registrado em /v1/api):
//   GET /consultas/<uuid>/pdf?modo=resumo|detalhado       (consulta aberta sai com marca PARCIAL)
//   GET /atendimentos/<uuid>/pdf?modo=resumo|detalhado    (resumo só de atendimento finalizado: 409)
//   GET /prescricoes/<uuid_resultado>/pdf                 (só prescrição CONFIRMADA: 409)
//
// Erros do back chegam como JSON ({status:"error", message}) e viram ErroDownload (name "ApiError",
// como as demais camadas do front). O PDF nunca é guardado: o blob vive só até o clique.

import { URL_BASE_API } from "../sharedConfig/urlConfig.js";
import { exibirMensagem } from "./feedback.js";

const URL_BASE_API_DOWNLOADS = URL_BASE_API + "/downloads"
const enc = encodeURIComponent;

export class ErroDownload extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Mesmo nome que o back usa (os 8 primeiros caracteres do uuid), para quando o cabeçalho não vier. */
export const nomePdf = (prefixo, uuid, modo) =>
  `${prefixo}-${String(uuid).slice(0, 8)}${modo ? `-${modo}` : ""}.pdf`;

/** filename do Content-Disposition (aceita filename*=UTF-8''... e filename="..."); null se não houver. */
export function nomeDoCabecalho(valor) {
  if (!valor) return null;
  const estendido = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(valor);
  if (estendido) {
    try { return decodeURIComponent(estendido[1].trim()); } catch { /* cai no simples */ }
  }
  const simples = /filename\s*=\s*"?([^";]+)"?/i.exec(valor);
  return simples ? simples[1].trim() : null;
}

export async function baixarPdf(caminho, nomePadrao) {
  let resposta;
  try {
    resposta = await fetch(`${URL_BASE_API_DOWNLOADS}${caminho}`, { credentials: "include", cache: "no-store" });
  } catch {
    throw new ErroDownload("Não foi possível conectar ao servidor. Verifique sua internet.", 0);
  }

  if (!resposta.ok) {
    let mensagem = "Não foi possível gerar o PDF.";
    try { mensagem = (await resposta.json()).message || mensagem; } catch { /* corpo não era JSON */ }
    throw new ErroDownload(mensagem, resposta.status);
  }

  const tipo = resposta.headers.get("Content-Type") ?? "";
  if (!tipo.includes("pdf")) throw new ErroDownload("Resposta inesperada do servidor.", resposta.status);

  return {
    blob: await resposta.blob(),
    nome: nomeDoCabecalho(resposta.headers.get("Content-Disposition")) ?? nomePadrao,
  };
}

export function salvarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const pdfConsulta = (uuidConsulta, modo) =>
  baixarPdf(`/consultas/${enc(uuidConsulta)}/pdf?modo=${enc(modo)}`, nomePdf("consulta", uuidConsulta, modo));

export const pdfAtendimento = (uuidAtendimento, modo) =>
  baixarPdf(`/atendimentos/${enc(uuidAtendimento)}/pdf?modo=${enc(modo)}`, nomePdf("atendimento", uuidAtendimento, modo));

export const pdfPrescricao = (uuidResultado) =>
  baixarPdf(`/prescricoes/${enc(uuidResultado)}/pdf`, nomePdf("prescricao", uuidResultado));

/**
 * Liga um download a um botão: desabilita, mostra "Gerando PDF…" e, em erro, avisa com a mensagem do
 * back (ex.: 409 "O resumo só existe para atendimento finalizado"). `acao` devolve { blob, nome }.
 * Um clique por vez por botão.
 */
export async function executarDownload(botao, acao) {
  if (botao.disabled) return;
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Gerando PDF…";
  try {
    const { blob, nome } = await acao();
    salvarBlob(blob, nome);
  } catch (erro) {
    exibirMensagem(erro?.name === "ApiError" ? erro.message : "Não foi possível gerar o PDF.", "erro");
  } finally {
    botao.textContent = textoOriginal;
    botao.disabled = false;
  }
}