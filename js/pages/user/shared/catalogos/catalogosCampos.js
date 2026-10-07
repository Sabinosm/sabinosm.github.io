// catalogosCampos.js
//
// Renderizador ÚNICO dos campos de entrada de um protocolo (só leitura --
// quem preenche o formulário é a página de consultas). Serve a todas as
// famílias porque cada adaptador (familias/*.js) normaliza o que o back
// devolve para o mesmo formato:
//
//   { codigo, rotulo, tipo, unidade, opcoes: string[], min, max,
//     obrigatorio: boolean | null, usadoEm?: string[] }
//
// Dois formatos de origem:
//   - lista de campos de um protocolo (/news2/<uuid>/campos):
//       { campo, texto, tipo_campo, opcoes }
//   - campo de módulo (/composicao, VariavelClinica + obrigatoriedade):
//       { codigo, nome, tipo_dado, unidade, opcoes, valor_min, valor_max, obrigatorio }
//
// O formato de `opcoes` não é fixo no back: aceita lista de textos, lista
// de objetos ({rotulo|texto|label|nome|valor}) ou mapa {valor: rotulo}.

import { rotuloTipoCampo } from "./catalogosLabels.js";
import { criarBadge } from "./catalogosUi.js";

const ALIAS_TIPO = {
  numerico: 'numerico', numero: 'numerico', number: 'numerico', numeric: 'numerico',
  categorico: 'categorico', enum: 'categorico', select: 'categorico', categorica: 'categorico',
  booleano: 'booleano', boolean: 'booleano', bool: 'booleano',
};

function normalizarTipo(valor) {
  if (!valor) return null;
  return ALIAS_TIPO[String(valor).toLowerCase()] ?? String(valor);
}

export function normalizarOpcoes(opcoes) {
  if (opcoes === null || opcoes === undefined) return [];

  let lista;
  if (Array.isArray(opcoes)) {
    lista = opcoes;
  } else if (typeof opcoes === 'object') {
    // mapa {valor: rotulo} -- mostra o rótulo se for texto, senão a chave
    lista = Object.entries(opcoes).map(([chave, valor]) =>
      (typeof valor === 'string' ? valor : chave));
  } else {
    lista = [opcoes];
  }

  return lista.map(item => {
    if (item !== null && typeof item === 'object') {
      return String(item.rotulo ?? item.texto ?? item.label ?? item.nome ?? item.valor ?? JSON.stringify(item));
    }
    return String(item);
  });
}

/** { campo, texto, tipo_campo, opcoes } -> formato comum. */
export function campoDeLista(c) {
  return {
    codigo: c.campo,
    rotulo: c.texto ?? c.campo,
    tipo: normalizarTipo(c.tipo_campo),
    unidade: null,
    opcoes: normalizarOpcoes(c.opcoes),
    min: null,
    max: null,
    obrigatorio: null,
  };
}

/** Campo de módulo (VariavelClinica + obrigatorio) -> formato comum. */
export function campoDeModulo(c) {
  return {
    codigo: c.codigo,
    rotulo: c.nome ?? c.codigo,
    tipo: normalizarTipo(c.tipo_dado),
    unidade: c.unidade ?? null,
    opcoes: normalizarOpcoes(c.opcoes),
    min: c.valor_min ?? null,
    max: c.valor_max ?? null,
    obrigatorio: c.obrigatorio ?? null,
  };
}

function formatarNumero(n) {
  return Number(n).toLocaleString('pt-BR');
}

function descreverFaixa(min, max) {
  if (min !== null && max !== null) return `${formatarNumero(min)} a ${formatarNumero(max)}`;
  if (min !== null) return `a partir de ${formatarNumero(min)}`;
  if (max !== null) return `até ${formatarNumero(max)}`;
  return null;
}

function criarEl(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

/** Lista detalhada de campos (um cartão por campo). */
export function criarListaCampos(campos) {
  const ul = criarEl('ul', 'detalhe-campos');

  campos.forEach(campo => {
    const li = criarEl('li', 'detalhe-campo');

    const topo = criarEl('div', 'detalhe-campo-topo');
    topo.appendChild(criarEl('span', 'detalhe-campo-rotulo', campo.rotulo ?? '—'));
    if (campo.codigo && campo.codigo !== campo.rotulo) {
      topo.appendChild(criarEl('span', 'detalhe-campo-codigo', campo.codigo));
    }
    if (campo.tipo) topo.appendChild(criarBadge(rotuloTipoCampo(campo.tipo)));
    if (campo.obrigatorio === true) topo.appendChild(criarBadge('Obrigatório', 'catalog-badge--info'));
    li.appendChild(topo);

    const meta = [];
    if (campo.unidade) meta.push(`Unidade: ${campo.unidade}`);
    const faixa = descreverFaixa(campo.min, campo.max);
    if (faixa) meta.push(`Faixa: ${faixa}`);
    if (campo.usadoEm?.length) meta.push(`Usado em: ${campo.usadoEm.join(', ')}`);
    if (meta.length) li.appendChild(criarEl('div', 'detalhe-campo-meta', meta.join(' · ')));

    if (campo.opcoes?.length) {
      const chips = criarEl('div', 'detalhe-chips');
      campo.opcoes.forEach(o => chips.appendChild(criarEl('span', 'detalhe-chip', o)));
      li.appendChild(chips);
    }

    ul.appendChild(li);
  });

  return ul;
}

/** Versão compacta (só os nomes) -- usada dentro do cartão de cada módulo. */
export function criarChipsCampos(campos) {
  const chips = criarEl('div', 'detalhe-chips');
  campos.forEach(campo => {
    const chip = criarEl('span',
      `detalhe-chip${campo.obrigatorio ? ' detalhe-chip--obrigatorio' : ''}`,
      campo.rotulo ?? campo.codigo ?? '—');
    chip.title = campo.obrigatorio ? 'Campo obrigatório' : 'Campo opcional';
    chips.appendChild(chip);
  });
  return chips;
}