// atendimentoProtocoloSelect.js
//
// Select de protocolos do atendimento, compartilhado pelas abas de coleta e de
// conduta: protocolos LIBERADOS pela empresa, favoritos do profissional num
// grupo no topo e rótulos com padrão/obrigatório.
//
// Entrada: itens de GET .../protocolos-disponiveis. Além do catálogo, cada um
// traz favorito (true/false), default_pessoal e padrao_institucional (escopo em
// que é padrão, ou null) e politica ("obrigatorio"/"opcional"). O back já
// ordena os favoritos primeiro.
//
// Só DOM básico: sem fetch, sem estado de página (quem chama passa a lista).

/** Escopo de uso do atendimento (mesmo mapa do back: triagem -> triagem, o resto -> consulta). */
export function escopoDoAtendimentoDe(atendimento) {
  return atendimento?.tipo_atendimento === "triagem" ? "triagem" : "consulta";
}

const servePara = (escopoDoProtocolo, escopo) => escopoDoProtocolo === escopo || escopoDoProtocolo === "ambos";

/** Padrão a pré-selecionar: o PESSOAL do escopo; sem ele, o da INSTITUIÇÃO. */
export function protocoloPadraoDe(protocolos, escopo) {
  return protocolos.find((p) => p.default_pessoal && servePara(p.default_pessoal, escopo))
    ?? protocolos.find((p) => p.padrao_institucional && servePara(p.padrao_institucional, escopo))
    ?? null;
}

export function rotuloProtocolo(p, escopo) {
  const nome = p.nome_protocolo ?? p.sigla ?? p.uuid;
  let texto = `${p.favorito ? "★ " : ""}${nome}`;
  if (p.sigla && p.sigla !== nome) texto += ` (${p.sigla})`;
  const partes = [texto];
  if (p.default_pessoal && servePara(p.default_pessoal, escopo)) partes.push("meu padrão");
  else if (p.padrao_institucional && servePara(p.padrao_institucional, escopo)) partes.push("padrão da instituição");
  if (p.politica === "obrigatorio") partes.push("obrigatório");
  return partes.join(" · ");
}

function opcao(valor, texto, selecionado) {
  const opt = document.createElement("option");
  opt.value = valor;
  opt.textContent = texto;
  if (selecionado) opt.selected = true;
  return opt;
}

/**
 * Preenche o <select>. Favoritos num grupo próprio, no topo; o resto abaixo.
 * O placeholder tem value "" (sem isso o value seria o próprio texto, que é truthy).
 *
 * @param opcoes.selecionado   uuid a marcar
 * @param opcoes.escopo        escopo do atendimento (para os rótulos de padrão)
 * @param opcoes.placeholder   texto da opção vazia
 * @param opcoes.textoVazio    texto quando não há nenhum protocolo liberado
 */
export function preencherSelect(select, protocolos, {
  selecionado = null,
  escopo = "consulta",
  placeholder = "Selecione o protocolo",
  textoVazio = "Nenhum protocolo liberado para este atendimento",
} = {}) {
  select.innerHTML = "";
  select.appendChild(opcao("", protocolos.length ? placeholder : textoVazio, false));
  select.disabled = protocolos.length === 0;

  const item = (p) => opcao(p.uuid, rotuloProtocolo(p, escopo), p.uuid === selecionado);
  const favoritos = protocolos.filter((p) => p.favorito);
  if (!favoritos.length) {
    protocolos.forEach((p) => select.appendChild(item(p)));
    return;
  }

  const gFav = document.createElement("optgroup");
  gFav.label = "★ Meus favoritos";
  favoritos.forEach((p) => gFav.appendChild(item(p)));
  select.appendChild(gFav);

  const outros = protocolos.filter((p) => !p.favorito);
  if (outros.length) {
    const gOutros = document.createElement("optgroup");
    gOutros.label = "Outros protocolos liberados";
    outros.forEach((p) => gOutros.appendChild(item(p)));
    select.appendChild(gOutros);
  }
}
