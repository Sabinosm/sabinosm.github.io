// feedback.js
//
// Helper compartilhado para exibir mensagens de feedback ao usuário
// (erro, sucesso, info) como um "toast" que desce do topo da tela,
// fica visível por ~2s e esmaece. Seguro contra XSS (usa textContent).
//
// Autocontido: o container e o CSS são criados/injetados por este arquivo,
// então funciona igual em qualquer página, sem precisar de HTML ou CSS prévio.
//
// Uso:
//   import { exibirMensagem } from "/js/shared/feedback.js";
//   exibirMensagem("Login realizado com sucesso!", "sucesso");
//   exibirMensagem("Senha incorreta.", "erro");
//   exibirMensagem("Verifique seu e-mail.", "info", 3500); // duração opcional (ms)

const DURACAO_PADRAO_MS = 2000; // tempo visível antes de esmaecer
const ANIMACAO_MS = 350;        // tempo da entrada/saída

const TIPOS = {
  sucesso: { cor: "#16a34a", icone: "✓" },
  erro: { cor: "#dc2626", icone: "!" },
  info: { cor: "#2563eb", icone: "i" },
};

function injetarEstilos() {
  if (document.getElementById("feedback-toast-estilos")) return;

  const style = document.createElement("style");
  style.id = "feedback-toast-estilos";
  style.textContent = `
    #feedback-toast-container {
      position: fixed;
      top: max(16px, env(safe-area-inset-top));
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      width: min(92vw, 420px);
      pointer-events: none;
    }
    .feedback-toast {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      box-sizing: border-box;
      padding: 12px 16px;
      border-radius: 14px;
      background: #1f2937;
      color: #fff;
      font: 500 14px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      border-left: 5px solid var(--toast-cor);
      opacity: 0;
      transform: translateY(-24px);
      transition: opacity ${ANIMACAO_MS}ms ease, transform ${ANIMACAO_MS}ms ease;
    }
    .feedback-toast.visivel {
      opacity: 1;
      transform: translateY(0);
    }
    .feedback-toast__icone {
      flex: 0 0 auto;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--toast-cor);
      display: grid;
      place-items: center;
      font-size: 13px;
      font-weight: 700;
    }
    @media (prefers-reduced-motion: reduce) {
      .feedback-toast { transition: opacity 150ms linear; transform: none; }
    }
  `;
  document.head.appendChild(style);
}

function obterContainer() {
  let container = document.getElementById("feedback-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "feedback-toast-container";
    document.body.appendChild(container);
  }
  return container;
}

export function exibirMensagem(texto, tipo = "info", duracao = DURACAO_PADRAO_MS) {
  injetarEstilos();
  const container = obterContainer();
  const config = TIPOS[tipo] || TIPOS.info;

  const toast = document.createElement("div");
  toast.className = "feedback-toast";
  toast.style.setProperty("--toast-cor", config.cor);
  // erro avisa o leitor de tela na hora; os demais esperam uma pausa
  toast.setAttribute("role", tipo === "erro" ? "alert" : "status");

  const icone = document.createElement("span");
  icone.className = "feedback-toast__icone";
  icone.setAttribute("aria-hidden", "true");
  icone.textContent = config.icone;

  const mensagem = document.createElement("span");
  mensagem.textContent = texto; // textContent impede injeção de HTML malicioso (XSS)

  toast.append(icone, mensagem);
  container.appendChild(toast);

  // força o navegador a registrar o estado inicial antes de animar a entrada
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add("visivel"));
  });

  // após a duração, esmaece e remove do DOM
  setTimeout(() => {
    toast.classList.remove("visivel");
    setTimeout(() => toast.remove(), ANIMACAO_MS + 50);
  }, ANIMACAO_MS + duracao);
}