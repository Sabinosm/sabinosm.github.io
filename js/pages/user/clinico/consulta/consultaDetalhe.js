// consultaDetalhe.js
//
// Entry point e orquestrador da página de detalhe de UMA consulta
// (?uuid=...). Carrega a consulta e a situação do consentimento,
// preenche a tela e liga/desliga os botões conforme o estado:
//
//   aberta + consentimento pendente  -> coletar termo / dispensar
//   aberta + consentimento válido    -> "Ir para atendimento" liberado
//   aberta                           -> encerrar / evadir
//   encerrada                        -> só leitura (banner com o desfecho)
//
// Os modais vivem em módulos próprios, que se ligam sozinhos no
// DOMContentLoaded e leem o uuid da URL:
//   consultaConsentimento.js -> dispensa por emergência (e, depois, o QR code)
//   consultaAcoes.js         -> encerrar e evadir
// Quando uma ação dá certo eles disparam EVENTO_CONSULTA_ALTERADA e
// esta página recarrega (sem import circular).
//
// Contrato da API usado aqui:
//   GET /consultas/<uuid>              -> Consulta.to_dict() (+ `paciente`, proposto)
//   GET /consultas/<uuid>/consentimento -> { valido, situacao }
// `consulta.paciente` ({uuid, nome, nao_identificado, anonimizado}) vem
// de um ajuste de back (ver ajustes_back_consulta_detalhe.md); sem ele
// o título cai no uuid curto do paciente.

import "./consultaConsentimento.js";
import "./consultaAcoes.js";
import { ApiError, buscarConsulta, situacaoConsentimento } from "./consultaApi.js";
import {
  DESFECHO_LABELS, EVENTO_CONSULTA_ALTERADA, ORIGEM_LABELS,
  criarBadgeConsentimento, criarChipStatus, criarEstadoVazio,
  exibirAviso, focoDaUrl, formatarDataHora, label, nomePaciente,
  urlAtendimento, urlLista, uuidDaUrl,
} from "./consultaHelpers.js";
import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";

const TEXTO_CONSENTIMENTO = {
  pendente: "Nenhum atendimento pode ser aberto até que o termo seja coletado ou a dispensa por emergência seja registrada.",
  ativo: "Termo de consentimento registrado. Atendimentos liberados.",
  dispensado_emergencia: "Dispensado por emergência. Atendimentos liberados.",
};

const $ = (id) => document.getElementById(id);

let focoPendente = focoDaUrl(); // consumido na primeira carga

document.addEventListener("DOMContentLoaded", () => {
  iniciarPagina();

  document.addEventListener(EVENTO_CONSULTA_ALTERADA, () => carregar());

  if (!uuidDaUrl()) {
    mostrarErro("Consulta não informada", "Abra uma consulta pela lista.");
    return;
  }
  carregar();
});

// ============================================
// Carregamento
// ============================================
async function carregar() {
  const uuid = uuidDaUrl();
  if (!uuid) return;

  try {
    const [respConsulta, respConsent] = await Promise.all([
      buscarConsulta(uuid),
      situacaoConsentimento(uuid),
    ]);
    const consulta = respConsulta.data;
    const consentimento = respConsent.data?.situacao ?? "pendente";

    $("cons-det-erro").hidden = true;
    $("cons-det-conteudo").hidden = false;
    renderizar(consulta, consentimento);
    aplicarFoco(consulta);
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : "Não foi possível carregar a consulta.";
    mostrarErro("Não foi possível carregar a consulta", mensagem);
  }
}

function mostrarErro(titulo, texto) {
  $("cons-det-conteudo").hidden = true;
  const caixa = $("cons-det-erro");
  caixa.hidden = false;
  caixa.innerHTML = "";
  caixa.appendChild(criarEstadoVazio(titulo, texto));

  const voltar = document.createElement("a");
  voltar.className = "btn-ghost cons-btn-link";
  voltar.href = urlLista();
  voltar.textContent = "Voltar para as consultas";
  caixa.appendChild(voltar);
}

/** ?foco=encerrar (vindo do aviso de consulta duplicada) abre o modal de encerrar uma única vez. */
function aplicarFoco(consulta) {
  const foco = focoPendente;
  focoPendente = null;
  if (foco === "encerrar" && consulta.status_consulta !== "encerrada") {
    $("cons-btn-encerrar")?.click();
  }
}

// ============================================
// Renderização
// ============================================
function renderizar(c, consentimento) {
  const aberta = c.status_consulta !== "encerrada";
  const consentimentoValido = consentimento !== "pendente";

  // --- cabeçalho
  const { texto, especial } = nomePaciente(c);
  const titulo = $("cons-det-nome");
  titulo.textContent = texto;
  titulo.classList.toggle("cons-nome--especial", especial);
  $("cons-det-subtitulo").textContent = `Consulta iniciada em ${formatarDataHora(c.data_hora_inicio)}`;

  const chip = $("cons-det-status");
  chip.innerHTML = "";
  chip.appendChild(criarChipStatus(c.status_consulta));

  // --- resumo
  $("cons-det-inicio").textContent = formatarDataHora(c.data_hora_inicio);
  $("cons-det-origem").textContent = label(ORIGEM_LABELS, c.origem_encaminhamento);
  $("cons-det-fim-bloco").hidden = !c.data_hora_fim;
  $("cons-det-fim").textContent = formatarDataHora(c.data_hora_fim);
  $("cons-det-desfecho-bloco").hidden = !c.desfecho_final;
  $("cons-det-desfecho").textContent = label(DESFECHO_LABELS, c.desfecho_final);

  // --- banner de encerrada
  $("cons-banner-encerrada").hidden = aberta;
  if (!aberta) {
    $("cons-banner-encerrada-texto").textContent = c.desfecho_final
      ? `Desfecho: ${label(DESFECHO_LABELS, c.desfecho_final)}.`
      : "";
  }

  // --- consentimento
  const badge = $("cons-consent-badge");
  badge.innerHTML = "";
  badge.appendChild(criarBadgeConsentimento(consentimento));
  $("cons-consent-texto").textContent = TEXTO_CONSENTIMENTO[consentimento] ?? "";
  $("cons-consent-acoes").hidden = !(aberta && consentimento === "pendente");

  // --- atendimentos (a lista e a escolha do tipo ficam na página de atendimento, Bloco 2)
  const irAtendimento = $("cons-ir-atendimento");
  $("cons-atend-acoes").hidden = !aberta;
  if (aberta) {
    irAtendimento.href = urlAtendimento(c.uuid);
    irAtendimento.setAttribute("aria-disabled", String(!consentimentoValido));
    if (!consentimentoValido) irAtendimento.removeAttribute("href");
  }
  $("cons-atend-aviso").textContent = !aberta
    ? "Consulta encerrada: não é possível abrir novos atendimentos."
    : consentimentoValido
      ? "Os atendimentos desta consulta (triagem, avaliação médica e outros) são registrados na página de atendimento."
      : "Registre o consentimento ou a dispensa por emergência para liberar os atendimentos.";

  // --- ações
  $("cons-painel-acoes").hidden = !aberta;

  // mensagem de uma ação anterior continua visível; só limpa se era de erro de carga
  if (document.getElementById("cons-det-feedback")?.classList.contains("erro")) exibirAviso("", "");
}