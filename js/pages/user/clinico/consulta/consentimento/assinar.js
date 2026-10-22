// assinar.js
//
// Página PÚBLICA de assinatura do termo LGPD (paciente no celular, aberta
// pelo QR code: assinar.html?token=...). Sem login: o token é a autenticação.
//
// Passos da tela:
//   1. carrega o termo (GET /assinar/<token>): nome, CPF mascarado, texto,
//      escopos opcionais, hash do PDF e validade do link;
//   2. o paciente rola o texto até o fim: só então as duas confirmações são
//      liberadas (se o texto cabe na tela, já nasce liberado);
//   3. marca as confirmações, escolhe os usos opcionais (escopos) e desenha a
//      assinatura num canvas;
//   4. envia (POST /assinar/<token>) e vê a confirmação, com o link da
//      própria cópia em PDF (janela curta, definida pelo back).
//
// O back valida tudo de novo (hash do termo, PNG, checkboxes, validade); aqui
// é só para não deixar enviar o que sabidamente vai ser recusado.
//
// Não enviamos geolocalização nem user-agent: ambos são opcionais no schema e
// o back usa o User-Agent do próprio request. `hash_pdf_original` volta
// exatamente como veio no GET (o back confere se o termo não mudou).

import { exibirMensagem } from "/js/shared/feedback.js";
import {
  ApiError, enviarAssinatura, obterDadosAssinatura, urlComprovante, urlTermoPdf,
} from "./assinarApi.js";

const LARGURA_CANVAS = 600;
const ALTURA_CANVAS = 220;
const MIN_PONTOS_ASSINATURA = 12; // evita aceitar um toque acidental como assinatura
const MARGEM_ROLAGEM_PX = 8;

const $ = (id) => document.getElementById(id);

const token = new URLSearchParams(window.location.search).get("token");

let dados = null;
let expiraEm = null;
let timerRelogio = null;
let termoLido = false;
let pontos = 0;            // pontos desenhados; > MIN = tem assinatura
let enviando = false;
let encerrada = false;     // link expirou ou assinatura concluída

// ============================================
// Início
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
  if (!token) {
    mostrarErro("Link inválido", "O endereço não traz o código de assinatura. Peça um novo QR code a quem está atendendo você.");
    return;
  }

  try {
    const resposta = await obterDadosAssinatura(token);
    dados = resposta.data;
  } catch (erro) {
    mostrarErro(tituloDoErro(erro), erro instanceof ApiError ? erro.message : "Não foi possível abrir o termo.");
    return;
  }

  preencher(dados);
  configurarCanvas();
  configurarFormulario();

  $("ass-carregando").hidden = true;
  $("ass-form").hidden = false;
  verificarRolagem();
  atualizarBotao();
});

function tituloDoErro(erro) {
  if (!(erro instanceof ApiError)) return "Não foi possível abrir o termo";
  if (erro.status === 404) return "Link inválido";
  if (erro.status === 409) return "Termo já assinado";
  if (erro.status === 400 || erro.status === 410) return "Link expirado";
  return "Não foi possível abrir o termo";
}

function mostrarErro(titulo, texto) {
  $("ass-carregando").hidden = true;
  $("ass-form").hidden = true;
  $("ass-sucesso").hidden = true;
  $("ass-erro-titulo").textContent = titulo;
  $("ass-erro-texto").textContent = texto;
  $("ass-erro").hidden = false;
}

// ============================================
// Preenchimento da tela
// ============================================
function preencher(d) {
  $("ass-nome").textContent = d.paciente_nome ?? "";
  $("ass-cpf").textContent = d.paciente_cpf ?? "";
  $("ass-versao").textContent = d.versao_termo ?? "";
  renderizarTermo($("ass-termo"), d.texto_termo ?? "");
  $("ass-pdf").href = urlTermoPdf(token);

  const escopos = Array.isArray(d.escopos_disponiveis) ? d.escopos_disponiveis : [];
  $("ass-secao-escopos").hidden = escopos.length === 0;
  const lista = $("ass-escopos");
  lista.innerHTML = "";
  escopos.forEach((e) => {
    const rotulo = document.createElement("label");
    rotulo.className = "ass-check";

    const caixa = document.createElement("input");
    caixa.type = "checkbox";
    caixa.name = "escopo";
    caixa.value = e.codigo;

    const texto = document.createElement("span");
    texto.textContent = e.descricao;

    rotulo.append(caixa, texto);
    lista.appendChild(rotulo);
  });

  expiraEm = paraDataUtc(d.expira_em);
  iniciarRelogio();
}

/**
 * O texto do termo vem em markdown simples (como em termo_<versao>.txt):
 * "# título", "## seção", "- item" e parágrafos. Monta só com textContent,
 * sem innerHTML, então nada do texto vira HTML.
 */
function renderizarTermo(container, texto) {
  container.innerHTML = "";
  let lista = null;
  let aposTitulo = false;

  const fecharLista = () => { lista = null; };

  texto.split(/\r?\n/).forEach((bruta) => {
    const linha = bruta.trim();
    if (!linha) return;

    if (linha.startsWith("- ")) {
      if (!lista) {
        lista = document.createElement("ul");
        container.appendChild(lista);
      }
      const item = document.createElement("li");
      item.textContent = linha.slice(2);
      lista.appendChild(item);
      return;
    }

    fecharLista();
    let el;
    if (linha.startsWith("## ")) {
      el = document.createElement("h3");
      el.textContent = linha.slice(3);
    } else if (linha.startsWith("# ")) {
      el = document.createElement("h2");
      el.textContent = linha.slice(2);
      aposTitulo = true;
    } else {
      el = document.createElement("p");
      el.textContent = linha;
      if (aposTitulo) {
        el.className = "ass-termo-sub"; // linha logo abaixo do título (versão e lei)
        aposTitulo = false;
      }
    }
    container.appendChild(el);
  });
}

/** Sem offset no ISO (MySQL devolve DATETIME sem fuso), assume UTC: é como o back grava. */
function paraDataUtc(iso) {
  if (!iso) return null;
  const temFuso = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
  const d = new Date(temFuso ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ============================================
// Validade do link
// ============================================
function iniciarRelogio() {
  atualizarRelogio();
  timerRelogio = setInterval(atualizarRelogio, 1000);
}

function atualizarRelogio() {
  if (!expiraEm || encerrada) return;
  const restanteMs = expiraEm.getTime() - Date.now();
  if (restanteMs <= 0) {
    clearInterval(timerRelogio);
    encerrada = true;
    mostrarErro("Link expirado", "O tempo para assinar terminou. Peça um novo QR code a quem está atendendo você.");
    return;
  }
  const total = Math.ceil(restanteMs / 1000);
  $("ass-relogio").textContent = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ============================================
// Leitura do termo (rolagem) e liberação das confirmações
// ============================================
function configurarFormulario() {
  $("ass-termo").addEventListener("scroll", verificarRolagem, { passive: true });
  window.addEventListener("resize", verificarRolagem);
  $("ass-confirmo").addEventListener("change", atualizarBotao);
  $("ass-declaro").addEventListener("change", atualizarBotao);
  $("ass-form").addEventListener("submit", aoEnviar);
}

function verificarRolagem() {
  if (termoLido) return;
  const el = $("ass-termo");
  const chegouAoFim = el.scrollTop + el.clientHeight >= el.scrollHeight - MARGEM_ROLAGEM_PX;
  if (!chegouAoFim) return;

  termoLido = true;
  $("ass-confirmo").disabled = false;
  $("ass-declaro").disabled = false;
  const dica = $("ass-dica-rolar");
  dica.textContent = "Você chegou ao fim do termo.";
  dica.classList.add("ass-dica--ok");
  atualizarBotao();
}

function atualizarBotao() {
  const pronto =
    termoLido &&
    $("ass-confirmo").checked &&
    $("ass-declaro").checked &&
    pontos >= MIN_PONTOS_ASSINATURA &&
    !enviando &&
    !encerrada;
  $("ass-enviar").disabled = !pronto;
}

// ============================================
// Canvas de assinatura (ponteiro: dedo, caneta ou mouse)
// ============================================
function configurarCanvas() {
  const canvas = $("ass-canvas");
  canvas.width = LARGURA_CANVAS;
  canvas.height = ALTURA_CANVAS;

  const ctx = canvas.getContext("2d");
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111111";

  let desenhando = false;

  // o canvas é desenhado em 600x220 e exibido em outro tamanho (CSS): converte as coordenadas
  const ponto = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * canvas.width) / r.width,
      y: ((e.clientY - r.top) * canvas.height) / r.height,
    };
  };

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    desenhando = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = ponto(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y); // um toque vira um ponto
    ctx.stroke();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!desenhando) return;
    e.preventDefault();
    const { x, y } = ponto(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    pontos += 1;
    if (pontos === MIN_PONTOS_ASSINATURA) atualizarBotao();
  });

  const parar = () => { desenhando = false; };
  canvas.addEventListener("pointerup", parar);
  canvas.addEventListener("pointercancel", parar);
  canvas.addEventListener("pointerleave", parar);

  $("ass-limpar").addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pontos = 0;
    atualizarBotao();
  });
}

// ============================================
// Envio
// ============================================
async function aoEnviar(e) {
  e.preventDefault();
  if (enviando || encerrada) return;


  if (!termoLido) return exibirMensagem("Role o termo até o fim antes de assinar.", "erro");
  if (!$("ass-confirmo").checked || !$("ass-declaro").checked) return exibirMensagem("Marque as duas confirmações.", "erro");
  if (pontos < MIN_PONTOS_ASSINATURA) return exibirMensagem("Desenhe a sua assinatura no quadro.", "erro");

  const escopos = [...document.querySelectorAll('input[name="escopo"]:checked')].map((c) => c.value);

  enviando = true;
  atualizarBotao();
  $("ass-enviar").textContent = "Enviando…";

  try {
    const resposta = await enviarAssinatura(token, {
      confirmo_identidade: true,
      declaro_consentimento: true,
      assinatura_canvas: $("ass-canvas").toDataURL("image/png"),
      hash_pdf_original: dados.hash_pdf_original,
      escopos_selecionados: escopos,
    });
    concluir(resposta.data);
  } catch (erro) {
    exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível enviar a assinatura.", "erro");
    enviando = false;
    $("ass-enviar").textContent = "Assinar o termo";
    atualizarBotao();
  }
}

function concluir(resultado) {
  encerrada = true;
  clearInterval(timerRelogio);

  $("ass-form").hidden = true;
  $("ass-erro").hidden = true;
  $("ass-sucesso").hidden = false;

  $("ass-copia").href = urlComprovante(token);

  const ate = paraDataUtc(resultado?.copia_valida_ate);
  $("ass-copia-aviso").textContent = ate
    ? `A cópia fica disponível aqui até ${ate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Depois disso, peça uma cópia à clínica.`
    : "A cópia fica disponível por pouco tempo. Depois disso, peça uma cópia à clínica.";
}