import { URL_BASE_API } from "../../../../urlConfig.js";

/**
 * Chama uma rota de estatísticas e devolve só o `data` do envelope
 * padrão ({status, message, data}), já validado. Toda rota sob
 * /estatisticas segue o mesmo formato (json_success/json_error do
 * backend), então centralizamos aqui em vez de repetir o parse em
 * cada card/gráfico.
 */
export async function buscarEstatistica(caminho, params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${URL_BASE_API}/estatisticas${caminho}${query ? `?${query}` : ""}`;

  const resposta = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  const corpo = await resposta.json();

  if (!resposta.ok || corpo.status !== "success") {
    throw new Error(corpo.message || `Falha ao buscar ${caminho} (status ${resposta.status})`);
  }

  return corpo.data;
}