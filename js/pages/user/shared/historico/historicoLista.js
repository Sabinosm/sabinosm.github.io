// historicoLista.js
//
// Estado e renderização da lista do histórico. Paginação por "Carregar mais" (acumula; o back devolve
// tem_mais e proximo_offset). A busca por nome é no cliente e só enxerga o que já foi carregado:
// quando nada casa e ainda há mais páginas, a tela diz isso e oferece carregar mais.
// `geracao` descarta resposta atrasada (trocou filtro no meio de uma carga).

import { criarEstadoVazio, normalizarTexto, nomePaciente } from "../../clinico/consulta/consultaHelpers.js";
import { listarHistorico } from "./historicoApi.js";
import { criarCardHistorico } from "./historicoCard.js";
import { POR_PAGINA, el } from "./historicoHelpers.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

export const estado = {
  itens: [],
  proximoOffset: 0,
  temMais: false,
  carregando: false,
  falhou: false,
  filtros: {},      // { status, desfecho, abertas, dataInicio, dataFim }
  busca: "",
};

let geracao = 0;
let alvoLista = null;
let alvoMais = null;

export function iniciarLista(listaEl, maisEl) {
  alvoLista = listaEl;
  alvoMais = maisEl;
}

export function definirFiltros(filtros) {
  estado.filtros = filtros;
  return carregar({ reiniciar: true });
}

export function definirBusca(texto) {
  estado.busca = normalizarTexto(texto);
  desenhar();
}

export const carregarMais = () => carregar({ reiniciar: false });

async function carregar({ reiniciar }) {
  const minha = ++geracao;
  if (reiniciar) {
    estado.itens = [];
    estado.proximoOffset = 0;
    estado.temMais = false;
  }
  estado.carregando = true;
  estado.falhou = false;
  desenhar();

  try {
    const resp = await listarHistorico({ limit: POR_PAGINA, offset: estado.proximoOffset, ...estado.filtros });
    if (minha !== geracao) return;
    const pagina = resp.data ?? {};
    estado.itens.push(...(pagina.itens ?? []));
    estado.temMais = Boolean(pagina.tem_mais);
    estado.proximoOffset = pagina.proximo_offset ?? estado.proximoOffset + (pagina.itens?.length ?? 0);
  } catch (erro) {
    if (minha !== geracao) return;
    estado.falhou = true;
    exibirMensagem(erro?.name === "ApiError" ? erro.message : "Não foi possível carregar o histórico.", "erro");
  } finally {
    if (minha === geracao) {
      estado.carregando = false;
      desenhar();
    }
  }
}

const casaComBusca = (c) => !estado.busca || normalizarTexto(nomePaciente(c).texto).includes(estado.busca);

export function desenhar() {
  if (!alvoLista) return;
  alvoLista.replaceChildren();
  alvoMais.replaceChildren();

  const visiveis = estado.itens.filter(casaComBusca);
  visiveis.forEach((c) => alvoLista.appendChild(criarCardHistorico(c)));

  if (estado.carregando && !estado.itens.length) {
    alvoLista.appendChild(el("p", "hist-meta", "Carregando histórico…"));
    return;
  }
  if (estado.falhou && !estado.itens.length) {
    alvoLista.appendChild(criarEstadoVazio("Não foi possível carregar", "Tente de novo em instantes."));
    alvoMais.appendChild(botaoMais("Tentar de novo"));
    return;
  }
  if (!estado.itens.length) {
    alvoLista.appendChild(criarEstadoVazio("Nenhuma consulta no histórico",
      "Aparecem aqui as consultas que você iniciou ou em que atendeu."));
    return;
  }
  if (!visiveis.length) {
    alvoLista.appendChild(criarEstadoVazio("Nenhum paciente encontrado",
      estado.temMais ? "A busca vale para as consultas já carregadas. Carregue mais para continuar procurando."
                     : "Nenhuma consulta carregada corresponde à busca."));
  }
  if (estado.temMais) alvoMais.appendChild(botaoMais(estado.carregando ? "Carregando…" : "Carregar mais"));
  else if (estado.itens.length > POR_PAGINA) alvoMais.appendChild(el("p", "hist-meta", "Fim do histórico."));
}

function botaoMais(texto) {
  const b = el("button", "btn-ghost", texto);
  b.type = "button";
  b.disabled = estado.carregando;
  b.addEventListener("click", carregarMais);
  return b;
}