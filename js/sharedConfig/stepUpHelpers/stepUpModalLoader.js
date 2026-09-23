// stepUpHelpers/stepUpModalLoader.js
//
// Carregamento sob demanda do partial do modal
// (mesmo padrão de settingsLoader.js: HTML injetado uma vez, cacheado
// via módulo -- chamadas repetidas a pedirConfirmacao() reusam o
// mesmo modal já no DOM).

const PARTIAL_PATH = "../../../../html/pages/user/stepupModal.html";
let modalCarregadoPromise = null;

export function garantirModalCarregado() {
  if (modalCarregadoPromise) return modalCarregadoPromise;

  modalCarregadoPromise = (async () => {
    const resposta = await fetch(PARTIAL_PATH);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status} ao carregar stepUpModal.html`);
    const html = await resposta.text();
    document.body.insertAdjacentHTML("beforeend", html);
  })();

  return modalCarregadoPromise;
}