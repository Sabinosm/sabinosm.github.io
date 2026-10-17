// consultaAssinatura.js
//
// Coleta do termo de consentimento por QR code, do lado do médico/enfermeiro,
// na página de detalhe da consulta.
//
// Fluxo:
//   1. gerar-link-assinatura (sem versão: o servidor usa a vigente) -> token;
//   2. mostra o QR code com o endereço da página do paciente
//      (assinar.html?token=...), os dados de quem deve assinar (para
//      conferir a identidade) e a contagem regressiva do link;
//   3. consulta o status a cada poucos segundos: pendente -> usado | expirado;
//   4. "usado": avisa a página (EVENTO_CONSULTA_ALTERADA, que recarrega o
//      consentimento) e oferece o PDF assinado.
//
// O link vale poucos minutos (o back define) e gerar outro cancela o anterior
// do mesmo paciente. Fechar o modal NÃO cancela o link: só para o
// acompanhamento. Para invalidar na hora, o botão "Cancelar link".
//
// O botão #cons-btn-coletar-termo carrega o uuid do paciente em
// data-paciente-uuid (preenchido por consultaDetalhe.js). Paciente sem dados
// pessoais (emergência não identificada ou anonimizado) não pode assinar: o
// botão fica desabilitado e o back também recusa.
//
// QR code: biblioteca qrcodejs (global QRCode), carregada por <script> em
// consultaDetalhe.html. Se não carregar, o link continua disponível em texto.

import {
  ApiError, baixarPdfAssinado, cancelarLinkAssinatura, gerarLinkAssinatura, statusAssinatura,
} from "../consultaApi.js";
import {
  CLASSE_OVERLAY_VISIVEL, EVENTO_CONSULTA_ALTERADA, exibirAviso, paraDataUtc, urlAssinaturaPaciente,
} from "../consultaHelpers.js";

const INTERVALO_STATUS_MS = 3000;
const TAMANHO_QR = 220;

const $ = (id) => document.getElementById(id);

let token = null;
let expiraEm = null;            // Date (UTC)
let consentimentoUuid = null;
let timerStatus = null;
let timerRelogio = null;
let consultando = false;
let gerando = false;
let linkAtual = "";

document.addEventListener("DOMContentLoaded", () => {
  $("cons-btn-coletar-termo")?.addEventListener("click", abrirModal);
  $("cons-qr-close")?.addEventListener("click", fecharModal);
  $("cons-qr-fechar")?.addEventListener("click", fecharModal);
  $("cons-qr-overlay")?.addEventListener("click", (e) => {
    if (e.target === $("cons-qr-overlay")) fecharModal();
  });

  $("cons-qr-novo")?.addEventListener("click", gerar);
  $("cons-qr-cancelar-link")?.addEventListener("click", cancelarLink);
  $("cons-qr-copiar")?.addEventListener("click", copiarLink);
  $("cons-qr-baixar")?.addEventListener("click", baixarPdf);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("cons-qr-overlay")?.classList.contains(CLASSE_OVERLAY_VISIVEL)) fecharModal();
  });
});

// ============================================
// Abrir / fechar
// ============================================
function abrirModal() {
  feedback("", "");
  $("cons-qr-overlay").classList.add(CLASSE_OVERLAY_VISIVEL);
  gerar();
}

function fecharModal() {
  pararTimers();
  $("cons-qr-overlay")?.classList.remove(CLASSE_OVERLAY_VISIVEL);
  const alvo = $("cons-qr-code");
  if (alvo) alvo.innerHTML = "";
  token = null;
  consentimentoUuid = null;
  linkAtual = "";
}

// ============================================
// Painéis: gerando | aguardando | assinado | expirado | erro
// Elementos com data-em="a b" só aparecem nesses painéis.
// ============================================
function mostrarPainel(nome) {
  document.querySelectorAll("#cons-qr-overlay .cons-qr-painel").forEach((p) => {
    p.hidden = p.dataset.painel !== nome;
  });
  document.querySelectorAll("#cons-qr-overlay [data-em]").forEach((el) => {
    el.hidden = !el.dataset.em.split(/\s+/).includes(nome);
  });
}

// ============================================
// Gerar o link
// ============================================
async function gerar() {
  if (gerando) return;
  gerando = true;
  pararTimers();
  feedback("", "");
  mostrarPainel("gerando");

  try {
    const uuidPaciente = $("cons-btn-coletar-termo")?.dataset.pacienteUuid;
    if (!uuidPaciente) throw new ApiError("Paciente da consulta não identificado na tela. Recarregue a página.", 0);

    const resposta = await gerarLinkAssinatura(uuidPaciente);
    const d = resposta.data;

    token = d.token;
    expiraEm = paraDataUtc(d.expira_em);
    consentimentoUuid = null;
    linkAtual = urlAssinaturaPaciente(token);

    $("cons-qr-paciente").textContent = [d.paciente_nome, d.paciente_cpf ? `CPF ${d.paciente_cpf}` : null]
      .filter(Boolean).join(" · ");
    $("cons-qr-link").value = linkAtual;
    desenharQr(linkAtual);

    mostrarPainel("aguardando");
    iniciarRelogio();
    iniciarAcompanhamento();
  } catch (erro) {
    $("cons-qr-erro-texto").textContent =
      erro instanceof ApiError ? erro.message : "Não foi possível gerar o link de assinatura.";
    mostrarPainel("erro");
  } finally {
    gerando = false;
  }
}

function desenharQr(url) {
  const alvo = $("cons-qr-code");
  alvo.innerHTML = "";
  if (typeof QRCode === "undefined") {
    feedback("Biblioteca de QR code indisponível: use o link abaixo.", "info");
    return;
  }
  // eslint-disable-next-line no-new
  new QRCode(alvo, { text: url, width: TAMANHO_QR, height: TAMANHO_QR, correctLevel: QRCode.CorrectLevel.M });
}

// ============================================
// Contagem regressiva e acompanhamento do status
// ============================================
function iniciarRelogio() {
  atualizarRelogio();
  timerRelogio = setInterval(atualizarRelogio, 1000);
}

function atualizarRelogio() {
  if (!expiraEm) return;
  const restanteMs = expiraEm.getTime() - Date.now();
  if (restanteMs <= 0) {
    marcarExpirado();
    return;
  }
  const totalSeg = Math.ceil(restanteMs / 1000);
  const mm = String(Math.floor(totalSeg / 60)).padStart(2, "0");
  const ss = String(totalSeg % 60).padStart(2, "0");
  $("cons-qr-relogio").textContent = `${mm}:${ss}`;
}

function iniciarAcompanhamento() {
  timerStatus = setInterval(consultarStatus, INTERVALO_STATUS_MS);
}

async function consultarStatus() {
  if (consultando || !token) return;
  consultando = true;
  const tokenConsultado = token;

  try {
    const resposta = await statusAssinatura(tokenConsultado);
    if (tokenConsultado !== token) return; // o link mudou enquanto a consulta voltava

    const status = resposta.data?.status;
    if (status === "usado") {
      consentimentoUuid = resposta.data.consentimento_uuid ?? null;
      pararTimers();
      $("cons-qr-baixar").dataset.uuid = consentimentoUuid ?? "";
      mostrarPainel("assinado");
      $("cons-qr-baixar").hidden = !consentimentoUuid;
      document.dispatchEvent(new CustomEvent(EVENTO_CONSULTA_ALTERADA));
    } else if (status === "expirado") {
      marcarExpirado();
    }
  } catch {
    // falha pontual de rede: tenta de novo no próximo ciclo
  } finally {
    consultando = false;
  }
}

function marcarExpirado() {
  pararTimers();
  mostrarPainel("expirado");
}

function pararTimers() {
  clearInterval(timerStatus);
  clearInterval(timerRelogio);
  timerStatus = null;
  timerRelogio = null;
}

// ============================================
// Ações
// ============================================
async function cancelarLink() {
  if (!token) return;
  const botao = $("cons-qr-cancelar-link");
  botao.disabled = true;
  try {
    await cancelarLinkAssinatura(token);
    fecharModal();
    exibirAviso("Link de assinatura cancelado.", "info");
  } catch (erro) {
    // 409: o paciente acabou de assinar; o acompanhamento mostra o resultado
    feedback(erro instanceof ApiError ? erro.message : "Não foi possível cancelar o link.", "erro");
  } finally {
    botao.disabled = false;
  }
}

async function copiarLink() {
  try {
    await navigator.clipboard.writeText(linkAtual);
    feedback("Link copiado.", "sucesso");
  } catch {
    // sem permissão de área de transferência: seleciona para copiar à mão
    const campo = $("cons-qr-link");
    campo.focus();
    campo.select();
    feedback("Selecione e copie o link.", "info");
  }
}

async function baixarPdf() {
  const uuid = $("cons-qr-baixar").dataset.uuid;
  if (!uuid) return;
  const botao = $("cons-qr-baixar");
  botao.disabled = true;

  try {
    const { blob, integridade } = await baixarPdfAssinado(uuid);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `termo_assinado_${uuid}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    if (integridade === "divergente") {
      feedback("O PDF foi baixado, mas o hash refeito não bate com o registrado na assinatura.", "erro");
    }
  } catch (erro) {
    feedback(erro instanceof ApiError ? erro.message : "Não foi possível baixar o PDF.", "erro");
  } finally {
    botao.disabled = false;
  }
}

// ============================================
// Feedback
// ============================================
function feedback(texto, tipo) {
  const el = $("cons-qr-feedback");
  if (!el) return;
  el.textContent = texto;
  el.className = tipo ? `cons-form-feedback ${tipo}` : "cons-form-feedback";
}